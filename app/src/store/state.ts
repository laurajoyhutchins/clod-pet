export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PetInstance {
  id: string;
  path: string;
  backendPetId: string;
  frameW: number;
  frameH: number;
  currentAnimId: number;
  currentAnimName: string;
  state: {
    frameIndex: number;
    x: number;
    y: number;
    offsetY?: number;
    flipH: boolean;
  };
  loaded: boolean;
  stopped: boolean;
}

export interface BackendStatus {
  status: 'idle' | 'starting' | 'ready' | 'fatal' | 'disconnected';
  url: string | null;
  version: string | null;
  lastError: string | null;
}

export interface Environment {
  displayBounds: Rect;
  workArea: Rect;
  desktopBounds: Rect;
  scale: number;
  volume: number;
}

export interface UIState {
  isChatOpen: boolean;
  isControlPanelOpen: boolean;
  lastError: string | null;
}

export interface WorldState {
  pets: Record<string, PetInstance>;
  backend: BackendStatus;
  environment: Environment;
  ui: UIState;
}

export const initialState: WorldState = {
  pets: {},
  backend: {
    status: 'idle',
    url: null,
    version: null,
    lastError: null,
  },
  environment: {
    displayBounds: { x: 0, y: 0, w: 0, h: 0 },
    workArea: { x: 0, y: 0, w: 0, h: 0 },
    desktopBounds: { x: 0, y: 0, w: 0, h: 0 },
    scale: 1.0,
    volume: 0.3,
  },
  ui: {
    isChatOpen: false,
    isControlPanelOpen: false,
    lastError: null,
  },
};
