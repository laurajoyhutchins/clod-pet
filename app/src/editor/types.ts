export type PanelStyle =
  | "windows-95"
  | "windows-98"
  | "windows-2000"
  | "windows-xp"
  | "windows-vista"
  | "windows-7"
  | "windows-10"
  | "windows-11"
  | "mac-platinum"
  | "mac-aqua"
  | "mac-graphite";

export interface ModernTransition {
  probability: number;
  only?: string;
  value: number;
}

export interface ModernMovement {
  x: string;
  y: string;
  interval: string;
  offset_y?: number;
  opacity?: number;
}

export interface ModernSequence {
  frames: number[];
  nexts?: ModernTransition[];
  action?: string;
  repeat: string;
  repeat_from: number;
}

export interface ModernAnimation {
  id: number;
  name: string;
  start: ModernMovement;
  end?: ModernMovement;
  sequence: ModernSequence;
  border?: ModernTransition[];
  gravity?: ModernTransition[];
}

export interface ModernSpawn {
  id: number;
  probability: number;
  x: string;
  y: string;
  next: ModernTransition;
}

export interface ModernChild {
  animation_id: number;
  x: string;
  y: string;
  next: ModernTransition;
}

export interface ModernSound {
  animation_id: number;
  probability: number;
  loop?: number;
  base64: string;
  mime_type?: string;
}

export interface ModernHeader {
  author?: string;
  title?: string;
  petname?: string;
  version?: string;
  info?: string;
  application?: number;
  icon?: string;
}

export interface ModernImage {
  tiles_x?: number;
  tiles_y?: number;
  spritesheet?: string;
  transparency?: string;
}

export interface ModernPetDocument {
  header: ModernHeader;
  image: ModernImage;
  spawns: ModernSpawn[];
  animations: ModernAnimation[];
  children?: ModernChild[];
  sounds?: ModernSound[];
  [key: string]: unknown;
}

export interface EditorLayoutNode {
  x: number;
  y: number;
}

export interface EditorLayoutState {
  nodes: Record<string, EditorLayoutNode>;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

export interface EditorPreviewState {
  spritesheetDataUrl: string | null;
  iconDataUrl: string | null;
  spritesheetError: string | null;
  iconError: string | null;
}

export interface EditorRecentDocument {
  path: string;
  title: string;
  petName: string;
  openedAt: string;
}

export interface EditorDocumentSnapshot {
  document: ModernPetDocument;
  layout: EditorLayoutState;
}

export interface EditorReadResult {
  documentPath: string;
  petDir: string;
  document: ModernPetDocument;
  layout: EditorLayoutState;
  previews: EditorPreviewState;
  recentDocuments: EditorRecentDocument[];
}

export interface EditorSaveResult {
  documentPath: string;
  petDir: string;
  recentDocuments: EditorRecentDocument[];
}

export interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
  entityKey?: string;
}

