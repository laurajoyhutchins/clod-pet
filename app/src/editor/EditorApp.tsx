import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import { cloneDocument, rewriteAnimationReferences, snapshotDocument } from "./document";
import { buildGraphModel, type GraphEdgeKind } from "./graph";
import { computeElkLayout, mergeLayout } from "./layout";
import { drawFrameToCanvas, loadImage } from "./sprite";
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
  EditorDocumentSnapshot,
  EditorLayoutState,
  EditorRecentDocument,
  EditorReadResult,
  ModernAnimation,
  ModernPetDocument,
  ModernTransition,
  PanelStyle,
  ValidationIssue,
} from "./types";

type Selection =
  | { kind: "animation"; id: number }
  | { kind: "spawn"; index: number }
  | { kind: "child"; index: number }
  | { kind: "transition"; ownerId: number; group: "sequence" | "border" | "gravity"; index: number }
  | null;

interface EditorState {
  document: ModernPetDocument | null;
  documentPath: string | null;
  petDir: string | null;
  layout: EditorLayoutState;
  previews: EditorReadResult["previews"];
  recentDocuments: EditorRecentDocument[];
  selection: Selection;
  dirty: boolean;
  history: EditorDocumentSnapshot[];
  historyIndex: number;
  validation: ValidationResult;
  status: string;
}

interface AnimationNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  summary: string;
  frameSummary: string;
  interval: string;
  action?: string;
  borderCount: number;
  gravityCount: number;
  soundCount: number;
  childCount: number;
  previewFrame: number;
  tilesX: number;
  tilesY: number;
  transparency: string;
  spritesheetDataUrl: string | null;
}

interface SourceNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  summary?: string;
}

const emptyPreviews: EditorReadResult["previews"] = {
  spritesheetDataUrl: null,
  iconDataUrl: null,
  spritesheetError: null,
  iconError: null,
};

const knownOnlyValues = ["none", "floor", "walls", "obstacle", "ceiling", "horizontal", "vertical", "taskbar", "window", "horizontal+"];

class EditorErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="window editor-window editor-boot">
          <h1 className="titlebar">
            <span className="titlebar-icon" aria-hidden="true" />
            <span className="titlebar-title" id="window-title">Clod Pet - Animation Editor</span>
          </h1>
          <div className="editor-runtime-error">
            <strong>Editor failed to render.</strong>
            <pre>{this.state.error.message}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function basename(value: string) {
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] || value;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function initialLayout(): EditorLayoutState {
  return { nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } };
}

function makeInitialState(): EditorState {
  return {
    document: null,
    documentPath: null,
    petDir: null,
    layout: initialLayout(),
    previews: emptyPreviews,
    recentDocuments: [],
    selection: null,
    dirty: false,
    history: [],
    historyIndex: -1,
    validation: { errors: [], warnings: [] },
    status: "Loading editor...",
  };
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
    const record = cursor as Record<string, unknown>;
    if (record[part] === undefined) {
      record[part] = /^\d+$/.test(parts[i + 1] || "") ? [] : {};
    }
    cursor = record[part];
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cursor)) {
    cursor[Number(last)] = value;
  } else {
    (cursor as Record<string, unknown>)[last] = value;
  }
}

function parseInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): unknown {
  if (input instanceof HTMLInputElement && input.type === "number") {
    const value = input.value.trim();
    return value === "" ? 0 : Number(value);
  }
  return input.value;
}

function transitionPath(group: "sequence" | "border" | "gravity", index: number) {
  return group === "sequence" ? `sequence.nexts[${index}]` : `${group}[${index}]`;
}

function transitionList(animation: ModernAnimation, group: "sequence" | "border" | "gravity"): ModernTransition[] {
  if (group === "sequence") {
    if (!animation.sequence.nexts) animation.sequence.nexts = [];
    return animation.sequence.nexts;
  }
  if (!animation[group]) animation[group] = [];
  return animation[group] || [];
}

function targetLabel(document: ModernPetDocument, animationId: number) {
  const animation = document.animations.find((item) => item.id === animationId);
  return animation ? `#${animation.id} ${animation.name || "unnamed"}` : `#${animationId}`;
}

function validate(document: ModernPetDocument | null, previews: EditorReadResult["previews"]) {
  return document ? validateDocumentStructure(document, previews) : { errors: [], warnings: [] };
}

function SpritePreview({
  dataUrl,
  frameIndex,
  tilesX,
  tilesY,
  transparency,
  className = "sprite-preview",
}: {
  dataUrl: string | null;
  frameIndex: number;
  tilesX: number;
  tilesY: number;
  transparency: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl) return;
    let cancelled = false;
    loadImage(dataUrl)
      .then((image) => {
        if (!cancelled) drawFrameToCanvas(canvas, image, frameIndex, tilesX, tilesY, transparency);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dataUrl, frameIndex, tilesX, tilesY, transparency]);

  return <canvas ref={canvasRef} className={className} width={48} height={48} />;
}

function PlaybackPreview({ animation, document, previews }: { animation: ModernAnimation; document: ModernPetDocument; previews: EditorReadResult["previews"] }) {
  const [frameOffset, setFrameOffset] = useState(0);
  const frames = animation.sequence.frames.length > 0 ? animation.sequence.frames : [0];
  const interval = Math.max(40, Number.parseInt(animation.start.interval, 10) || 250);

  useEffect(() => {
    const id = window.setInterval(() => setFrameOffset((value) => (value + 1) % frames.length), interval);
    return () => window.clearInterval(id);
  }, [frames.length, interval]);

  return (
    <SpritePreview
      className="animation-playback"
      dataUrl={previews.spritesheetDataUrl}
      frameIndex={frames[frameOffset] || 0}
      tilesX={document.image.tiles_x || 1}
      tilesY={document.image.tiles_y || 1}
      transparency={document.image.transparency || ""}
    />
  );
}

