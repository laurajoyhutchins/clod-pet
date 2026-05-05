import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs = require("fs");
import fsp = require("fs/promises");
import path = require("path");
import logger = require("./logger");
import { getPetsDir } from "./project-paths";
import {
  type EditorLayoutState,
  type EditorPreviewState,
  type EditorRecentDocument,
  type EditorReadResult,
  type EditorSaveResult,
  type ModernPetDocument,
} from "./editor/types";
import { mergeLayout } from "./editor/layout";
import { normalizeDocument, serializeDocument } from "./editor/document";
import { validateDocumentStructure } from "./editor/validation";

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

class EditorWindowManager {
  private window: BrowserWindow | null = null;
  private handlersRegistered = false;
  private bootstrapPath: string | null = null;
  private recentDocuments: EditorRecentDocument[] = [];
  private readonly preloadPath: string;
  private readonly editorHtmlPath: string;
  private readonly recentFilePath: string;

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;
    this.editorHtmlPath = path.join(__dirname, "..", "editor.html");
    this.recentFilePath = path.join(app.getPath("userData"), "editor-recent.json");
  }

  init() {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    ipcMain.handle("editor:show", async (_event, initialPath?: string) => {
      await this.show(initialPath);
      return true;
    });

    ipcMain.handle("editor:open-pet-directory", async () => {
      const result = await dialog.showOpenDialog({
        title: "Open Pet Directory",
        defaultPath: getPetsDir(),
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    });

    ipcMain.handle("editor:open-animation-file", async () => {
      const result = await dialog.showOpenDialog({
        title: "Open animations.json",
        defaultPath: getPetsDir(),
        properties: ["openFile"],
        filters: [
          { name: "Pet JSON", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    });

    ipcMain.handle("editor:read-document", async (_event, input: { path?: string } | string) => {
      const requestedPath = typeof input === "string" ? input : input?.path;
      if (!requestedPath) {
        throw new Error("document path is required");
      }
      const result = await this.readDocument(requestedPath);
      this.rememberRecentDocument(result.documentPath, result.document);
      await this.persistRecentDocuments();
      return {
        ...result,
        recentDocuments: this.recentDocuments.slice(),
      } satisfies EditorReadResult;
    });

    ipcMain.handle("editor:save-document", async (_event, input: SavePayload) => {
      return this.saveDocument(input, false);
    });

    ipcMain.handle("editor:save-document-as", async (_event, input: SavePayload) => {
      return this.saveDocument(input, true);
    });

    ipcMain.handle("editor:show-item-in-folder", async (_event, targetPath: string) => {
      if (!targetPath) return false;
      shell.showItemInFolder(targetPath);
      return true;
    });

    ipcMain.handle("editor:get-recent-documents", async () => {
      await this.loadRecentDocuments();
      return this.recentDocuments.slice();
    });

    ipcMain.handle("editor:close-window", async () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.close();
      }
      return true;
    });

    ipcMain.handle("editor:minimize-window", async () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.minimize();
      }
      return true;
    });

    ipcMain.handle("editor:zoom-window", async () => {
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
    this.bootstrapPath = initialPath || this.bootstrapPath || this.getDefaultDocumentPath();
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
      icon: path.join(__dirname, "assets", "icon.png"),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: this.preloadPath,
      },
    });

    this.window.once("ready-to-show", () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.show();
        this.sendBootstrap();
      }
    });
    await this.window.loadFile(this.editorHtmlPath);
    this.window.on("closed", () => {
      this.window = null;
    });
  }

  private sendBootstrap() {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("editor:bootstrap", {
      path: this.bootstrapPath || this.getDefaultDocumentPath(),
    });
  }

  private getDefaultDocumentPath() {
    return path.join(getPetsDir(), "eSheep-modern", "animations.json");
  }

  private async readDocument(documentPath: string): Promise<ReadDocumentResultInternal> {
    const resolvedPath = await this.resolveDocumentPath(documentPath);
    const raw = await fsp.readFile(resolvedPath, "utf8");
    const parsed = normalizeDocument(JSON.parse(raw) as unknown);
    const petDir = path.dirname(resolvedPath);
    const savedLayout = await this.loadLayoutSidecar(petDir);
    const layout = mergeLayout(parsed, savedLayout);
    const previews = await this.loadPreviews(parsed, petDir);
    return {
      documentPath: resolvedPath,
      petDir,
      document: parsed,
      layout,
      previews,
    };
  }

  private async saveDocument(input: SavePayload, saveAs: boolean): Promise<EditorSaveResult> {
    if (!input?.documentPath) {
      throw new Error("document path is required");
    }

    const currentDocument = normalizeDocument(input.document);
    const currentLayout = input.layout || mergeLayout(currentDocument, null);
    const currentPath = await this.resolveDocumentPath(input.documentPath);
    const targetPath = saveAs ? await this.promptSaveAsPath(currentPath, currentDocument) : currentPath;
    const targetDir = path.dirname(targetPath);
    const sourceDir = path.dirname(currentPath);
    const documentToWrite = saveAs ? this.prepareSaveAsDocument(currentDocument) : currentDocument;

    const previews = await this.loadPreviews(documentToWrite, sourceDir);
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

    await fsp.mkdir(targetDir, { recursive: true });
    await this.copyReferencedAssets(currentDocument, sourceDir, targetDir);
    await this.writeAtomicFile(targetPath, serializeDocument(documentToWrite));
    await this.writeLayoutSidecar(targetDir, currentLayout);

    this.rememberRecentDocument(targetPath, currentDocument);
    await this.persistRecentDocuments();

    return {
      documentPath: targetPath,
      petDir: targetDir,
      recentDocuments: this.recentDocuments.slice(),
    };
  }

  private async promptSaveAsPath(currentPath: string, document: ModernPetDocument): Promise<string> {
    const result = await dialog.showSaveDialog({
      title: "Save Animation Editor Document As",
      defaultPath: currentPath,
      filters: [
        { name: "Pet JSON", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) {
      throw new Error("save cancelled");
    }

    if (result.filePath.toLowerCase().endsWith(".json")) {
      return result.filePath;
    }
    return path.join(result.filePath, "animations.json");
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

  private async resolveDocumentPath(inputPath: string) {
    const stat = await fsp.stat(inputPath).catch(() => null);
    if (stat?.isDirectory()) {
      return path.join(inputPath, "animations.json");
    }
    if (path.basename(inputPath).toLowerCase() === "animations.json") {
      return inputPath;
    }
    return path.join(path.dirname(inputPath), "animations.json");
  }

  private async copyReferencedAssets(document: ModernPetDocument, sourceDir: string, targetDir: string) {
    const assets: Array<{ value: string | undefined; fallbackName: string; field: string }> = [
      { value: document.image.spritesheet, fallbackName: "spritesheet.png", field: "image.spritesheet" },
      { value: document.header.icon, fallbackName: "icon.png", field: "header.icon" },
    ];

    for (const asset of assets) {
      if (!asset.value) continue;
      const sourcePath = path.isAbsolute(asset.value)
        ? asset.value
        : path.join(sourceDir, asset.value);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`asset missing for ${asset.field}: ${asset.value}`);
      }
      const targetPath = path.join(targetDir, path.basename(asset.value || asset.fallbackName));
      if (path.resolve(sourcePath) === path.resolve(targetPath)) {
        continue;
      }
      await fsp.copyFile(sourcePath, targetPath);
    }
  }

  private async writeAtomicFile(filePath: string, contents: string) {
    const tempPath = `${filePath}.tmp`;
    const backupPath = `${filePath}.bak`;

    try {
      if (fs.existsSync(filePath)) {
        await fsp.copyFile(filePath, backupPath);
      }
      await fsp.writeFile(tempPath, contents, "utf8");
      await fsp.rename(tempPath, filePath);
    } catch (err) {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
      throw err;
    }
  }

  private async writeLayoutSidecar(targetDir: string, layout: EditorLayoutState) {
    const filePath = path.join(targetDir, LAYOUT_SUFFIX);
    await fsp.writeFile(filePath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
  }

  private async loadLayoutSidecar(targetDir: string): Promise<Partial<EditorLayoutState> | null> {
    const filePath = path.join(targetDir, LAYOUT_SUFFIX);
    const exists = fs.existsSync(filePath);
    if (!exists) return null;
    try {
      const raw = await fsp.readFile(filePath, "utf8");
      return JSON.parse(raw) as Partial<EditorLayoutState>;
    } catch (err) {
      log.warn("failed to read layout sidecar", { filePath, err });
      return null;
    }
  }

  private async loadPreviews(document: ModernPetDocument, petDir: string): Promise<EditorPreviewState> {
    const previews: EditorPreviewState = {
      spritesheetDataUrl: null,
      iconDataUrl: null,
      spritesheetError: null,
      iconError: null,
    };

    const spritesheetName = document.image.spritesheet || "spritesheet.png";
    const spritesheetPath = path.isAbsolute(spritesheetName) ? spritesheetName : path.join(petDir, spritesheetName);
    if (fs.existsSync(spritesheetPath)) {
      try {
        const bytes = await fsp.readFile(spritesheetPath);
        previews.spritesheetDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
      } catch (err) {
        previews.spritesheetError = err instanceof Error ? err.message : String(err);
      }
    } else {
      previews.spritesheetError = `missing spritesheet: ${spritesheetName}`;
    }

    if (document.header.icon) {
      const iconPath = path.isAbsolute(document.header.icon) ? document.header.icon : path.join(petDir, document.header.icon);
      if (fs.existsSync(iconPath)) {
        try {
          const bytes = await fsp.readFile(iconPath);
          previews.iconDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
        } catch (err) {
          previews.iconError = err instanceof Error ? err.message : String(err);
        }
      } else {
        previews.iconError = `missing icon: ${document.header.icon}`;
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
      const parsed = JSON.parse(raw);
      this.recentDocuments = Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_DOCS) : [];
    } catch (err) {
      log.warn("failed to load recent documents", err);
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
