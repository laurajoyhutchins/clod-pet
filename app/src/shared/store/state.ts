export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Helper to convert Electron Rectangle to Rect
export function toRect(rect: { x: number; y: number; width: number; height: number }): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

// Helper to convert Rect to Electron Rectangle  
export function toRectangle(rect: Rect): { x: number; y: number; width: number; height: number } {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export type DisplayLike = {
  bounds?: Rect | { x: number; y: number; width: number; height: number };
  workArea?: Rect | { x: number; y: number; width: number; height: number };
};

// Pet instance in store
export interface PetInstance {
  id: string;
  path: string;
  backendPetId: string;
  frameW: number;
  frameH: number;
  currentAnimId: number;
  currentAnimName: string;
  stepFailures?: number;
  lastStepError?: string | null;
  dragOffsetX?: number;
  dragOffsetY?: number;
  state: {
    frameIndex: number;
    x: number;
    y: number;
    offsetY?: number;
    flipH: boolean;
    opacity?: number;
    borderCtx?: number;
  };
  loaded: boolean;
  stopped: boolean;
}

// Backend status
export interface BackendStatus {
  status: 'idle' | 'starting' | 'ready' | 'fatal' | 'disconnected' | 'restarting' | 'stopped' | 'failed' | 'spawn_error';
  url: string | null;
  port: number | null;
  version: string | null;
  lastError: string | null;
  pid: number | null;
  exitCode: number | null;
  available: boolean;
  ready: boolean;
  restartAttempt: number;
  nextRestartAt: string | null;
}

// World context for physics (unified type)
export interface WorldContext {
  screen: Rect;
  workArea: Rect;
  desktop: Rect;
  scale: number;
  volume: number;
}

export interface EngineRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BackendWorldContext {
  screen: EngineRect;
  work_area: EngineRect;
  desktop: EngineRect;
}

// UI state
export interface UIState {
  isChatOpen: boolean;
  isControlPanelOpen: boolean;
  lastError: string | null;
}

// Main world state
export interface WorldState {
  pets: Record<string, PetInstance>;
  backend: BackendStatus;
  environment: WorldContext;
  ui: UIState;
}

// Settings
export interface AppSettings {
  Scale?: number;
  Volume?: number;
  ShowAdvancedSettings?: boolean;
  ShowDiagnostics?: boolean;
  PanelStyle?: string;
  GravityFactor?: number;
  MultiScreenEnabled?: boolean;
  WinForeGround?: boolean;
  StealTaskbarFocus?: boolean;
  AutostartPets?: number;
  CurrentPet?: string;
  [key: string]: unknown;
}

// Pet data from backend
export interface PetData {
  png_base64: string;
  tiles_x: number;
  tiles_y: number;
  frame_w?: number;
  frame_h?: number;
  [key: string]: unknown;
}

// Pet info for UI
export interface PetInfo {
  pet_id: string;
  title?: string;
  pet_name?: string;
  [key: string]: unknown;
}

export interface StepPetPayload {
  pet_id: string;
  x: number;
  y: number;
  offset_y: number;
  flip_h: boolean;
  frame_index: number;
  current_anim_id: number;
  current_anim_name: string;
  next_anim_id: number;
  border_ctx: number;
  interval_ms: number;
  opacity?: number;
  sound?: string;
}

// Backend response
export interface BackendResponse<T = unknown> {
  ok: boolean;
  payload?: T;
  error?: string;
  [key: string]: unknown;
}

// Diagnostics
export interface BackendDiagnostics {
  url: string | null;
  port: number | null;
  pid: number | null;
  launch?: LaunchInfo;
  lastStdout: string;
  lastStderr: string;
  lastError: string | null;
  exitCode: number | null;
  running: boolean;
  state: string;
  ready: boolean;
  available: boolean;
  restartEnabled: boolean;
  restartAttempt: number;
  restartMaxAttempts: number;
  nextRestartAt: string | null;
  fatalError: string | null;
  shutdownReason: string | null;
  exitReason: string | null;
}

export interface LaunchInfo {
  cmd: string;
  args: string[];
  cwd: string;
  port: number;
  petsDir: string;
  useExe: boolean;
  exeExists: boolean;
  backendMode: string;
  executionMode: string;
  restartEnabled: boolean;
  pid?: number;
}

export interface PetsDiagnostics {
  activePetIds: string[];
  petCount: number;
  lastError: string | null;
  lastPetLoad: Record<string, unknown> | null;
  windows: WindowDiagnosticInfo[];
}

export interface WindowDiagnosticInfo {
  id: string;
  bounds: Rect | null;
  visible: boolean | null;
  destroyed: boolean | null;
}

export interface AppDiagnostics {
  startedAt: string;
  packaged: boolean;
  logDir: string;
  lastError: string | null;
}

export interface DiagnosticEvent {
  source: string;
  message: string;
  stack?: string;
  at: string;
}

export function standardizeError(err: unknown, source = "unknown"): DiagnosticEvent {
  const at = new Date().toISOString();
  if (err instanceof Error) {
    return {
      source,
      message: err.message,
      stack: err.stack,
      at,
    };
  }
  return {
    source,
    message: String(err),
    at,
  };
}

export interface FullDiagnostics {
  app: AppDiagnostics;
  backend: BackendDiagnostics | null;
  backendHealth: { ok: boolean; error?: string } | null;
  backendVersion: { version?: string; ok?: boolean; error?: string } | null;
  pets: PetsDiagnostics | null;
  rendererErrors: DiagnosticEvent[];
  state: WorldState;
}

// LLM chat
export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatStreamEvent {
  content?: string;
  error?: string;
  done?: boolean;
}

// Window options
export interface PetWindowOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  preload?: string;
  petData?: PetData;
}

// Store interface
export interface WorldStore {
  getState(): WorldState;
  setState(state: Partial<WorldState>): void;
  setPet(petId: string, pet: PetInstance): void;
  updatePet(petId: string, updates: Partial<PetInstance>): void;
  removePet(petId: string): void;
}

export const initialState: WorldState = {
  pets: {},
  backend: {
    status: 'idle',
    url: null,
    port: null,
    version: null,
    lastError: null,
    pid: null,
    exitCode: null,
    available: false,
    ready: false,
    restartAttempt: 0,
    nextRestartAt: null,
  },
  environment: {
    screen: { x: 0, y: 0, width: 0, height: 0 },
    workArea: { x: 0, y: 0, width: 0, height: 0 },
    desktop: { x: 0, y: 0, width: 0, height: 0 },
    scale: 1.0,
    volume: 0.3,
  },
  ui: {
    isChatOpen: false,
    isControlPanelOpen: false,
    lastError: null,
  },
};
