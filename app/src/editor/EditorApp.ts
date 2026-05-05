import {
  cloneDocument,
  makeDefaultLayout,
  mergeLayout,
  snapshotDocument,
} from "./document";
import { buildGraphModel } from "./graph";
import { drawFrameToCanvas, loadImage, toFileDataUrl } from "./sprite";
import { applyPanelStyle, getPanelStyles, isPanelStyle } from "./theme";
import {
  getRecentDocuments,
  openAnimationFile,
  openPetDirectory,
  readDocument,
  saveDocument,
  saveDocumentAs,
  showItemInFolder,
} from "./ipc";
import { validateDocumentStructure, type ValidationResult } from "./validation";
import type {
  EditorLayoutState,
  EditorRecentDocument,
  EditorReadResult,
  PanelStyle,
  ModernAnimation,
  ModernPetDocument,
  ValidationIssue,
} from "./types";

type Selection =
  | { kind: "animation"; id: number }
  | { kind: "spawn"; index: number }
  | { kind: "child"; index: number }
  | { kind: "transition"; ownerId: number; group: "sequence" | "border" | "gravity"; index: number }
  | null;

interface DragState {
  key: string;
  startPointerX: number;
  startPointerY: number;
  startNodeX: number;
  startNodeY: number;
  moved: boolean;
}

interface PanState {
  startPointerX: number;
  startPointerY: number;
  startPanX: number;
  startPanY: number;
  active: boolean;
}

interface HistoryEntry {
  document: ModernPetDocument;
  layout: EditorLayoutState;
}

function byId<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element #${id}`);
  return element as unknown as T;
}

function basename(value: string) {
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] || value;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function setPathValue(root: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cursor: Record<string, unknown> | unknown[] | unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(part)];
      continue;
    }
    const next = cursor as Record<string, unknown>;
    if (next[part] === undefined) {
      next[part] = /^\d+$/.test(parts[i + 1] || "") ? [] : {};
    }
    cursor = next[part];
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cursor)) {
    (cursor as unknown[])[Number(last)] = value;
  } else {
    (cursor as Record<string, unknown>)[last] = value;
  }
}

function getPathValue(root: Record<string, unknown>, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cursor: unknown = root;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(part)];
    } else if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function parseEditorValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): unknown {
  if (input instanceof HTMLInputElement && input.type === "checkbox") {
    return input.checked;
  }
  if (input instanceof HTMLInputElement && input.type === "number") {
    const value = input.value.trim();
    return value === "" ? 0 : Number(value);
  }
  return input.value;
}

function formatIssue(issue: ValidationIssue) {
  return `${issue.path || "document"}: ${issue.message}`;
}

export class EditorApp {
  private document: ModernPetDocument | null = null;
  private documentPath: string | null = null;
  private petDir: string | null = null;
  private layout: EditorLayoutState = {
    nodes: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  private previews: EditorReadResult["previews"] = {
    spritesheetDataUrl: null,
    iconDataUrl: null,
    spritesheetError: null,
    iconError: null,
  };
  private recentDocuments: EditorRecentDocument[] = [];
  private selection: Selection = null;
  private dirty = false;
  private undoStack: HistoryEntry[] = [];
  private undoIndex = -1;
  private validation: ValidationResult = { errors: [], warnings: [] };
  private lastGraphKey = "";
  private dragState: DragState | null = null;
  private panState: PanState = {
    startPointerX: 0,
    startPointerY: 0,
    startPanX: 0,
    startPanY: 0,
    active: false,
  };
  private themeStyle: PanelStyle = "windows-98";
  private previewImagePromise: Promise<HTMLImageElement> | null = null;
  private readonly els = {
    title: byId<HTMLElement>("window-title"),
    validationSummary: byId<HTMLElement>("validation-summary"),
    openFileBtn: byId<HTMLButtonElement>("open-file-btn"),
    openDirBtn: byId<HTMLButtonElement>("open-dir-btn"),
    revealBtn: byId<HTMLButtonElement>("reveal-btn"),
    saveBtn: byId<HTMLButtonElement>("save-btn"),
    saveAsBtn: byId<HTMLButtonElement>("save-as-btn"),
    revertBtn: byId<HTMLButtonElement>("revert-btn"),
    undoBtn: byId<HTMLButtonElement>("undo-btn"),
    redoBtn: byId<HTMLButtonElement>("redo-btn"),
    layoutBtn: byId<HTMLButtonElement>("layout-btn"),
    fitBtn: byId<HTMLButtonElement>("fit-btn"),
    centerBtn: byId<HTMLButtonElement>("center-btn"),
    searchInput: byId<HTMLInputElement>("search-input"),
    themeSelect: byId<HTMLSelectElement>("theme-select"),
    recentDocs: byId<HTMLElement>("recent-docs"),
    animationList: byId<HTMLElement>("animation-list"),
    spawnList: byId<HTMLElement>("spawn-list"),
    childList: byId<HTMLElement>("child-list"),
    graphTitle: byId<HTMLElement>("graph-title"),
    graphHint: byId<HTMLElement>("graph-hint"),
    graphStage: byId<HTMLElement>("graph-stage"),
    graphViewport: byId<HTMLElement>("graph-viewport"),
    graphEdges: byId<SVGSVGElement>("graph-edges"),
    graphNodes: byId<HTMLElement>("graph-nodes"),
    graphLabels: byId<HTMLElement>("graph-labels"),
    minimap: byId<HTMLElement>("minimap"),
    documentInspector: byId<HTMLElement>("document-inspector"),
    selectionInspector: byId<HTMLElement>("selection-inspector"),
    validationList: byId<HTMLElement>("validation-list"),
    statusbar: byId<HTMLElement>("statusbar"),
  };

  async init() {
    this.bindStaticEvents();
    this.bindWindowEvents();
    await this.loadThemeOptions();
    await this.refreshRecentDocuments();
    this.render();
  }

  async bootstrap(initialPath: string) {
    if (!initialPath) {
      initialPath = this.defaultDocumentPath();
    }
    await this.loadDocument(initialPath);
  }

  private defaultDocumentPath() {
    return "../pets/eSheep-modern/animations.json";
  }

  private bindStaticEvents() {
    this.els.openFileBtn.addEventListener("click", () => void this.handleOpenFile());
    this.els.openDirBtn.addEventListener("click", () => void this.handleOpenDirectory());
    this.els.revealBtn.addEventListener("click", () => void this.handleReveal());
    this.els.saveBtn.addEventListener("click", () => void this.handleSave(false));
    this.els.saveAsBtn.addEventListener("click", () => void this.handleSave(true));
    this.els.revertBtn.addEventListener("click", () => void this.handleRevert());
    this.els.undoBtn.addEventListener("click", () => this.undo());
    this.els.redoBtn.addEventListener("click", () => this.redo());
    this.els.layoutBtn.addEventListener("click", () => this.relayout());
    this.els.fitBtn.addEventListener("click", () => this.fitView());
    this.els.centerBtn.addEventListener("click", () => this.centerSelection());
    this.els.searchInput.addEventListener("input", () => this.render());
    this.els.themeSelect.addEventListener("change", () => void this.handleThemeChange());
    this.els.graphStage.addEventListener("wheel", (event) => this.handleZoom(event), { passive: false });
    this.els.graphStage.addEventListener("pointerdown", (event) => this.handleStagePointerDown(event));

    this.els.graphNodes.addEventListener("pointerdown", (event) => {
      const target = event.target as HTMLElement | null;
      const nodeEl = target?.closest<HTMLElement>("[data-node-key]");
      if (!nodeEl) return;
      const header = target?.closest<HTMLElement>(".graph-node-header");
      if (!header) return;

      event.preventDefault();
      event.stopPropagation();
      this.beginNodeDrag(nodeEl.dataset.nodeKey || "", event);
    });

    this.els.graphNodes.addEventListener("click", (event) => {
      const nodeEl = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-node-key]");
      if (!nodeEl) return;
      this.selectByKey(nodeEl.dataset.nodeKey || "");
    });

    this.els.graphLabels.addEventListener("click", (event) => {
      const labelEl = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-edge-key]");
      if (!labelEl) return;
      this.selectEdge(labelEl.dataset.edgeKey || "");
    });