function AnimationNode({ data }: NodeProps<Node<AnimationNodeData>>) {
  return (
    <div className="graph-node animation">
      <div className="graph-node-header">
        <div>
          <div className="graph-node-title">{data.title}</div>
          <div className="graph-node-subtitle">{data.subtitle}</div>
        </div>
      </div>
      <div className="graph-node-body">
        <SpritePreview
          dataUrl={data.spritesheetDataUrl}
          frameIndex={data.previewFrame}
          tilesX={data.tilesX}
          tilesY={data.tilesY}
          transparency={data.transparency}
        />
        <div className="graph-node-summary">{data.frameSummary}</div>
        <div className="graph-node-summary">{data.summary}</div>
        <div className="graph-node-summary">interval {data.interval} | transparency {data.transparency || "none"}</div>
        <div className="graph-node-badges">
          {data.action ? <span className="badge">action {data.action}</span> : null}
          {data.borderCount ? <span className="badge">border {data.borderCount}</span> : null}
          {data.gravityCount ? <span className="badge">gravity {data.gravityCount}</span> : null}
          {data.soundCount ? <span className="badge">sounds {data.soundCount}</span> : null}
          {data.childCount ? <span className="badge">children {data.childCount}</span> : null}
        </div>
      </div>
    </div>
  );
}

function SourceNode({ data }: NodeProps<Node<SourceNodeData>>) {
  return (
    <div className="graph-node source">
      <div className="graph-node-header">
        <div>
          <div className="graph-node-title">{data.title}</div>
          <div className="graph-node-subtitle">{data.subtitle}</div>
        </div>
      </div>
      {data.summary ? <div className="graph-node-summary">{data.summary}</div> : null}
    </div>
  );
}

function GraphSurface({
  state,
  setState,
  recordSnapshot,
}: {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  recordSnapshot: (document: ModernPetDocument, layout: EditorLayoutState, selection?: Selection) => void;
}) {
  const reactFlow = useReactFlow();
  const nodeTypes = useMemo(() => ({ animation: AnimationNode, source: SourceNode }), []);
  const graphModel = useMemo(() => state.document ? buildGraphModel(state.document, state.layout) : null, [state.document, state.layout]);

  const nodes = useMemo<Node[]>(() => {
    if (!state.document || !graphModel) return [];
    const filter = "";
    return graphModel.nodes
      .filter((node) => !filter || `${node.id} ${node.title} ${node.subtitle}`.toLowerCase().includes(filter))
      .map((node) => {
        const animation = node.kind === "animation" ? state.document?.animations.find((item) => item.id === node.id) : null;
        const selected = state.selection?.kind === "animation" && state.selection.id === node.id;
        if (animation) {
          return {
            id: node.key,
            type: "animation",
            position: { x: node.x, y: node.y },
            selected,
            data: {
              title: `#${animation.id} ${animation.name || "unnamed"}`,
              subtitle: `${animation.sequence.frames.length} frames | repeat ${animation.sequence.repeat} from ${animation.sequence.repeat_from}`,
              frameSummary: `frames ${animation.sequence.frames.slice(0, 8).join(", ")}${animation.sequence.frames.length > 8 ? ", ..." : ""}`,
              summary: `${animation.start.x}, ${animation.start.y} -> ${animation.end?.x ?? animation.start.x}, ${animation.end?.y ?? animation.start.y}`,
              interval: animation.start.interval,
              action: animation.sequence.action,
              borderCount: animation.border?.length || 0,
              gravityCount: animation.gravity?.length || 0,
              soundCount: state.document?.sounds?.filter((sound) => sound.animation_id === animation.id).length || 0,
              childCount: state.document?.children?.filter((child) => child.animation_id === animation.id).length || 0,
              previewFrame: animation.sequence.frames[0] || 0,
              tilesX: state.document?.image.tiles_x || 1,
              tilesY: state.document?.image.tiles_y || 1,
              transparency: state.document?.image.transparency || "",
              spritesheetDataUrl: state.previews.spritesheetDataUrl,
            },
          };
        }
        return {
          id: node.key,
          type: "source",
          position: { x: node.x, y: node.y },
          selected: state.selection?.kind === node.kind && "index" in state.selection && node.key.endsWith(`:${state.selection.index}`),
          data: {
            title: node.title,
            subtitle: node.subtitle,
            summary: node.summary,
          },
        };
      });
  }, [graphModel, state.document, state.layout, state.previews.spritesheetDataUrl, state.selection]);

  const edges = useMemo<Edge[]>(() => {
    if (!graphModel) return [];
    const colorByKind: Record<GraphEdgeKind, string> = {
      sequence: "var(--editor-edge-sequence)",
      border: "var(--editor-edge-border)",
      gravity: "var(--editor-edge-gravity)",
      spawn: "var(--editor-edge-muted)",
      child: "var(--editor-edge-muted)",
    };
    return graphModel.edges.map((edge) => ({
      id: edge.key,
      source: edge.sourceKey,
      target: edge.targetKey,
      label: edge.label,
      selected: state.selection?.kind === "transition" && state.selection.ownerId === edge.sourceId && state.selection.group === edge.kind && state.selection.index === edge.index,
      markerEnd: { type: MarkerType.ArrowClosed, color: colorByKind[edge.kind] },
      style: {
        stroke: colorByKind[edge.kind],
        strokeWidth: 2,
        strokeDasharray: edge.kind === "spawn" || edge.kind === "child" ? "6 4" : undefined,
      },
      labelBgStyle: { fill: "var(--win98-input)", fillOpacity: 0.95 },
      labelStyle: { fill: "var(--win98-text)", fontSize: 10 },
      className: `edge-${edge.kind}`,
    }));
  }, [graphModel, state.selection]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (!state.document) return;
    if (node.id.startsWith("animation:")) {
      setState((prev) => ({ ...prev, selection: { kind: "animation", id: Number(node.id.split(":")[1]) } }));
    } else if (node.id.startsWith("spawn:")) {
      setState((prev) => ({ ...prev, selection: { kind: "spawn", index: Number(node.id.split(":")[2] || 0) } }));
    } else if (node.id.startsWith("child:")) {
      setState((prev) => ({ ...prev, selection: { kind: "child", index: Number(node.id.split(":")[2] || 0) } }));
    }
  }, [setState, state.document]);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    const parts = edge.id.split(":");
    if (parts.length < 4) return;
    const group = parts[2];
    const index = Number(parts[3]);
    if (group === "spawn") setState((prev) => ({ ...prev, selection: { kind: "spawn", index } }));
    else if (group === "child") setState((prev) => ({ ...prev, selection: { kind: "child", index } }));
    else setState((prev) => ({ ...prev, selection: { kind: "transition", ownerId: Number(parts[1]), group: group as "sequence" | "border" | "gravity", index } }));
  }, [setState]);

  const onNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    if (!state.document) return;
    const nextLayout = deepClone(state.layout);
    nextLayout.nodes[node.id] = { x: node.position.x, y: node.position.y };
    recordSnapshot(state.document, nextLayout, state.selection);
  }, [recordSnapshot, state.document, state.layout, state.selection]);

  const onMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    if (!state.document) return;
    setState((prev) => ({
      ...prev,
      layout: { ...prev.layout, viewport },
    }));
  }, [setState, state.document]);

  useEffect(() => {
    if (state.layout.viewport) {
      reactFlow.setViewport(state.layout.viewport, { duration: 0 });
    }
  }, [reactFlow, state.documentPath]);

  if (!state.document) {
    return <div className="selection-empty graph-empty">Open a document to begin.</div>;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.2}
      maxZoom={2.5}
      panOnScroll
      selectionOnDrag
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onNodeDragStop={onNodeDragStop}
      onMoveEnd={onMoveEnd}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

