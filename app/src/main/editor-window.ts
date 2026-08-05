import { randomUUID } from "crypto";
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import fs = require("fs");
import fsp = require("fs/promises");
import path = require("path");
import logger = require("./logger");
import { getPetsDir } from "./project-paths";
import EditorProjectAccess, { type EditorProjectGrant } from "./editor-project-access";
import { hardenLocalWindow, localWindowWebPreferences } from "./window-security";
import {
  type EditorLayoutState,
  type EditorPreviewState,
  type EditorRecentDocument,
  type EditorReadResult,
  type EditorSaveResult,
  type ModernPetDocument,
} from "../editor/types";
import { mergeLayout } from "../editor/layout";
import { normalizeDocument, serializeDocument } from "../editor/document";
import { validateDocumentStructure } from "../editor/validation";

const log = logger.createLogger("editor-window");
const DEFAULT_EDITOR_SIZE = { width: 1280, height: 820 };
const DEFAULT_EDITOR_MIN_SIZE = { width: 900, height: 600 };
const MAX_RECENT_DOCS = 10;
const LAYOUT_SUFFIX = ".clod-pet-editor.json";

interface ReadDocumentResultInternal {
  documentPath: string;
  petDir: string;
  document: ModernPetDocument;
  layout: EditorLayoutState;
  previews: EditorPreviewState;
}

interface SavePayload {
  documentPath: string;
  document: ModernPetDocument;
  layout?: EditorLayoutState;
  previews?: EditorPreviewState;
}

function errorType(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}

