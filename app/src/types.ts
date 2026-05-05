// Core type definitions for clod-pet

// IPC message types
export interface IpcCallbackData {
  [key: string]: unknown;
}

// Settings
export interface AppSettings {
  Scale?: number;
  Volume?: number;
  ShowAdvancedSettings?: boolean;
  ShowDiagnostics?: boolean;
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

// World context for physics
export interface WorldContext {
  screen: { x: number; y: number; w: number; h: number };
  work_area: { x: number; y: number; w: number; h: number };
  desktop: { x: number; y: number; w: number; h: number };
}

// Backend response
export interface BackendResponse {
  ok: boolean;
  payload?: unknown;
  error?: string;
  [key: string]: unknown;
}

// Pet state in store
export interface PetState {
  id: string;
  path: string;
  backendPetId: string;
  frameW: number;
  frameH: number;
  currentAnimId: number;
  currentAnimName: string;
  stepFailures: number;
  lastStepError: string | null;
  dragOffsetX: number;
  dragOffsetY: number;
  state: {
    frameIndex: number;
    x: number;
    y: number;
    flipH: boolean;
    borderCtx: number;
    offsetY?: number;
  };
  loaded: boolean;
  stopped: boolean;
}

// Store state
export interface EnvironmentState {
  DisplayBounds: { x: number; y: number; w: number; h: number };
  WorkArea: { x: number; y: number; w: number; h: number };
  Desktop: { x: number; y: number; w: number; h: number };
  scale: number;
  volume: number;
}

export interface BackendStoreState {
  status: string;
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

export interface WorldStoreState {
  environment: EnvironmentState;
  backend: BackendStoreState;
  pets: Record<string, PetState>;
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
  bounds: { x: number; y: number; width: number; height: number } | null;
  visible: boolean | null;
  destroyed: boolean | null;
}

export interface AppDiagnostics {
  startedAt: string;
  packaged: boolean;
  logDir: string;
  lastError: string | null;
}

export interface FullDiagnostics {
  app: AppDiagnostics;
  backend: BackendDiagnostics | null;
  backendHealth: { ok: boolean; error?: string } | null;
  backendVersion: { version?: string; ok?: boolean; error?: string } | null;
  pets: PetsDiagnostics | null;
  rendererErrors: Array<{ source: string; message: string; stack?: string; at: string }>;
  state: WorldStoreState;
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
  getState(): WorldStoreState;
  setState(state: Partial<WorldStoreState>): void;
  setPet(petId: string, pet: PetState): void;
  updatePet(petId: string, updates: Partial<PetState>): void;
  removePet(petId: string): void;
}
