import type { EditorLayoutState, ModernPetDocument } from "./types";

export type GraphNodeKind = "animation" | "spawn" | "child";
export type GraphEdgeKind = "sequence" | "border" | "gravity" | "spawn" | "child";

export interface GraphNode {
  key: string;
  kind: GraphNodeKind;
  id: number;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  previewFrame?: number;
  previewTilesX?: number;
  previewTilesY?: number;
  summary?: string;
}

export interface GraphEdge {
  key: string;
  kind: GraphEdgeKind;
  sourceKey: string;
  targetKey: string;
  sourceId: number;
  targetId: number;
  label: string;
  probability: number;
  only?: string;
  index: number;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeByKey: Map<string, GraphNode>;
  nodeById: Map<number, GraphNode[]>;
}

function getNodePosition(layout: EditorLayoutState, key: string, fallbackX: number, fallbackY: number) {
  return layout.nodes[key] || { x: fallbackX, y: fallbackY };
}

function animationLabel(animationId: number, name: string) {
  return `#${animationId} ${name || "unnamed"}`;
}

export function buildGraphModel(document: ModernPetDocument, layout: EditorLayoutState): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeByKey = new Map<string, GraphNode>();
  const nodeById = new Map<number, GraphNode[]>();
  const animationMap = new Map<number, ModernPetDocument["animations"][number]>();

  for (const animation of document.animations) {
    animationMap.set(animation.id, animation);
  }

  document.animations.forEach((animation, index) => {
    const key = `animation:${animation.id}`;
    const pos = getNodePosition(layout, key, 340 + (index % 4) * 280, 140 + Math.floor(index / 4) * 210);
    const node: GraphNode = {
      key,
      kind: "animation",
      id: animation.id,
      title: animation.name || animationLabel(animation.id, animation.name),
      subtitle: `frames ${animation.sequence.frames.length} | repeat ${animation.sequence.repeat} | repeat_from ${animation.sequence.repeat_from}`,
      x: pos.x,
      y: pos.y,
      width: 240,
      height: 160,
      previewFrame: animation.sequence.frames[0] ?? 0,
      previewTilesX: document.image.tiles_x,
      previewTilesY: document.image.tiles_y,
      summary: `${animation.start.x}, ${animation.start.y} -> ${animation.end?.x ?? animation.start.x}, ${animation.end?.y ?? animation.start.y}`,
    };
    nodes.push(node);
    nodeByKey.set(key, node);
    const bucket = nodeById.get(animation.id) || [];
    bucket.push(node);
    nodeById.set(animation.id, bucket);
  });

  document.spawns.forEach((spawn, index) => {
    const key = `spawn:${spawn.id}:${index}`;
    const pos = getNodePosition(layout, key, 40, 120 + index * 110);
    const node: GraphNode = {
      key,
      kind: "spawn",
      id: spawn.id,
      title: `Spawn ${spawn.id}`,
      subtitle: `weight ${spawn.probability}`,
      x: pos.x,
      y: pos.y,
      width: 180,
      height: 90,
    };
    nodes.push(node);
    nodeByKey.set(key, node);
  });

  document.children?.forEach((child, index) => {
    const key = `child:${child.animation_id}:${index}`;
    const pos = getNodePosition(layout, key, 340 + 4 * 280 + 140, 120 + index * 110);
    const node: GraphNode = {
      key,
      kind: "child",
      id: child.animation_id,
      title: `Child ${child.animation_id}`,
      subtitle: `weight ${child.next.probability}`,
      x: pos.x,
      y: pos.y,
      width: 180,
      height: 90,
    };
    nodes.push(node);
    nodeByKey.set(key, node);
  });

  document.animations.forEach((animation) => {
    const sourceKey = `animation:${animation.id}`;

    animation.sequence.nexts?.forEach((next, index) => {
      edges.push({
        key: `${sourceKey}:sequence:${index}:${next.value}`,
        kind: "sequence",
        sourceKey,
        targetKey: `animation:${next.value}`,
        sourceId: animation.id,
        targetId: next.value,
        label: `sequence | ${next.only || "none"} | ${next.probability} -> #${next.value}`,
        probability: next.probability,
        only: next.only,
        index,
      });
    });

    animation.border?.forEach((next, index) => {
      edges.push({
        key: `${sourceKey}:border:${index}:${next.value}`,
        kind: "border",
        sourceKey,
        targetKey: `animation:${next.value}`,
        sourceId: animation.id,
        targetId: next.value,
        label: `border | ${next.only || "none"} | ${next.probability} -> #${next.value}`,
        probability: next.probability,
        only: next.only,
        index,
      });
    });

    animation.gravity?.forEach((next, index) => {
      edges.push({
        key: `${sourceKey}:gravity:${index}:${next.value}`,
        kind: "gravity",
        sourceKey,
        targetKey: `animation:${next.value}`,
        sourceId: animation.id,
        targetId: next.value,
        label: `gravity | ${next.only || "none"} | ${next.probability} -> #${next.value}`,
        probability: next.probability,
        only: next.only,
        index,
      });
    });
  });

  document.spawns.forEach((spawn, index) => {
    edges.push({
      key: `spawn:${spawn.id}:${index}:${spawn.next.value}`,
      kind: "spawn",
      sourceKey: `spawn:${spawn.id}:${index}`,
      targetKey: `animation:${spawn.next.value}`,
      sourceId: spawn.id,
      targetId: spawn.next.value,
      label: `spawn | ${spawn.next.probability} -> #${spawn.next.value}`,
      probability: spawn.next.probability,
      only: spawn.next.only,
      index,
    });
  });

  document.children?.forEach((child, index) => {
    edges.push({
      key: `child:${child.animation_id}:${index}:${child.next.value}`,
      kind: "child",
      sourceKey: `child:${child.animation_id}:${index}`,
      targetKey: `animation:${child.next.value}`,
      sourceId: child.animation_id,
      targetId: child.next.value,
      label: `child | ${child.next.probability} -> #${child.next.value}`,
      probability: child.next.probability,
      only: child.next.only,
      index,
    });
  });

  return { nodes, edges, nodeByKey, nodeById };
}