export function EditorApp() {
  const [state, setState] = useState<EditorState>(() => makeInitialState());
  const stateRef = useRef(state);
  const bootstrapPathRef = useRef<string | null>(null);
  const [themeStyle, setThemeStyle] = useState<PanelStyle>("windows-98");
  const [search, setSearch] = useState("");
  const reactFlow = useReactFlow();

  useEffect(() => {
    stateRef.current = state;
    const title = state.document?.header.title || state.document?.header.petname || "Animation Editor";
    const titleEl = document.getElementById("window-title");
    if (titleEl) titleEl.textContent = `${state.dirty ? "* " : ""}Clod Pet - ${title}`;
  }, [state]);

  const recordSnapshot = useCallback((document: ModernPetDocument, layout: EditorLayoutState, selection?: Selection) => {
    const validation = validate(document, stateRef.current.previews);
    setState((prev) => {
      const history = prev.history.slice(0, prev.historyIndex + 1);
      history.push(snapshotDocument(document, layout));
      return {
        ...prev,
        document,
        layout,
        selection: selection === undefined ? prev.selection : selection,
        dirty: true,
        validation,
        history,
        historyIndex: history.length - 1,
        status: `${prev.documentPath ? basename(prev.documentPath) : "document"} | unsaved changes`,
      };
    });
  }, []);

  const loadDocument = useCallback(async (documentPath: string) => {
    const result = await readDocument(documentPath);
    const document = cloneDocument(result.document);
    const layout = mergeLayout(document, result.layout);
    setState((prev) => ({
      ...prev,
      document,
      documentPath: result.documentPath,
      petDir: result.petDir,
      layout,
      previews: result.previews,
      recentDocuments: result.recentDocuments,
      selection: document.animations[0] ? { kind: "animation", id: document.animations[0].id } : null,
      dirty: false,
      history: [snapshotDocument(document, layout)],
      historyIndex: 0,
      validation: validate(document, result.previews),
      status: `${basename(result.documentPath)} | saved`,
    }));
  }, []);

  const loadBootstrapDocument = useCallback((documentPath: string) => {
    if (!documentPath || bootstrapPathRef.current === documentPath) return;
    bootstrapPathRef.current = documentPath;
    void loadDocument(documentPath);
  }, [loadDocument]);

  const requestLoadDocument = useCallback(async (documentPath: string) => {
    if (stateRef.current.dirty && !window.confirm("Discard unsaved changes?")) return;
    await loadDocument(documentPath);
  }, [loadDocument]);

  useEffect(() => {
    const init = async () => {
      const bootstrapPromise = window.clodPet.editor.getBootstrapPath().catch(() => "../pets/eSheep-modern/animations.json");
      const settingsPromise = window.clodPet.control.getSettings().catch(() => ({} as Record<string, unknown>));
      const recentDocumentsPromise = getRecentDocuments().catch(() => []);

      const bootstrapPath = await bootstrapPromise;
      loadBootstrapDocument(bootstrapPath);

      const settings = await settingsPromise;
      const value = settings.PanelStyle;
      const style = typeof value === "string" && isPanelStyle(value) ? value : "windows-98";
      setThemeStyle(style);
      applyPanelStyle(style);
      const recentDocuments = await recentDocumentsPromise;
      setState((prev) => ({ ...prev, recentDocuments }));
    };
    void init();

    const off = window.clodPet.on("editor:bootstrap", (payload) => {
      const path = typeof payload.path === "string" ? payload.path : "../pets/eSheep-modern/animations.json";
      loadBootstrapDocument(path);
    });
    return off;
  }, [loadBootstrapDocument]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (stateRef.current.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.historyIndex <= 0) return prev;
      const snapshot = prev.history[prev.historyIndex - 1];
      return {
        ...prev,
        document: cloneDocument(snapshot.document),
        layout: mergeLayout(snapshot.document, snapshot.layout),
        historyIndex: prev.historyIndex - 1,
        dirty: true,
        validation: validate(snapshot.document, prev.previews),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.historyIndex >= prev.history.length - 1) return prev;
      const snapshot = prev.history[prev.historyIndex + 1];
      return {
        ...prev,
        document: cloneDocument(snapshot.document),
        layout: mergeLayout(snapshot.document, snapshot.layout),
        historyIndex: prev.historyIndex + 1,
        dirty: true,
        validation: validate(snapshot.document, prev.previews),
      };
    });
  }, []);

  const save = useCallback(async (saveAs: boolean) => {
    const current = stateRef.current;
    if (!current.document || !current.documentPath) return;
    try {
      const result = saveAs
        ? await saveDocumentAs(current.documentPath, current.document, current.layout)
        : await saveDocument(current.documentPath, current.document, current.layout);
      setState((prev) => ({
        ...prev,
        documentPath: result.documentPath,
        petDir: result.petDir,
        recentDocuments: result.recentDocuments,
        dirty: false,
        status: `${basename(result.documentPath)} | saved`,
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, status: `save failed: ${err instanceof Error ? err.message : String(err)}` }));
    }
  }, []);

  const commitField = useCallback((input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
    const current = stateRef.current;
    if (!current.document || !input.dataset.path) return;
    const path = input.dataset.path;
    const nextValue = parseInputValue(input);
    const nextDocument = cloneDocument(current.document);
    const nextLayout = deepClone(current.layout);
    let nextSelection = current.selection;

    if (path.endsWith(".framesText")) {
      const animationId = nextSelection?.kind === "animation" ? nextSelection.id : null;
      const animation = animationId !== null
        ? nextDocument.animations.find((item) => item.id === animationId)
        : null;
      if (!animation) return;
      animation.sequence.frames = String(nextValue)
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((value) => Number.isInteger(value) && value >= 0);
    } else {
      const match = path.match(/^animations\.(\d+)\.id$/);
      const previousId = match ? nextDocument.animations[Number(match[1])]?.id : null;
      setPathValue(nextDocument as unknown as Record<string, unknown>, path, nextValue);
      if (match && typeof previousId === "number" && typeof nextValue === "number") {
        rewriteAnimationReferences(nextDocument, previousId, nextValue);
        if (nextLayout.nodes[`animation:${previousId}`]) {
          nextLayout.nodes[`animation:${nextValue}`] = nextLayout.nodes[`animation:${previousId}`];
          delete nextLayout.nodes[`animation:${previousId}`];
        }
        if (nextSelection?.kind === "animation" && nextSelection.id === previousId) {
          nextSelection = { kind: "animation", id: nextValue };
        }
      }
    }
    recordSnapshot(nextDocument, mergeLayout(nextDocument, nextLayout), nextSelection);
  }, [recordSnapshot]);

  const addTransition = useCallback((ownerId: number, group: "sequence" | "border" | "gravity") => {
    const current = stateRef.current;
    if (!current.document) return;
    const nextDocument = cloneDocument(current.document);
    const animation = nextDocument.animations.find((item) => item.id === ownerId);
    if (!animation) return;
    const list = transitionList(animation, group);
    list.push({ probability: 0, only: "none", value: animation.id });
    recordSnapshot(nextDocument, current.layout, { kind: "transition", ownerId, group, index: list.length - 1 });
  }, [recordSnapshot]);

  const deleteSelection = useCallback(() => {
    const current = stateRef.current;
    if (!current.document || !current.selection) return;
    const nextDocument = cloneDocument(current.document);
    const nextLayout = deepClone(current.layout);

    if (current.selection.kind === "transition") {
      const ownerId = current.selection.ownerId;
      const owner = nextDocument.animations.find((item) => item.id === ownerId);
      if (!owner || !window.confirm("Delete selected transition?")) return;
      transitionList(owner, current.selection.group).splice(current.selection.index, 1);
      recordSnapshot(nextDocument, nextLayout, { kind: "animation", id: ownerId });
      return;
    }

    if (current.selection.kind === "animation") {
      const id = current.selection.id;
      if (!window.confirm(`Delete animation #${id} and references to it?`)) return;
      nextDocument.animations = nextDocument.animations.filter((animation) => animation.id !== id);
      for (const animation of nextDocument.animations) {
        animation.sequence.nexts = (animation.sequence.nexts || []).filter((transition) => transition.value !== id);
        animation.border = (animation.border || []).filter((transition) => transition.value !== id);
        animation.gravity = (animation.gravity || []).filter((transition) => transition.value !== id);
      }
      nextDocument.spawns = nextDocument.spawns.filter((spawn) => spawn.next.value !== id);
      nextDocument.children = (nextDocument.children || []).filter((child) => child.animation_id !== id && child.next.value !== id);
      nextDocument.sounds = (nextDocument.sounds || []).filter((sound) => sound.animation_id !== id);
      delete nextLayout.nodes[`animation:${id}`];
      recordSnapshot(nextDocument, nextLayout, nextDocument.animations[0] ? { kind: "animation", id: nextDocument.animations[0].id } : null);
    }
  }, [recordSnapshot]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openAnimationFile().then((file) => {
          if (file) void requestLoadDocument(file);
        });
      } else if (ctrl && event.key.toLowerCase() === "s" && event.shiftKey) {
        event.preventDefault();
        void save(true);
      } else if (ctrl && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save(false);
      } else if (ctrl && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (ctrl && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (ctrl && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete") {
        event.preventDefault();
        deleteSelection();
      } else if (!ctrl && event.key.toLowerCase() === "f") {
        event.preventDefault();
        void reactFlow.fitView({ padding: 0.2, duration: 180 });
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [deleteSelection, reactFlow, redo, requestLoadDocument, save, undo]);

  const filteredAnimations = useMemo(() => {
    const filter = search.trim().toLowerCase();
    return (state.document?.animations || []).filter((animation) => !filter || `${animation.id} ${animation.name}`.toLowerCase().includes(filter));
  }, [search, state.document]);

  const selectedAnimationId = state.selection?.kind === "animation" ? state.selection.id : null;
  const selectedAnimation = selectedAnimationId !== null
    ? state.document?.animations.find((item) => item.id === selectedAnimationId) || null
    : null;

  const selectedTransition = state.selection?.kind === "transition" && state.document
    ? (() => {
      const ownerId = state.selection.kind === "transition" ? state.selection.ownerId : -1;
      const animationIndex = state.document!.animations.findIndex((item) => item.id === ownerId);
      const animation = state.document!.animations[animationIndex];
      if (!animation || state.selection?.kind !== "transition") return null;
      const list = transitionList(animation, state.selection.group);
      return { animation, animationIndex, transition: list[state.selection.index], group: state.selection.group, index: state.selection.index };
    })()
    : null;

  const onRelayout = useCallback(async () => {
    const current = stateRef.current;
    if (!current.document) return;
    const layout = await computeElkLayout(current.document, current.layout);
    recordSnapshot(current.document, layout, current.selection);
    window.setTimeout(() => void reactFlow.fitView({ padding: 0.2, duration: 180 }), 0);
  }, [reactFlow, recordSnapshot]);

  return (
    <div className="window editor-window">
      <h1 className="titlebar">
        <span className="titlebar-icon" aria-hidden="true" />
        <span className="titlebar-title" id="window-title">Clod Pet - Animation Editor</span>
        <div className="titlebar-controls">
          <button className="titlebar-close" title="Close" aria-label="Close" onClick={() => void window.clodPet.editor.closeWindow()} />
          <button className="titlebar-minimize" title="Minimize" aria-label="Minimize" onClick={() => void window.clodPet.editor.minimizeWindow()} />
          <button className="titlebar-zoom" title="Zoom" aria-label="Zoom" onClick={() => void window.clodPet.editor.zoomWindow()} />
        </div>
      </h1>

      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button className="btn btn-small" onClick={() => void openAnimationFile().then((file) => {
            if (file) void requestLoadDocument(file);
          })}>Open File</button>
          <button className="btn btn-small" onClick={() => void openPetDirectory().then((dir) => {
            if (dir) void requestLoadDocument(dir);
          })}>Open Dir</button>
          <button className="btn btn-small" disabled={!state.documentPath} onClick={() => state.documentPath && void showItemInFolder(state.documentPath)}>Show In Folder</button>
        </div>
        <div className="toolbar-group">
          <button className="btn btn-small" disabled={!state.document} onClick={() => void save(false)}>Save</button>
          <button className="btn btn-small" disabled={!state.document} onClick={() => void save(true)}>Save As</button>
          <button className="btn btn-small" disabled={!state.documentPath} onClick={() => state.documentPath && void requestLoadDocument(state.documentPath)}>Revert</button>
        </div>
        <div className="toolbar-group">
          <button className="btn btn-small" disabled={state.historyIndex <= 0} onClick={undo}>Undo</button>
          <button className="btn btn-small" disabled={state.historyIndex >= state.history.length - 1} onClick={redo}>Redo</button>
          <button className="btn btn-small" disabled={!state.document} onClick={() => void onRelayout()}>ELK Layout</button>
          <button className="btn btn-small" disabled={!state.document} onClick={() => void reactFlow.fitView({ padding: 0.2, duration: 180 })}>Fit</button>
          <button className="btn btn-small" disabled={!state.selection} onClick={() => {
            if (!state.selection) return;
            const key = state.selection.kind === "animation"
              ? `animation:${state.selection.id}`
              : state.selection.kind === "spawn"
                ? `spawn:${state.document?.spawns[state.selection.index]?.id}:${state.selection.index}`
                : state.selection.kind === "child"
                  ? `child:${state.document?.children?.[state.selection.index]?.animation_id}:${state.selection.index}`
                  : `animation:${state.selection.ownerId}`;
            const node = state.layout.nodes[key];
            if (node) reactFlow.setCenter(node.x + 120, node.y + 80, { zoom: state.layout.viewport.zoom, duration: 180 });
          }}>Center</button>
        </div>
        <div className="toolbar-group toolbar-search">
          <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search animations, spawns, children" />
        </div>
        <div className="toolbar-group toolbar-theme">
          <select value={themeStyle} onChange={(event) => {
            const value = event.target.value;
            if (!isPanelStyle(value)) return;
            setThemeStyle(value);
            applyPanelStyle(value);
            void window.clodPet.control.setSettings({ PanelStyle: value });
          }}>
            {getPanelStyles().map((style) => <option key={style} value={style}>{style}</option>)}
          </select>
        </div>
        <div className="toolbar-group toolbar-status">{state.validation.errors.length} errors, {state.validation.warnings.length} warnings</div>
      </div>

      <div className="editor-workspace">
        <aside className="editor-sidebar">
          <section className="groupbox">
            <div className="groupbox-title">Recent Documents</div>
            <div className="sidebar-list">
              {state.recentDocuments.length === 0 ? <div className="selection-empty">No recent documents.</div> : state.recentDocuments.map((doc) => (
                <button className="sidebar-item" key={doc.path} onClick={() => void requestLoadDocument(doc.path)}>
                  <span className="meta"><span className="title">{doc.title || doc.petName || basename(doc.path)}</span><span className="subtitle">{doc.path}</span></span>
                </button>
              ))}
            </div>
          </section>
          <section className="groupbox">
            <div className="groupbox-title">Animations</div>
            <div className="sidebar-list">
              {filteredAnimations.map((animation) => (
                <button
                  key={animation.id}
                  className={`sidebar-item ${state.selection?.kind === "animation" && state.selection.id === animation.id ? "active" : ""}`}
                  onClick={() => {
                    setState((prev) => ({ ...prev, selection: { kind: "animation", id: animation.id } }));
                    const node = state.layout.nodes[`animation:${animation.id}`];
                    if (node) reactFlow.setCenter(node.x + 120, node.y + 80, { duration: 180, zoom: state.layout.viewport.zoom });
                  }}
                >
                  <span className="meta"><span className="title">#{animation.id} {animation.name || "unnamed"}</span><span className="subtitle">{animation.sequence.frames.length} frames</span></span>
                </button>
              ))}
            </div>
          </section>
          <section className="groupbox">
            <div className="groupbox-title">Spawns</div>
            <div className="sidebar-list">
              {(state.document?.spawns || []).map((spawn, index) => (
                <button key={`${spawn.id}:${index}`} className={`sidebar-item ${state.selection?.kind === "spawn" && state.selection.index === index ? "active" : ""}`} onClick={() => setState((prev) => ({ ...prev, selection: { kind: "spawn", index } }))}>
                  <span className="meta"><span className="title">Spawn {spawn.id}</span><span className="subtitle">weight {spawn.probability} {"->"} #{spawn.next.value}</span></span>
                </button>
              ))}
            </div>
          </section>
          <section className="groupbox">
            <div className="groupbox-title">Children</div>
            <div className="sidebar-list">
              {(state.document?.children || []).map((child, index) => (
                <button key={`${child.animation_id}:${index}`} className={`sidebar-item ${state.selection?.kind === "child" && state.selection.index === index ? "active" : ""}`} onClick={() => setState((prev) => ({ ...prev, selection: { kind: "child", index } }))}>
                  <span className="meta"><span className="title">Child {child.animation_id}</span><span className="subtitle">weight {child.next.probability} {"->"} #{child.next.value}</span></span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="editor-canvas-shell">
          <div className="graph-toolbar">
            <div className="graph-title">{state.document ? `${state.document.header.title || state.document.header.petname || "untitled"} | ${(state.document.animations || []).length} animations` : "No document loaded"}</div>
            <div className="graph-hint">drag to select | wheel/pinch zoom | space-drag pan | F fit</div>
          </div>
          <div className="graph-stage">
            <GraphSurface state={state} setState={setState} recordSnapshot={recordSnapshot} />
          </div>
        </main>

        <aside className="editor-inspector">
          <section className="groupbox">
            <div className="groupbox-title">Document</div>
            {state.document ? <DocumentInspector document={state.document} onCommit={commitField} /> : <div className="selection-empty">Open a document to inspect it.</div>}
          </section>

          <section className="groupbox">
            <div className="groupbox-title">Selection</div>
            {!state.document || !state.selection ? <div className="selection-empty">Nothing selected.</div> : null}
            {state.document && selectedAnimation ? (
              <AnimationInspector
                document={state.document}
                previews={state.previews}
                animation={selectedAnimation}
                animationIndex={state.document.animations.findIndex((item) => item.id === selectedAnimation.id)}
                onCommit={commitField}
                onAddTransition={addTransition}
                onAddFrame={(frame) => {
                  const current = stateRef.current;
                  if (!current.document) return;
                  const nextDocument = cloneDocument(current.document);
                  const nextAnimation = nextDocument.animations.find((item) => item.id === selectedAnimation.id);
                  if (!nextAnimation) return;
                  nextAnimation.sequence.frames = [...nextAnimation.sequence.frames, frame];
                  recordSnapshot(nextDocument, current.layout, current.selection);
                }}
              />
            ) : null}
            {state.document && selectedTransition?.transition ? (
              <TransitionInspector document={state.document} selected={selectedTransition} onCommit={commitField} onDelete={deleteSelection} />
            ) : null}
            {state.document && state.selection?.kind === "spawn" ? (
              <SpawnInspector document={state.document} index={state.selection.index} onCommit={commitField} />
            ) : null}
            {state.document && state.selection?.kind === "child" ? (
              <ChildInspector document={state.document} index={state.selection.index} onCommit={commitField} />
            ) : null}
          </section>

          <section className="groupbox">
            <div className="groupbox-title">Validation</div>
            <ValidationList issues={[...state.validation.errors, ...state.validation.warnings]} setState={setState} document={state.document} />
          </section>
        </aside>
      </div>

      <div className="editor-statusbar">{state.status}</div>
      <datalist id="only-options">
        {knownOnlyValues.map((value) => <option key={value} value={value} />)}
      </datalist>
    </div>
  );
}

function Field({ label, path, value, type = "text", onCommit, list }: { label: string; path: string; value: string | number; type?: string; onCommit: (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void; list?: string }) {
  return (
    <div className="field-row inline">
      <label>{label}</label>
      <input data-path={path} type={type} min={type === "number" ? 0 : undefined} defaultValue={value} list={list} onBlur={(event) => onCommit(event.currentTarget)} onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(event.currentTarget);
      }} />
    </div>
  );
}

function DocumentInspector({ document, onCommit }: { document: ModernPetDocument; onCommit: (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void }) {
  return (
    <div className="field-grid">
      <Field label="Author" path="header.author" value={document.header.author || ""} onCommit={onCommit} />
      <Field label="Title" path="header.title" value={document.header.title || ""} onCommit={onCommit} />
      <Field label="Pet Name" path="header.petname" value={document.header.petname || ""} onCommit={onCommit} />
      <Field label="Version" path="header.version" value={document.header.version || ""} onCommit={onCommit} />
      <div className="field-row">
        <label>Info</label>
        <textarea data-path="header.info" defaultValue={document.header.info || ""} onBlur={(event) => onCommit(event.currentTarget)} />
      </div>
      <Field label="Application" path="header.application" type="number" value={document.header.application || 1} onCommit={onCommit} />
      <Field label="Icon" path="header.icon" value={document.header.icon || ""} onCommit={onCommit} />
      <Field label="Tiles X" path="image.tiles_x" type="number" value={document.image.tiles_x || 1} onCommit={onCommit} />
      <Field label="Tiles Y" path="image.tiles_y" type="number" value={document.image.tiles_y || 1} onCommit={onCommit} />
      <Field label="Spritesheet" path="image.spritesheet" value={document.image.spritesheet || ""} onCommit={onCommit} />
      <Field label="Transparency" path="image.transparency" value={document.image.transparency || ""} onCommit={onCommit} />
    </div>
  );
}

function AnimationInspector({
  document,
  previews,
  animation,
  animationIndex,
  onCommit,
  onAddTransition,
  onAddFrame,
}: {
  document: ModernPetDocument;
  previews: EditorReadResult["previews"];
  animation: ModernAnimation;
  animationIndex: number;
  onCommit: (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void;
  onAddTransition: (ownerId: number, group: "sequence" | "border" | "gravity") => void;
  onAddFrame: (frame: number) => void;
}) {
  const totalFrames = Math.max(1, (document.image.tiles_x || 1) * (document.image.tiles_y || 1));
  return (
    <div className="field-grid">
      <Field label="ID" path={`animations.${animationIndex}.id`} type="number" value={animation.id} onCommit={onCommit} />
      <Field label="Name" path={`animations.${animationIndex}.name`} value={animation.name} onCommit={onCommit} />
      <Field label="Start X" path={`animations.${animationIndex}.start.x`} value={animation.start.x} onCommit={onCommit} />
      <Field label="Start Y" path={`animations.${animationIndex}.start.y`} value={animation.start.y} onCommit={onCommit} />
      <Field label="Start Interval" path={`animations.${animationIndex}.start.interval`} value={animation.start.interval} onCommit={onCommit} />
      <Field label="End X" path={`animations.${animationIndex}.end.x`} value={animation.end?.x || animation.start.x} onCommit={onCommit} />
      <Field label="End Y" path={`animations.${animationIndex}.end.y`} value={animation.end?.y || animation.start.y} onCommit={onCommit} />
      <Field label="End Interval" path={`animations.${animationIndex}.end.interval`} value={animation.end?.interval || animation.start.interval} onCommit={onCommit} />
      <Field label="Frames" path={`animations.${animationIndex}.sequence.framesText`} value={animation.sequence.frames.join(", ")} onCommit={onCommit} />
      <Field label="Repeat" path={`animations.${animationIndex}.sequence.repeat`} value={animation.sequence.repeat} onCommit={onCommit} />
      <Field label="Repeat From" path={`animations.${animationIndex}.sequence.repeat_from`} type="number" value={animation.sequence.repeat_from} onCommit={onCommit} />
      <Field label="Action" path={`animations.${animationIndex}.sequence.action`} value={animation.sequence.action || ""} onCommit={onCommit} />
      <div className="field-actions">
        <button className="btn btn-small" onClick={() => onAddTransition(animation.id, "sequence")}>+ Sequence</button>
        <button className="btn btn-small" onClick={() => onAddTransition(animation.id, "border")}>+ Border</button>
        <button className="btn btn-small" onClick={() => onAddTransition(animation.id, "gravity")}>+ Gravity</button>
      </div>
      <div className="field-row">
        <label>Playback</label>
        <PlaybackPreview animation={animation} document={document} previews={previews} />
      </div>
      <div className="field-row">
        <label>Frame Picker</label>
        <div className="frame-picker">
          {Array.from({ length: totalFrames }, (_, frame) => (
            <button key={frame} type="button" className="btn btn-small frame-button" title={`Add frame ${frame}`} onClick={() => onAddFrame(frame)}>
              <SpritePreview className="frame-tile" dataUrl={previews.spritesheetDataUrl} frameIndex={frame} tilesX={document.image.tiles_x || 1} tilesY={document.image.tiles_y || 1} transparency={document.image.transparency || ""} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransitionInspector({ document, selected, onCommit, onDelete }: { document: ModernPetDocument; selected: { animation: ModernAnimation; animationIndex: number; transition: ModernTransition; group: "sequence" | "border" | "gravity"; index: number }; onCommit: (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void; onDelete: () => void }) {
  const basePath = `animations.${selected.animationIndex}.${transitionPath(selected.group, selected.index)}`;
  return (
    <div className="field-grid">
      <div className="selection-heading">{selected.group} transition from #{selected.animation.id}</div>
      <Field label="Probability" path={`${basePath}.probability`} type="number" value={selected.transition.probability} onCommit={onCommit} />
      <Field label="Only" path={`${basePath}.only`} value={selected.transition.only || "none"} list="only-options" onCommit={onCommit} />
      <div className="field-row inline">
        <label>Target</label>
        <select data-path={`${basePath}.value`} defaultValue={selected.transition.value} onChange={(event) => onCommit(event.currentTarget)}>
          {document.animations.map((animation) => <option key={animation.id} value={animation.id}>{targetLabel(document, animation.id)}</option>)}
        </select>
      </div>
      <div className="field-actions">
        <button className="btn btn-small" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function SpawnInspector({ document, index, onCommit }: { document: ModernPetDocument; index: number; onCommit: (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void }) {
  const spawn = document.spawns[index];
  if (!spawn) return <div className="selection-empty">Spawn not found.</div>;
  return (
    <div className="field-grid">
      <Field label="ID" path={`spawns.${index}.id`} type="number" value={spawn.id} onCommit={onCommit} />
      <Field label="Weight" path={`spawns.${index}.probability`} type="number" value={spawn.probability} onCommit={onCommit} />
      <Field label="X" path={`spawns.${index}.x`} value={spawn.x} onCommit={onCommit} />
      <Field label="Y" path={`spawns.${index}.y`} value={spawn.y} onCommit={onCommit} />
      <Field label="Next Weight" path={`spawns.${index}.next.probability`} type="number" value={spawn.next.probability} onCommit={onCommit} />
      <div className="field-row inline">
        <label>Next Target</label>
        <select data-path={`spawns.${index}.next.value`} defaultValue={spawn.next.value} onChange={(event) => onCommit(event.currentTarget)}>
          {document.animations.map((animation) => <option key={animation.id} value={animation.id}>{targetLabel(document, animation.id)}</option>)}
        </select>
      </div>
    </div>
  );
}

function ChildInspector({ document, index, onCommit }: { document: ModernPetDocument; index: number; onCommit: (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void }) {
  const child = document.children?.[index];
  if (!child) return <div className="selection-empty">Child not found.</div>;
  return (
    <div className="field-grid">
      <Field label="Animation ID" path={`children.${index}.animation_id`} type="number" value={child.animation_id} onCommit={onCommit} />
      <Field label="X" path={`children.${index}.x`} value={child.x} onCommit={onCommit} />
      <Field label="Y" path={`children.${index}.y`} value={child.y} onCommit={onCommit} />
      <Field label="Next Weight" path={`children.${index}.next.probability`} type="number" value={child.next.probability} onCommit={onCommit} />
      <div className="field-row inline">
        <label>Next Target</label>
        <select data-path={`children.${index}.next.value`} defaultValue={child.next.value} onChange={(event) => onCommit(event.currentTarget)}>
          {document.animations.map((animation) => <option key={animation.id} value={animation.id}>{targetLabel(document, animation.id)}</option>)}
        </select>
      </div>
    </div>
  );
}

function ValidationList({ issues, setState, document }: { issues: ValidationIssue[]; setState: React.Dispatch<React.SetStateAction<EditorState>>; document: ModernPetDocument | null }) {
  if (!issues.length) return <div className="selection-empty">No validation issues.</div>;
  return (
    <div className="validation-list">
      {issues.map((issue, index) => (
        <button key={`${issue.path}:${index}`} className={`validation-item ${issue.severity}`} onClick={() => {
          if (!document) return;
          const animationMatch = issue.path.match(/animations\[(\d+)\]/);
          if (animationMatch) {
            const animation = document.animations[Number(animationMatch[1])];
            if (animation) setState((prev) => ({ ...prev, selection: { kind: "animation", id: animation.id } }));
          }
          const spawnMatch = issue.path.match(/spawns\[(\d+)\]/);
          if (spawnMatch) setState((prev) => ({ ...prev, selection: { kind: "spawn", index: Number(spawnMatch[1]) } }));
          const childMatch = issue.path.match(/children\[(\d+)\]/);
          if (childMatch) setState((prev) => ({ ...prev, selection: { kind: "child", index: Number(childMatch[1]) } }));
        }}>
          <span className="meta"><span className="title">{issue.severity.toUpperCase()}</span><span className="subtitle">{issue.path || "document"}: {issue.message}</span></span>
        </button>
      ))}
    </div>
  );
}

export function EditorAppRoot() {
  return (
    <EditorErrorBoundary>
      <ReactFlowProvider>
        <EditorApp />
      </ReactFlowProvider>
    </EditorErrorBoundary>
  );
}