    this.els.documentInspector.addEventListener("change", (event) => this.handleInspectorChange(event));
    this.els.selectionInspector.addEventListener("change", (event) => this.handleInspectorChange(event));
    this.els.selectionInspector.addEventListener("click", (event) => this.handleInspectorClick(event));

    window.clodPet.on("editor:bootstrap", (payload) => {
      void this.bootstrap(String(payload.path || this.defaultDocumentPath()));
    });
  }

  private bindWindowEvents() {
    window.addEventListener("beforeunload", (event) => {
      if (this.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });

    document.getElementById("close-btn")?.addEventListener("click", () => {
      void window.clodPet.editor.closeWindow();
    });

    document.getElementById("minimize-btn")?.addEventListener("click", () => {
      void window.clodPet.editor.minimizeWindow();
    });

    document.getElementById("zoom-btn")?.addEventListener("click", () => {
      void window.clodPet.editor.zoomWindow();
    });
  }

  private async loadThemeOptions() {
    const settings = (await window.clodPet.control.getSettings().catch(() => ({}))) as Record<string, unknown>;
    const styles = getPanelStyles();
    this.els.themeSelect.innerHTML = "";
    for (const style of styles) {
      const option = document.createElement("option");
      option.value = style;
      option.textContent = style;
      this.els.themeSelect.appendChild(option);
    }

    const panelStyleValue = settings["PanelStyle"];
    const panelStyle = typeof panelStyleValue === "string" && isPanelStyle(panelStyleValue)
      ? panelStyleValue
      : "windows-98";
    this.themeStyle = panelStyle;
    this.els.themeSelect.value = panelStyle;
    applyPanelStyle(panelStyle);
  }

  private async handleThemeChange() {
    const value = this.els.themeSelect.value;
    if (!isPanelStyle(value)) return;
    this.themeStyle = value;
    applyPanelStyle(value);
    await window.clodPet.control.setSettings({ PanelStyle: value }).catch((err) => {
      this.setStatus(`failed to update theme: ${err instanceof Error ? err.message : String(err)}`);
    });
    this.render();
  }

  private async refreshRecentDocuments() {
    this.recentDocuments = await getRecentDocuments().catch(() => []);
  }

  private async loadDocument(documentPath: string) {
    const result = await readDocument(documentPath);
    this.document = cloneDocument(result.document);
    this.documentPath = result.documentPath;
    this.petDir = result.petDir;
    this.layout = mergeLayout(this.document, result.layout);
    this.previews = result.previews;
    this.recentDocuments = result.recentDocuments;
    this.selection = this.document.animations[0] ? { kind: "animation", id: this.document.animations[0].id } : null;
    this.dirty = false;
    this.undoStack = [snapshotDocument(this.document, this.layout)];
    this.undoIndex = 0;
    this.previewImagePromise = null;
    this.render();
  }

  private async handleOpenFile() {
    const file = await openAnimationFile();
    if (!file) return;
    await this.requestLoadDocument(file);
  }

  private async handleOpenDirectory() {
    const dir = await openPetDirectory();
    if (!dir) return;
    await this.requestLoadDocument(dir);
  }

  private async handleReveal() {
    if (!this.documentPath) return;
    await showItemInFolder(this.documentPath);
  }

  private async handleSave(saveAs: boolean) {
    if (!this.document || !this.documentPath) return;
    try {
      const result = saveAs
        ? await saveDocumentAs(this.documentPath, this.document, this.layout)
        : await saveDocument(this.documentPath, this.document, this.layout);
      this.documentPath = result.documentPath;
      this.petDir = result.petDir;
      this.recentDocuments = result.recentDocuments;
      this.dirty = false;
      this.setStatus(`saved ${basename(result.documentPath)}`);
      this.render();
    } catch (err) {
      this.setStatus(`save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleRevert() {
    if (!this.documentPath) return;
    await this.requestLoadDocument(this.documentPath);
  }

  private async requestLoadDocument(documentPath: string) {
    if (this.dirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    await this.loadDocument(documentPath);
  }

  private setStatus(message: string) {
    this.els.statusbar.textContent = message;
  }

  private markDirty() {
    this.dirty = true;
    this.renderWindowTitle();
  }

  private renderWindowTitle() {
    const title = this.document?.header.title || this.document?.header.petname || "Animation Editor";
    this.els.title.textContent = `${this.dirty ? "* " : ""}Clod Pet - ${title}`;
  }

  private pushHistory() {
    if (!this.document) return;
    this.undoStack = this.undoStack.slice(0, this.undoIndex + 1);
    this.undoStack.push(snapshotDocument(this.document, this.layout));
    this.undoIndex = this.undoStack.length - 1;
  }

  private restoreHistory(index: number) {
    const snapshot = this.undoStack[index];
    if (!snapshot) return;
    this.document = cloneDocument(snapshot.document);
    this.layout = mergeLayout(this.document, snapshot.layout);
    this.undoIndex = index;
    this.dirty = true;
    this.render();
  }

  private undo() {
    if (this.undoIndex <= 0) return;
    this.restoreHistory(this.undoIndex - 1);
  }

  private redo() {
    if (this.undoIndex >= this.undoStack.length - 1) return;
    this.restoreHistory(this.undoIndex + 1);
  }

  private relayout() {
    if (!this.document) return;
    this.layout = makeDefaultLayout(this.document);
    this.pushHistory();
    this.markDirty();
    this.render();
  }

  private fitView() {
    const bounds = this.computeContentBounds();
    if (!bounds) return;
    const stage = this.els.graphStage.getBoundingClientRect();
    const width = Math.max(1, bounds.maxX - bounds.minX + 120);
    const height = Math.max(1, bounds.maxY - bounds.minY + 120);
    const zoom = Math.min(stage.width / width, stage.height / height, 1.2);
    this.layout.viewport = {
      x: stage.width / 2 - (bounds.minX + width / 2) * zoom,
      y: stage.height / 2 - (bounds.minY + height / 2) * zoom,
      zoom,
    };
    this.pushHistory();
    this.markDirty();
    this.render();
  }

  private centerSelection() {
    if (!this.document || !this.selection) return;
    const key = this.selection.kind === "animation"
      ? `animation:${this.selection.id}`
      : this.selection.kind === "spawn"
        ? `spawn:${this.document.spawns[this.selection.index]?.id}:${this.selection.index}`
        : this.selection.kind === "child"
          ? `child:${this.document.children?.[this.selection.index]?.animation_id}:${this.selection.index}`
          : `animation:${this.selection.ownerId}`;
    const node = this.layout.nodes[key];
    if (!node) return;
    const stage = this.els.graphStage.getBoundingClientRect();
    this.layout.viewport = {
      x: stage.width / 2 - (node.x + 120) * this.layout.viewport.zoom,
      y: stage.height / 2 - (node.y + 80) * this.layout.viewport.zoom,
      zoom: this.layout.viewport.zoom,
    };
    this.pushHistory();
    this.markDirty();
    this.render();
  }

  private selectByKey(key: string) {
    if (!this.document) return;
    if (key.startsWith("animation:")) {
      const id = Number(key.split(":")[1]);
      this.selection = { kind: "animation", id };
    } else if (key.startsWith("spawn:")) {
      const index = Number(key.split(":")[2] || 0);
      this.selection = { kind: "spawn", index };
    } else if (key.startsWith("child:")) {
      const index = Number(key.split(":")[2] || 0);
      this.selection = { kind: "child", index };
    }
    this.render();
  }

  private selectEdge(edgeKey: string) {
    if (!this.document) return;
    const parts = edgeKey.split(":");
    if (parts.length < 4) return;
    const ownerId = Number(parts[1]);
    const group = parts[2];
    const index = Number(parts[3]);
    if (group === "spawn") {
      this.selection = { kind: "spawn", index };
    } else if (group === "child") {
      this.selection = { kind: "child", index };
    } else {
      this.selection = { kind: "transition", ownerId, group: group as "sequence" | "border" | "gravity", index };
    }
    this.render();
  }

  private getSelectedAnimation(): ModernAnimation | null {
    if (!this.document || !this.selection || this.selection.kind !== "animation") return null;
    const animationId = this.selection.id;
    return this.document.animations.find((animation) => animation.id === animationId) || null;
  }

  private getSelectedTransition() {
    if (!this.document || !this.selection || this.selection.kind !== "transition") return null;
    const ownerId = this.selection.ownerId;
    const groupName = this.selection.group;
    const animation = this.document.animations.find((item) => item.id === ownerId);
    if (!animation) return null;
    const group = ((animation as any)[groupName] as Array<{ probability: number; only?: string; value: number }> | undefined) || [];
    return { animation, group: groupName, transition: group[this.selection.index] || null };
  }

  private getSearchFilter() {
    return this.els.searchInput.value.trim().toLowerCase();
  }

  private render() {
    if (!this.document) {
      this.renderEmpty();
      return;
    }

    this.validation = validateDocumentStructure(this.document, this.previews);
    this.renderWindowTitle();
    this.renderSidebar();
    this.renderGraph();
    this.renderInspectors();
    this.renderValidation();
    this.renderStatus();
  }

  private renderEmpty() {
    this.els.graphTitle.textContent = "No document loaded";
    this.els.graphHint.textContent = "Use Open File or Open Dir to begin.";
    this.els.graphEdges.innerHTML = "";
    this.els.graphNodes.innerHTML = '<div class="selection-empty">No document loaded.</div>';
    this.els.graphLabels.innerHTML = "";
    this.els.documentInspector.innerHTML = '<div class="selection-empty">Open a document to inspect it.</div>';
    this.els.selectionInspector.innerHTML = '<div class="selection-empty">Nothing selected.</div>';
    this.els.validationList.innerHTML = "";
    this.els.recentDocs.innerHTML = "";
    this.els.animationList.innerHTML = "";
    this.els.spawnList.innerHTML = "";
    this.els.childList.innerHTML = "";
    this.els.validationSummary.textContent = "";
    this.renderWindowTitle();
  }

  private renderSidebar() {
    if (!this.document) return;
    const filter = this.getSearchFilter();

    const renderItems = (items: Array<{ key: string; title: string; subtitle: string; active: boolean }>) =>
      items.map((item) => `
        <div class="sidebar-item ${item.active ? "active" : ""}" data-key="${item.key}">
          <div class="meta">
            <div class="title">${escapeHtml(item.title)}</div>
            <div class="subtitle">${escapeHtml(item.subtitle)}</div>
          </div>
        </div>
      `).join("");

    const animations = this.document.animations
      .filter((animation) => {
        if (!filter) return true;
        return `${animation.id} ${animation.name}`.toLowerCase().includes(filter);
      })
      .map((animation) => ({
        key: `animation:${animation.id}`,
        title: `#${animation.id} ${animation.name || "unnamed"}`,
        subtitle: `${animation.sequence.frames.length} frames`,
        active: this.selection?.kind === "animation" && this.selection.id === animation.id,
      }));
    const spawns = this.document.spawns
      .filter((spawn) => !filter || `${spawn.id}`.includes(filter))
      .map((spawn, index) => ({
        key: `spawn:${spawn.id}:${index}`,
        title: `Spawn ${spawn.id}`,
        subtitle: `weight ${spawn.probability} -> #${spawn.next.value}`,
        active: this.selection?.kind === "spawn" && this.selection.index === index,
      }));
    const children = (this.document.children || [])
      .filter((child) => !filter || `${child.animation_id}`.includes(filter))
      .map((child, index) => ({
        key: `child:${child.animation_id}:${index}`,
        title: `Child ${child.animation_id}`,
        subtitle: `weight ${child.next.probability} -> #${child.next.value}`,
        active: this.selection?.kind === "child" && this.selection.index === index,
      }));

    this.els.recentDocs.innerHTML = this.recentDocuments.map((doc) => `
      <div class="sidebar-item" data-path="${escapeAttr(doc.path)}">
        <div class="meta">
          <div class="title">${escapeHtml(doc.title || doc.petName || basename(doc.path))}</div>
          <div class="subtitle">${escapeHtml(doc.path)}</div>
        </div>
      </div>
    `).join("") || '<div class="selection-empty">No recent documents.</div>';

    this.els.animationList.innerHTML = renderItems(animations) || '<div class="selection-empty">No matching animations.</div>';
    this.els.spawnList.innerHTML = renderItems(spawns) || '<div class="selection-empty">No matching spawns.</div>';
    this.els.childList.innerHTML = renderItems(children) || '<div class="selection-empty">No matching children.</div>';

    for (const list of [this.els.recentDocs, this.els.animationList, this.els.spawnList, this.els.childList]) {
      list.querySelectorAll<HTMLElement>("[data-key]").forEach((item) => {
        item.addEventListener("click", () => this.selectByKey(item.dataset.key || ""));
      });
      list.querySelectorAll<HTMLElement>("[data-path]").forEach((item) => {
        item.addEventListener("click", () => void this.requestLoadDocument(item.dataset.path || ""));
      });
    }
  }

  private renderGraph() {
    if (!this.document) return;
    const model = buildGraphModel(this.document, this.layout);
    this.lastGraphKey = `${model.nodes.length}:${model.edges.length}`;

    const filter = this.getSearchFilter();
    this.els.graphTitle.textContent = `${this.document.header.title || this.document.header.petname || "untitled"} • ${model.nodes.length} nodes`;
    this.els.graphHint.textContent = `scroll to zoom • drag background to pan • drag node headers to move`;

    const viewport = this.layout.viewport;
    this.els.graphViewport.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

    const edgesSvg: string[] = [];
    const labels: string[] = [];

    for (const edge of model.edges) {
      const source = model.nodeByKey.get(edge.sourceKey);
      const target = model.nodeByKey.get(edge.targetKey);
      if (!source) continue;
      const sourceBox = this.getNodeBox(source);
      const targetBox = target ? this.getNodeBox(target) : { x: sourceBox.x + 260, y: sourceBox.y, width: 10, height: 10 };
      const startX = sourceBox.x + sourceBox.width;
      const startY = sourceBox.y + sourceBox.height / 2;
      const endX = targetBox.x;
      const endY = targetBox.y + targetBox.height / 2;
      const delta = Math.max(90, Math.abs(endX - startX) * 0.35);
      const path = `M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`;
      edgesSvg.push(`<path d="${path}" class="edge-path ${edge.kind}" data-edge-key="${escapeAttr(edge.key)}"></path>`);

      const labelX = (startX + endX) / 2 - 80;
      const labelY = (startY + endY) / 2 - 14;
      labels.push(`
        <div class="edge-label ${edge.kind} ${this.selection?.kind === "transition" && this.selection.ownerId === edge.sourceId && this.selection.group === edge.kind && this.selection.index === edge.index ? "active" : ""}"
          data-edge-key="${escapeAttr(edge.key)}"
          style="left:${labelX}px; top:${labelY}px;">
          ${escapeHtml(edge.label)}
        </div>
      `);
    }

    const nodes = model.nodes
      .filter((node) => !filter || `${node.id} ${node.title} ${node.subtitle}`.toLowerCase().includes(filter))
      .map((node) => {
        const active = this.isNodeSelected(node.key);
        const canvas = node.kind === "animation" ? `<canvas class="sprite-preview" data-preview-key="${escapeAttr(node.key)}"></canvas>` : "";
        const badges = node.kind === "animation"
          ? `<div class="graph-node-badges">
              ${this.document?.sounds?.some((sound) => sound.animation_id === node.id) ? '<span class="badge">sounds</span>' : ""}
              ${this.document?.children?.some((child) => child.animation_id === node.id) ? '<span class="badge">children</span>' : ""}
              ${this.document?.animations.find((animation) => animation.id === node.id)?.border?.length ? '<span class="badge">border</span>' : ""}
              ${this.document?.animations.find((animation) => animation.id === node.id)?.gravity?.length ? '<span class="badge">gravity</span>' : ""}
            </div>` : "";
        return `
          <div class="graph-node ${node.kind} ${active ? "active" : ""}" data-node-key="${escapeAttr(node.key)}" style="left:${node.x}px; top:${node.y}px; width:${node.width}px; min-height:${node.height}px;">
            <div class="graph-node-header">
              <div class="graph-node-title">${escapeHtml(node.title)}</div>
              <div class="graph-node-subtitle">${escapeHtml(node.subtitle)}</div>
            </div>
            <div class="graph-node-body">
              ${canvas}
              <div class="graph-node-summary">${escapeHtml(node.summary || "")}</div>
              ${badges}
            </div>
          </div>
        `;
      });

    this.els.graphEdges.innerHTML = edgesSvg.join("");
    this.els.graphNodes.innerHTML = nodes.join("");
    this.els.graphLabels.innerHTML = labels.join("");

    this.drawPreviews(model).catch((err) => {
      this.setStatus(`preview error: ${err instanceof Error ? err.message : String(err)}`);
    });
    this.renderMinimap(model);
  }

  private async drawPreviews(model: ReturnType<typeof buildGraphModel>) {
    if (!this.document || !this.previews.spritesheetDataUrl) return;
    if (!this.previewImagePromise) {
      this.previewImagePromise = loadImage(this.previews.spritesheetDataUrl);
    }
    const image = await this.previewImagePromise;
    for (const node of model.nodes) {
      if (node.kind !== "animation") continue;
      const canvas = this.els.graphNodes.querySelector<HTMLCanvasElement>(`canvas[data-preview-key="${CSS.escape(node.key)}"]`);
      if (!canvas) continue;
      drawFrameToCanvas(
        canvas,
        image,
        node.previewFrame || 0,
        node.previewTilesX || 1,
        node.previewTilesY || 1,
        this.document.image.transparency || "",
      );
    }

    const picker = this.els.selectionInspector.querySelector<HTMLElement>("[data-role='frame-picker']");
    if (picker) {
      const selected = this.getSelectedAnimation();
      if (selected) {
        picker.querySelectorAll<HTMLCanvasElement>("canvas[data-frame-index]").forEach((canvas) => {
          const index = Number(canvas.dataset.frameIndex || 0);
          drawFrameToCanvas(canvas, image, index, this.document?.image.tiles_x || 1, this.document?.image.tiles_y || 1, this.document?.image.transparency || "");
        });
      }
    }
  }

  private renderMinimap(model: ReturnType<typeof buildGraphModel>) {
    const bounds = this.computeContentBounds();
    if (!bounds) {
      this.els.minimap.innerHTML = "";
      return;
    }
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(220 / width, 70 / height, 1);
    const offsetX = -bounds.minX * scale + 10;
    const offsetY = -bounds.minY * scale + 18;
    const nodes = model.nodes.map((node) => `
      <div style="position:absolute; left:${offsetX + node.x * scale}px; top:${offsetY + node.y * scale}px; width:${node.width * scale}px; height:${node.height * scale}px; border:1px solid rgba(0,0,0,0.4); background:rgba(0,0,0,0.08);"></div>
    `).join("");
    this.els.minimap.innerHTML = nodes;
  }

  private computeContentBounds() {
    if (!this.document) return null;
    const model = buildGraphModel(this.document, this.layout);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of model.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  }

  private getNodeBox(node: { x: number; y: number; width: number; height: number }) {
    return { x: node.x, y: node.y, width: node.width, height: node.height };
  }

  private isNodeSelected(key: string) {
    if (!this.selection) return false;
    if (this.selection.kind === "animation") return key === `animation:${this.selection.id}`;
    if (this.selection.kind === "spawn" && this.document) {
      const spawn = this.document.spawns[this.selection.index];
      return key === `spawn:${spawn?.id}:${this.selection.index}`;
    }
    if (this.selection.kind === "child" && this.document) {
      const child = this.document.children?.[this.selection.index];
      return key === `child:${child?.animation_id}:${this.selection.index}`;
    }
    if (this.selection.kind === "transition") {
      return key === `animation:${this.selection.ownerId}`;
    }
    return false;
  }

  private renderInspectors() {
    if (!this.document) return;
    this.els.documentInspector.innerHTML = this.renderDocumentInspector();
    this.els.selectionInspector.innerHTML = this.renderSelectionInspector();
    this.bindDocumentInspector();
    this.bindSelectionInspector();
  }

  private renderDocumentInspector() {
    if (!this.document) return "";
    const header = this.document.header;
    const image = this.document.image;
    return `
      <div class="field-grid">
        <div class="field-row inline"><label>Author</label><input data-path="header.author" value="${escapeAttr(header.author || "")}"></div>
        <div class="field-row inline"><label>Title</label><input data-path="header.title" value="${escapeAttr(header.title || "")}"></div>
        <div class="field-row inline"><label>Pet Name</label><input data-path="header.petname" value="${escapeAttr(header.petname || "")}"></div>
        <div class="field-row inline"><label>Version</label><input data-path="header.version" value="${escapeAttr(header.version || "")}"></div>
        <div class="field-row"><label>Info</label><textarea data-path="header.info">${escapeHtml(header.info || "")}</textarea></div>
        <div class="field-row inline"><label>Application</label><input data-path="header.application" type="number" value="${Number(header.application || 1)}"></div>
        <div class="field-row inline"><label>Icon</label><input data-path="header.icon" value="${escapeAttr(header.icon || "")}"></div>
        <div class="field-row inline"><label>Tiles X</label><input data-path="image.tiles_x" type="number" min="1" value="${Number(image.tiles_x || 1)}"></div>
        <div class="field-row inline"><label>Tiles Y</label><input data-path="image.tiles_y" type="number" min="1" value="${Number(image.tiles_y || 1)}"></div>
        <div class="field-row inline"><label>Spritesheet</label><input data-path="image.spritesheet" value="${escapeAttr(image.spritesheet || "")}"></div>
        <div class="field-row inline"><label>Transparency</label><input data-path="image.transparency" value="${escapeAttr(image.transparency || "")}"></div>
      </div>
    `;
  }

  private renderSelectionInspector() {
    if (!this.document) return '<div class="selection-empty">Nothing selected.</div>';
    if (!this.selection) return '<div class="selection-empty">Nothing selected.</div>';
    if (this.selection.kind === "animation") {
      const animation = this.getSelectedAnimation();
      if (!animation) return '<div class="selection-empty">Animation not found.</div>';
      return `
        <div class="field-grid">
          <div class="field-row inline"><label>ID</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.id" type="number" min="1" value="${animation.id}"></div>
          <div class="field-row inline"><label>Name</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.name" value="${escapeAttr(animation.name)}"></div>
          <div class="field-row inline"><label>Start X</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.start.x" value="${escapeAttr(animation.start.x)}"></div>
          <div class="field-row inline"><label>Start Y</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.start.y" value="${escapeAttr(animation.start.y)}"></div>
          <div class="field-row inline"><label>Start Interval</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.start.interval" value="${escapeAttr(animation.start.interval)}"></div>
          <div class="field-row inline"><label>End X</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.end.x" value="${escapeAttr(animation.end?.x || animation.start.x)}"></div>
          <div class="field-row inline"><label>End Y</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.end.y" value="${escapeAttr(animation.end?.y || animation.start.y)}"></div>
          <div class="field-row inline"><label>End Interval</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.end.interval" value="${escapeAttr(animation.end?.interval || animation.start.interval)}"></div>
          <div class="field-row inline"><label>Frames</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.sequence.framesText" value="${escapeAttr(animation.sequence.frames.join(", "))}"></div>
          <div class="field-row inline"><label>Repeat</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.sequence.repeat" value="${escapeAttr(animation.sequence.repeat)}"></div>
          <div class="field-row inline"><label>Repeat From</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.sequence.repeat_from" type="number" min="0" value="${animation.sequence.repeat_from}"></div>
          <div class="field-row inline"><label>Action</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === animation.id)}.sequence.action" value="${escapeAttr(animation.sequence.action || "")}"></div>
          <div class="field-actions">
            <button class="btn btn-small" data-action="transition-select" data-owner-id="${animation.id}" data-group="sequence">Sequence (${animation.sequence.nexts?.length || 0})</button>
            <button class="btn btn-small" data-action="transition-add" data-owner-id="${animation.id}" data-group="sequence">+ Sequence</button>
            <button class="btn btn-small" data-action="transition-select" data-owner-id="${animation.id}" data-group="border">Border (${animation.border?.length || 0})</button>
            <button class="btn btn-small" data-action="transition-add" data-owner-id="${animation.id}" data-group="border">+ Border</button>
            <button class="btn btn-small" data-action="transition-select" data-owner-id="${animation.id}" data-group="gravity">Gravity (${animation.gravity?.length || 0})</button>
            <button class="btn btn-small" data-action="transition-add" data-owner-id="${animation.id}" data-group="gravity">+ Gravity</button>
          </div>
          <div class="field-row">
            <label>Frame Picker</label>
            <div class="frame-picker" data-role="frame-picker">
              ${this.renderFramePicker()}
            </div>
          </div>
        </div>
      `;
    }
    if (this.selection.kind === "transition") {
      const entry = this.getSelectedTransition();
      if (!entry || !entry.transition) return '<div class="selection-empty">Transition not found.</div>';
      return `
        <div class="field-grid">
          <div class="field-row inline"><label>Probability</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === entry.animation.id)}.${entry.group}[${this.selection.index}].probability" type="number" min="0" value="${entry.transition.probability}"></div>
          <div class="field-row inline"><label>Only</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === entry.animation.id)}.${entry.group}[${this.selection.index}].only" value="${escapeAttr(entry.transition.only || "none")}"></div>
          <div class="field-row inline"><label>Target</label><input data-path="animations.${this.document.animations.findIndex((item) => item.id === entry.animation.id)}.${entry.group}[${this.selection.index}].value" type="number" min="1" value="${entry.transition.value}"></div>
          <div class="field-actions">
            <button class="btn btn-small" data-action="transition-delete" data-owner-id="${entry.animation.id}" data-group="${entry.group}" data-index="${this.selection.index}">Delete</button>
          </div>
        </div>
      `;
    }
    if (this.selection.kind === "spawn") {
      const spawn = this.document.spawns[this.selection.index];
      if (!spawn) return '<div class="selection-empty">Spawn not found.</div>';
      return `
        <div class="field-grid">
          <div class="field-row inline"><label>ID</label><input data-path="spawns.${this.selection.index}.id" type="number" min="1" value="${spawn.id}"></div>
          <div class="field-row inline"><label>Weight</label><input data-path="spawns.${this.selection.index}.probability" type="number" min="0" value="${spawn.probability}"></div>
          <div class="field-row inline"><label>X</label><input data-path="spawns.${this.selection.index}.x" value="${escapeAttr(spawn.x)}"></div>
          <div class="field-row inline"><label>Y</label><input data-path="spawns.${this.selection.index}.y" value="${escapeAttr(spawn.y)}"></div>
          <div class="field-row inline"><label>Next Weight</label><input data-path="spawns.${this.selection.index}.next.probability" type="number" min="0" value="${spawn.next.probability}"></div>
          <div class="field-row inline"><label>Next Target</label><input data-path="spawns.${this.selection.index}.next.value" type="number" min="1" value="${spawn.next.value}"></div>
        </div>
      `;
    }
    if (this.selection.kind === "child") {
      const child = this.document.children?.[this.selection.index];
      if (!child) return '<div class="selection-empty">Child not found.</div>';
      return `
        <div class="field-grid">
          <div class="field-row inline"><label>Animation ID</label><input data-path="children.${this.selection.index}.animation_id" type="number" min="1" value="${child.animation_id}"></div>
          <div class="field-row inline"><label>X</label><input data-path="children.${this.selection.index}.x" value="${escapeAttr(child.x)}"></div>
          <div class="field-row inline"><label>Y</label><input data-path="children.${this.selection.index}.y" value="${escapeAttr(child.y)}"></div>
          <div class="field-row inline"><label>Next Weight</label><input data-path="children.${this.selection.index}.next.probability" type="number" min="0" value="${child.next.probability}"></div>
          <div class="field-row inline"><label>Next Target</label><input data-path="children.${this.selection.index}.next.value" type="number" min="1" value="${child.next.value}"></div>
        </div>
      `;
    }
    return '<div class="selection-empty">Nothing selected.</div>';
  }

  private renderFramePicker() {
    if (!this.document) return "";
    const total = Math.max(1, (this.document.image.tiles_x || 1) * (this.document.image.tiles_y || 1));
    const frames: string[] = [];
    for (let i = 0; i < total; i++) {
      frames.push(`<button type="button" class="btn btn-small" data-frame-add="${i}" title="Add frame ${i}"><canvas data-frame-index="${i}" width="24" height="24"></canvas></button>`);
    }
    return frames.join("");
  }

  private bindDocumentInspector() {
    const container = this.els.documentInspector;
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-path]").forEach((input) => {
      input.addEventListener("change", () => this.commitInputChange(input));
    });
  }

  private bindSelectionInspector() {
    const container = this.els.selectionInspector;
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-path]").forEach((input) => {
      input.addEventListener("change", () => this.commitInputChange(input));
    });

    container.querySelectorAll<HTMLElement>("[data-action='transition-select']").forEach((button) => {
      button.addEventListener("click", () => {
        const ownerId = Number(button.dataset.ownerId || 0);
        const group = button.dataset.group as "sequence" | "border" | "gravity";
        const animation = this.document?.animations.find((item) => item.id === ownerId);
        if (!animation) return;
        this.selection = { kind: "transition", ownerId, group, index: 0 };
        this.render();
      });
    });

    container.querySelectorAll<HTMLElement>("[data-action='transition-add']").forEach((button) => {
      button.addEventListener("click", () => {
        const ownerId = Number(button.dataset.ownerId || 0);
        const group = button.dataset.group as "sequence" | "border" | "gravity";
        this.addTransition(ownerId, group);
      });
    });

    container.querySelectorAll<HTMLElement>("[data-action='transition-delete']").forEach((button) => {
      button.addEventListener("click", () => {
        const ownerId = Number(button.dataset.ownerId || 0);
        const group = button.dataset.group as "sequence" | "border" | "gravity";
        const index = Number(button.dataset.index || 0);
        this.deleteTransition(ownerId, group, index);
      });
    });

  }

  private handleInspectorClick(event: Event) {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>("[data-frame-add]");
    if (button) {
      const frameIndex = Number(button.dataset.frameAdd || 0);
      const animation = this.getSelectedAnimation();
      if (!animation) return;
      this.commitDocumentMutation(() => {
        animation.sequence.frames = [...animation.sequence.frames, frameIndex];
      });
    }
  }

  private handleInspectorChange(event: Event) {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!input || !input.dataset.path || !this.document) return;
    this.commitInputChange(input);
  }

  private commitInputChange(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
    if (!this.document || !input.dataset.path) return;
    const path = input.dataset.path;
    const previous = getPathValue(this.document as unknown as Record<string, unknown>, path);
    const next = parseEditorValue(input);
    if (previous === next) return;

    this.commitDocumentMutation(() => {
      if (path.endsWith("sequence.framesText")) {
        const animation = this.getSelectedAnimation();
        if (!animation) return;
        animation.sequence.frames = String(next)
          .split(",")
          .map((part) => Number(part.trim()))
          .filter((value) => Number.isInteger(value) && value >= 0);
        return;
      }

      setPathValue(this.document as unknown as Record<string, unknown>, path.replace(".framesText", ""), next);

      if (path.startsWith("animations.") && path.endsWith(".id")) {
        this.rewriteAnimationReferences(previous, next);
      }
      if (path.startsWith("spawns.") && path.endsWith(".id")) {
        this.renameLayoutKey(`spawn:${previous}:${path.match(/spawns\.(\d+)\.id/)?.[1] || "0"}`, `spawn:${next}:${path.match(/spawns\.(\d+)\.id/)?.[1] || "0"}`);
      }
      if (path.startsWith("children.") && path.endsWith(".animation_id")) {
        this.renameLayoutKey(`child:${previous}:${path.match(/children\.(\d+)\.animation_id/)?.[1] || "0"}`, `child:${next}:${path.match(/children\.(\d+)\.animation_id/)?.[1] || "0"}`);
      }
      if (path.endsWith("image.tiles_x") || path.endsWith("image.tiles_y")) {
        this.layout = mergeLayout(this.document!, this.layout);
      }
      if (path.endsWith("sequence.repeat_from") && this.selection?.kind === "animation") {
        const animation = this.getSelectedAnimation();
        if (animation && animation.sequence.repeat_from >= animation.sequence.frames.length) {
          animation.sequence.repeat_from = Math.max(0, animation.sequence.frames.length - 1);
        }
      }
    });
  }

  private commitDocumentMutation(mutator: () => void) {
    if (!this.document) return;
    mutator();
    this.pushHistory();
    this.markDirty();
    this.render();
  }

  private rewriteAnimationReferences(previous: unknown, next: unknown) {
    if (!this.document || typeof previous !== "number" || typeof next !== "number") return;
    if (previous === next) return;

    for (const animation of this.document.animations) {
      for (const group of [animation.sequence.nexts, animation.border, animation.gravity] as const) {
        for (const transition of group || []) {
          if (transition.value === previous) {
            transition.value = next;
          }
        }
      }
    }
    for (const spawn of this.document.spawns) {
      if (spawn.next.value === previous) {
        spawn.next.value = next;
      }
    }
    for (const child of this.document.children || []) {
      if (child.next.value === previous) {
        child.next.value = next;
      }
      if (child.animation_id === previous) {
        child.animation_id = next;
      }
    }
    if (this.selection?.kind === "animation" && this.selection.id === previous) {
      this.selection = { kind: "animation", id: next };
    }

    this.renameLayoutKey(`animation:${previous}`, `animation:${next}`);
  }

  private renameLayoutKey(oldKey: string, nextKey: string) {
    if (this.layout.nodes[oldKey]) {
      this.layout.nodes[nextKey] = this.layout.nodes[oldKey];
      delete this.layout.nodes[oldKey];
    }
  }

  private addTransition(ownerId: number, group: "sequence" | "border" | "gravity") {
    if (!this.document) return;
    const animation = this.document.animations.find((item) => item.id === ownerId);
    if (!animation) return;
    this.commitDocumentMutation(() => {
      const list = ((animation as any)[group] as Array<{ probability: number; only?: string; value: number }> | undefined) || [];
      if (!(animation as any)[group]) {
        (animation as any)[group] = list;
      }
      list.push({ probability: 0, only: "none", value: animation.id });
      this.selection = { kind: "transition", ownerId, group, index: list.length - 1 };
    });
  }

  private deleteTransition(ownerId: number, group: "sequence" | "border" | "gravity", index: number) {
    if (!this.document) return;
    const animation = this.document.animations.find((item) => item.id === ownerId);
    const list = animation ? ((animation as any)[group] as Array<unknown> | undefined) : undefined;
    if (!animation || !list) return;
    this.commitDocumentMutation(() => {
      list.splice(index, 1);
      this.selection = { kind: "animation", id: ownerId };
    });
  }

  private beginNodeDrag(nodeKey: string, event: PointerEvent) {
    if (!this.document) return;
    const node = this.layout.nodes[nodeKey];
    if (!node) return;

    this.dragState = {
      key: nodeKey,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      moved: false,
    };

    const move = (moveEvent: PointerEvent) => {
      if (!this.dragState) return;
      const dx = (moveEvent.clientX - this.dragState.startPointerX) / this.layout.viewport.zoom;
      const dy = (moveEvent.clientY - this.dragState.startPointerY) / this.layout.viewport.zoom;
      const nextX = this.dragState.startNodeX + dx;
      const nextY = this.dragState.startNodeY + dy;
      this.layout.nodes[nodeKey] = { x: nextX, y: nextY };
      this.dragState.moved = true;
      this.renderGraph();
    };

    const up = () => {
      window.removeEventListener("pointermove", move as EventListener);
      window.removeEventListener("pointerup", up as EventListener);
      if (this.dragState?.moved) {
        this.pushHistory();
        this.markDirty();
      }
      this.dragState = null;
    };

    window.addEventListener("pointermove", move as EventListener);
    window.addEventListener("pointerup", up as EventListener);
  }

  private handleStagePointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-node-key]") || target?.closest("[data-edge-key]")) {
      return;
    }
    this.panState = {
      active: true,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startPanX: this.layout.viewport.x,
      startPanY: this.layout.viewport.y,
    };

    const move = (moveEvent: PointerEvent) => {
      if (!this.panState.active) return;
      this.layout.viewport.x = this.panState.startPanX + (moveEvent.clientX - this.panState.startPointerX);
      this.layout.viewport.y = this.panState.startPanY + (moveEvent.clientY - this.panState.startPointerY);
      this.renderGraph();
    };

    const up = () => {
      this.panState.active = false;
      window.removeEventListener("pointermove", move as EventListener);
      window.removeEventListener("pointerup", up as EventListener);
      this.pushHistory();
      this.markDirty();
    };

    window.addEventListener("pointermove", move as EventListener);
    window.addEventListener("pointerup", up as EventListener);
  }

  private handleZoom(event: WheelEvent) {
    if (!this.document) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const step = direction > 0 ? 0.08 : -0.08;
    const nextZoom = Math.min(2.5, Math.max(0.25, this.layout.viewport.zoom + step));
    const stage = this.els.graphStage.getBoundingClientRect();
    const pointerX = event.clientX - stage.left;
    const pointerY = event.clientY - stage.top;
    const contentX = (pointerX - this.layout.viewport.x) / this.layout.viewport.zoom;
    const contentY = (pointerY - this.layout.viewport.y) / this.layout.viewport.zoom;
    this.layout.viewport.x = pointerX - contentX * nextZoom;
    this.layout.viewport.y = pointerY - contentY * nextZoom;
    this.layout.viewport.zoom = nextZoom;
    this.renderGraph();
    this.markDirty();
  }

  private renderValidation() {
    const issues = [...this.validation.errors, ...this.validation.warnings];
    this.els.validationSummary.textContent = `${this.validation.errors.length} errors, ${this.validation.warnings.length} warnings`;
    this.els.validationList.innerHTML = issues.map((issue) => `
      <div class="validation-item ${issue.severity}" data-path="${escapeAttr(issue.path)}">
        <div class="meta">
          <div class="title">${escapeHtml(issue.severity.toUpperCase())}</div>
          <div class="subtitle">${escapeHtml(formatIssue(issue))}</div>
        </div>
      </div>
    `).join("") || '<div class="selection-empty">No validation issues.</div>';
    this.els.validationList.querySelectorAll<HTMLElement>("[data-path]").forEach((item) => {
      item.addEventListener("click", () => this.focusPath(item.dataset.path || ""));
    });
  }

  private focusPath(path: string) {
    if (!this.document) return;
    if (path.startsWith("animations[")) {
      const match = path.match(/animations\[(\d+)\]/);
      if (match) {
        const animation = this.document.animations[Number(match[1])];
        if (animation) {
          this.selection = { kind: "animation", id: animation.id };
        }
      }
    } else if (path.startsWith("spawns[")) {
      const match = path.match(/spawns\[(\d+)\]/);
      if (match) {
        this.selection = { kind: "spawn", index: Number(match[1]) };
      }
    } else if (path.startsWith("children[")) {
      const match = path.match(/children\[(\d+)\]/);
      if (match) {
        this.selection = { kind: "child", index: Number(match[1]) };
      }
    }
    this.render();
  }

  private renderStatus() {
    const status = this.dirty ? "unsaved changes" : "saved";
    const source = this.documentPath ? basename(this.documentPath) : "no document";
    this.setStatus(`${source} | ${status}`);
  }
}

function escapeHtml(value: string) {
  return value
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).split("\n").join("&#10;");
}
