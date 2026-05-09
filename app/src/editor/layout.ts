import ELK from "elkjs/lib/elk.bundled.js";
import { buildGraphModel } from "./graph";
import type { EditorLayoutState, ModernPetDocument } from "./types";

export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeDefaultLayout(document: ModernPetDocument): EditorLayoutState {
  const animations = [...document.animations].sort((a, b) => a.id - b.id);
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(animations.length, 1))));
  const nodes: EditorLayoutState["nodes"] = {};

  animations.forEach((animation, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    nodes[`animation:${animation.id}`] = {
      x: 340 + col * 280,
      y: 140 + row * 210,
    };
  });

  document.spawns.forEach((spawn, index) => {
    nodes[`spawn:${spawn.id}:${index}`] = {
      x: 40,
      y: 120 + index * 110,
    };
  });

  document.children?.forEach((child, index) => {
    nodes[`child:${child.animation_id}:${index}`] = {
      x: 340 + columns * 280 + 140,
      y: 120 + index * 110,
    };
  });

  return {
    nodes,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
  };
}

export function mergeLayout(document: ModernPetDocument, saved?: Partial<EditorLayoutState> | null): EditorLayoutState {
  const base = computeDefaultLayout(document);
  if (!saved) return base;

  return {
    nodes: {
      ...base.nodes,
      ...(saved.nodes || {}),
    },
    viewport: {
      x: typeof saved.viewport?.x === "number" ? saved.viewport.x : base.viewport.x,
      y: typeof saved.viewport?.y === "number" ? saved.viewport.y : base.viewport.y,
      zoom: typeof saved.viewport?.zoom === "number" ? saved.viewport.zoom : base.viewport.zoom,
    },
  };
}

export function getLayoutBounds(layout: EditorLayoutState, nodeSize = { width: 240, height: 160 }): LayoutBounds | null {
  const entries = Object.values(layout.nodes);
  if (entries.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of entries) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + nodeSize.width);
    maxY = Math.max(maxY, node.y + nodeSize.height);
  }

  return { minX, minY, maxX, maxY };
}

export async function computeElkLayout(document: ModernPetDocument, currentLayout?: EditorLayoutState): Promise<EditorLayoutState> {
  const elk = new ELK();
  const sourceLayout = currentLayout || computeDefaultLayout(document);
  const model = buildGraphModel(document, sourceLayout);
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "80",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
    },
    children: model.nodes.map((node) => ({
      id: node.key,
      width: node.width,
      height: node.height,
    })),
    edges: model.edges.map((edge) => ({
      id: edge.key,
      sources: [edge.sourceKey],
      targets: [edge.targetKey],
    })),
  };

  const result = await elk.layout(graph);
  const nodes: EditorLayoutState["nodes"] = {};
  for (const node of result.children || []) {
    if (typeof node.x === "number" && typeof node.y === "number") {
      nodes[node.id] = { x: node.x + 40, y: node.y + 40 };
    }
  }

  return {
    nodes: {
      ...sourceLayout.nodes,
      ...nodes,
    },
    viewport: sourceLayout.viewport,
  };
}