class EditorWindowManager {
  private window: BrowserWindow | null = null;
  private handlersRegistered = false;
  private bootstrapPath: string | null = null;
  private recentDocuments: EditorRecentDocument[] = [];
  private readonly preloadPath: string;
  private readonly editorHtmlPath: string;
  private readonly recentFilePath: string;
  private readonly access = new EditorProjectAccess();

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;
    this.editorHtmlPath = path.join(__dirname, "..", "..", "editor.html");
    this.recentFilePath = path.join(app.getPath("userData"), "editor-recent.json");
  }

  init() {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    ipcMain.handle("editor:open-pet-directory", async (event) => {
      this.assertEditorSender(event);
      const result = await dialog.showOpenDialog({
        title: "Open Pet Directory",
        defaultPath: getPetsDir(),
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const grant = await this.access.approveSelection(result.filePaths[0]);
      this.bootstrapPath = grant.documentPath;
      return grant.documentPath;
    });

    ipcMain.handle("editor:open-animation-file", async (event) => {
      this.assertEditorSender(event);
      const result = await dialog.showOpenDialog({
        title: "Open animations.json",
        defaultPath: getPetsDir(),
        properties: ["openFile"],
        filters: [{ name: "Pet JSON", extensions: ["json"] }],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const grant = await this.access.approveSelection(result.filePaths[0]);
      this.bootstrapPath = grant.documentPath;
      return grant.documentPath;
    });

    ipcMain.handle("editor:read-document", async (event, input: { path?: string } | string) => {
      this.assertEditorSender(event);
      const requestedPath = typeof input === "string" ? input : input?.path;
      if (!requestedPath) {
        throw new Error("document path is required");
      }
      if (!this.access.isCurrentDocument(requestedPath)) {
        await this.loadRecentDocuments();
        await this.access.approveRecent(requestedPath, this.recentDocuments.map((item) => item.path));
        this.bootstrapPath = this.access.current()?.documentPath || this.bootstrapPath;
      }
      const result = await this.readDocument(requestedPath);
      this.rememberRecentDocument(result.documentPath, result.document);
      await this.persistRecentDocuments();
      return {
        ...result,
        recentDocuments: this.recentDocuments.slice(),
      } satisfies EditorReadResult;
    });

    ipcMain.handle("editor:refresh-document-previews", async (event, input: { documentPath: string; document: ModernPetDocument }) => {
      this.assertEditorSender(event);
      if (!input?.documentPath) {
        throw new Error("document path is required");
      }
      await this.access.requireDocument(input.documentPath);
      const grant = this.requireCurrentGrant();
      const document = normalizeDocument(input.document);
      return this.loadPreviews(document, grant);
    });

    ipcMain.handle("editor:save-document", async (event, input: SavePayload) => {
      this.assertEditorSender(event);
      return this.saveDocument(input, false);
    });

    ipcMain.handle("editor:save-document-as", async (event, input: SavePayload) => {
      this.assertEditorSender(event);
      return this.saveDocument(input, true);
    });

    ipcMain.handle("editor:show-item-in-folder", async (event, targetPath: string) => {
      this.assertEditorSender(event);
      if (!targetPath) return false;
      const approvedPath = await this.access.requireVisiblePath(targetPath);
      shell.showItemInFolder(approvedPath);
      return true;
    });

    ipcMain.handle("editor:get-recent-documents", async (event) => {
      this.assertEditorSender(event);
      await this.loadRecentDocuments();
      return this.recentDocuments.slice();
    });

    ipcMain.handle("editor:get-bootstrap-path", async (event) => {
      this.assertEditorSender(event);
      return this.access.current()?.documentPath || this.bootstrapPath || this.getDefaultDocumentPath();
    });

    ipcMain.handle("editor:close-window", async (event) => {
      this.assertEditorSender(event);
      if (this.window && !this.window.isDestroyed()) {
        this.window.close();
      }
      return true;
    });

    ipcMain.handle("editor:minimize-window", async (event) => {
      this.assertEditorSender(event);
      if (this.window && !this.window.isDestroyed()) {
        this.window.minimize();
      }
      return true;
    });

    ipcMain.handle("editor:zoom-window", async (event) => {
      this.assertEditorSender(event);
      if (this.window && !this.window.isDestroyed()) {
        if (this.window.isMaximized()) {
          this.window.unmaximize();
        } else {
          this.window.maximize();
        }
      }
      return true;
    });
  }

  async show(initialPath?: string) {
    const requestedPath = initialPath || this.access.current()?.documentPath || this.bootstrapPath || this.getDefaultDocumentPath();
    const grant = await this.access.approveSelection(requestedPath);
    this.bootstrapPath = grant.documentPath;
    await this.loadRecentDocuments();

    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      this.sendBootstrap();
      return;
    }

    this.window = new BrowserWindow({
      width: DEFAULT_EDITOR_SIZE.width,
      height: DEFAULT_EDITOR_SIZE.height,
      minWidth: DEFAULT_EDITOR_MIN_SIZE.width,
      minHeight: DEFAULT_EDITOR_MIN_SIZE.height,
      resizable: true,
      minimizable: true,
      maximizable: true,
      show: false,
      frame: false,
      roundedCorners: true,
      hasShadow: true,
      transparent: true,
      backgroundColor: "#00000000",
      title: "Clod Pet - Animation Editor",
      icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
      webPreferences: localWindowWebPreferences(this.preloadPath),
    });
    hardenLocalWindow(this.window);

    this.window.once("ready-to-show", () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.show();
        this.sendBootstrap();
      }
    });
    await this.window.loadFile(this.editorHtmlPath);
    this.window.on("closed", () => {
      this.window = null;
      this.bootstrapPath = null;
      this.access.clear();
    });
  }

  private assertEditorSender(event: IpcMainInvokeEvent) {
    if (!this.window || this.window.isDestroyed() || event.sender !== this.window.webContents) {
      throw new Error("editor request rejected");
    }
  }

  private requireCurrentGrant() {
    const grant = this.access.current();
    if (!grant) throw new Error("editor project approval required");
    return grant;
  }

  private sendBootstrap() {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("editor:bootstrap", {
      path: this.access.current()?.documentPath || this.bootstrapPath || this.getDefaultDocumentPath(),
    });
  }

  private getDefaultDocumentPath() {
    return path.join(getPetsDir(), "eSheep-modern", "animations.json");
  }

  private async readDocument(documentPath: string): Promise<ReadDocumentResultInternal> {
    const resolvedPath = await this.access.requireDocument(documentPath);
    let parsed: ModernPetDocument;
    try {
      const raw = await fsp.readFile(resolvedPath, "utf8");
      parsed = normalizeDocument(JSON.parse(raw) as unknown);
    } catch (error) {
      log.warn("editor document read failed", { errorType: errorType(error) });
      throw new Error("editor document could not be read");
    }
    const grant = this.requireCurrentGrant();
    const savedLayout = await this.loadLayoutSidecar(grant);
    const layout = mergeLayout(parsed, savedLayout);
    const previews = await this.loadPreviews(parsed, grant);
    return {
      documentPath: resolvedPath,
      petDir: grant.root,
      document: parsed,
      layout,
      previews,
    };
  }

  private async saveDocument(input: SavePayload, saveAs: boolean): Promise<EditorSaveResult> {
    if (!input?.documentPath) {
      throw new Error("document path is required");
    }

    const sourcePath = await this.access.requireDocument(input.documentPath);
    const sourceGrant = this.requireCurrentGrant();
    const currentDocument = normalizeDocument(input.document);
    const currentLayout = input.layout || mergeLayout(currentDocument, null);
    const targetGrant = saveAs
      ? await this.access.prepareSaveTarget(await this.promptSaveAsPath(sourcePath))
      : sourceGrant;
    const documentToWrite = saveAs ? this.prepareSaveAsDocument(currentDocument) : currentDocument;

    const previews = await this.loadPreviews(documentToWrite, sourceGrant);
    const validation = validateDocumentStructure(documentToWrite, previews);
    if (validation.errors.length > 0) {
      const message = validation.errors.slice(0, 4).map((issue) => issue.message).join("\n");
      throw new Error(`cannot save invalid document:\n${message}`);
    }
    if (validation.warnings.length > 0) {
      const result = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Save", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: "Save with warnings",
        message: "The document has validation warnings.",
        detail: validation.warnings.slice(0, 6).map((issue) => issue.message).join("\n"),
      });
      if (result.response !== 0) {
        throw new Error("save cancelled");
      }
    }

    try {
      await this.copyReferencedAssets(currentDocument, sourceGrant, targetGrant);
      await this.writeAtomicFile(targetGrant.documentPath, serializeDocument(documentToWrite), targetGrant);
      await this.writeLayoutSidecar(targetGrant, currentLayout);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("editor ")) throw error;
      log.warn("editor document save failed", { errorType: errorType(error) });
      throw new Error("editor document could not be saved");
    }

    if (saveAs) {
      this.access.activate(targetGrant);
      this.bootstrapPath = targetGrant.documentPath;
    }
    this.rememberRecentDocument(targetGrant.documentPath, documentToWrite);
    await this.persistRecentDocuments();

    return {
      documentPath: targetGrant.documentPath,
      petDir: targetGrant.root,
      recentDocuments: this.recentDocuments.slice(),
    };
  }

  private async promptSaveAsPath(currentPath: string): Promise<string> {
    const result = await dialog.showSaveDialog({
      title: "Save Animation Editor Document As",
      defaultPath: currentPath,
      filters: [{ name: "Pet JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) {
      throw new Error("save cancelled");
    }

    if (result.filePath.toLowerCase().endsWith(".json")) {
      return result.filePath;
    }
    return `${result.filePath}.json`;
  }

  private prepareSaveAsDocument(document: ModernPetDocument): ModernPetDocument {
    const next = JSON.parse(JSON.stringify(document)) as ModernPetDocument;
    if (next.image.spritesheet) {
      next.image.spritesheet = path.basename(next.image.spritesheet);
    } else {
      next.image.spritesheet = "spritesheet.png";
    }
    if (next.header.icon) {
      next.header.icon = path.basename(next.header.icon);
    }
    return next;
  }

  private async copyReferencedAssets(document: ModernPetDocument, sourceGrant: EditorProjectGrant, targetGrant: EditorProjectGrant) {
    const assets: Array<{ value: string | undefined; fallbackName: string; field: string }> = [
      { value: document.image.spritesheet, fallbackName: "spritesheet.png", field: "image.spritesheet" },
      { value: document.header.icon, fallbackName: "icon.png", field: "header.icon" },
    ];

    for (const asset of assets) {
      if (!asset.value) continue;
      let sourcePath: string;
      try {
        sourcePath = await this.access.resolveAsset(asset.value, sourceGrant);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("editor ")) throw error;
        throw new Error(`asset is not available for ${asset.field}`);
      }
      const targetPath = await this.access.requireWritablePath(
        path.join(targetGrant.root, path.basename(asset.value || asset.fallbackName)),
        targetGrant,
      );
      if (path.resolve(sourcePath) === path.resolve(targetPath)) {
        continue;
      }
      await fsp.copyFile(sourcePath, targetPath);
    }
  }

  private async writeAtomicFile(filePath: string, contents: string, grant: EditorProjectGrant) {
    const safePath = await this.access.requireWritablePath(filePath, grant);
    const directory = path.dirname(safePath);
    const baseName = path.basename(safePath);
    const tempPath = await this.access.requireWritablePath(path.join(directory, `.${baseName}.${randomUUID()}.tmp`), grant);
    const backupPath = await this.access.requireWritablePath(`${safePath}.bak`, grant);

    try {
      if (fs.existsSync(safePath)) {
        await fsp.copyFile(safePath, backupPath);
      }
      await fsp.writeFile(tempPath, contents, { encoding: "utf8", flag: "wx" });
      await fsp.rename(tempPath, safePath);
    } catch (error) {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  private async writeLayoutSidecar(grant: EditorProjectGrant, layout: EditorLayoutState) {
    await this.writeAtomicFile(
      path.join(grant.root, LAYOUT_SUFFIX),
      `${JSON.stringify(layout, null, 2)}\n`,
      grant,
    );
  }

  private async loadLayoutSidecar(grant: EditorProjectGrant): Promise<Partial<EditorLayoutState> | null> {
    const filePath = path.join(grant.root, LAYOUT_SUFFIX);
    if (!fs.existsSync(filePath)) return null;
    try {
      const approvedPath = await this.access.requireVisiblePath(filePath);
      const raw = await fsp.readFile(approvedPath, "utf8");
      return JSON.parse(raw) as Partial<EditorLayoutState>;
    } catch (error) {
      log.warn("failed to read editor layout sidecar", { errorType: errorType(error) });
      return null;
    }
  }

  private async loadPreviews(document: ModernPetDocument, grant: EditorProjectGrant): Promise<EditorPreviewState> {
    const previews: EditorPreviewState = {
      spritesheetDataUrl: null,
      iconDataUrl: null,
      spritesheetError: null,
      iconError: null,
    };

    const spritesheetName = document.image.spritesheet || "spritesheet.png";
    try {
      const spritesheetPath = await this.access.resolveAsset(spritesheetName, grant);
      const bytes = await fsp.readFile(spritesheetPath);
      previews.spritesheetDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    } catch (error) {
      previews.spritesheetError = error instanceof Error && error.message.startsWith("editor ")
        ? error.message
        : "could not read spritesheet";
    }

    if (document.header.icon) {
      try {
        const iconPath = await this.access.resolveAsset(document.header.icon, grant);
        const bytes = await fsp.readFile(iconPath);
        previews.iconDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
      } catch (error) {
        previews.iconError = error instanceof Error && error.message.startsWith("editor ")
          ? error.message
          : "could not read icon";
      }
    }

    return previews;
  }

  private async loadRecentDocuments() {
    if (!fs.existsSync(this.recentFilePath)) {
      this.recentDocuments = [];
      return;
    }

    try {
      const raw = await fsp.readFile(this.recentFilePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      this.recentDocuments = Array.isArray(parsed)
        ? parsed.filter((item): item is EditorRecentDocument => Boolean(
          item &&
          typeof item === "object" &&
          typeof (item as EditorRecentDocument).path === "string" &&
          typeof (item as EditorRecentDocument).title === "string" &&
          typeof (item as EditorRecentDocument).petName === "string" &&
          typeof (item as EditorRecentDocument).openedAt === "string"
        )).slice(0, MAX_RECENT_DOCS)
        : [];
    } catch (error) {
      log.warn("failed to load recent editor documents", { errorType: errorType(error) });
      this.recentDocuments = [];
    }
  }

  private async persistRecentDocuments() {
    await fsp.mkdir(path.dirname(this.recentFilePath), { recursive: true });
    await fsp.writeFile(this.recentFilePath, `${JSON.stringify(this.recentDocuments.slice(0, MAX_RECENT_DOCS), null, 2)}\n`, "utf8");
  }

  private rememberRecentDocument(documentPath: string, document: ModernPetDocument) {
    const entry: EditorRecentDocument = {
      path: documentPath,
      title: document.header.title || path.basename(path.dirname(documentPath)),
      petName: document.header.petname || path.basename(path.dirname(documentPath)),
      openedAt: new Date().toISOString(),
    };

    this.recentDocuments = [
      entry,
      ...this.recentDocuments.filter((item) => item.path !== documentPath),
    ].slice(0, MAX_RECENT_DOCS);
  }
}

export = EditorWindowManager;
