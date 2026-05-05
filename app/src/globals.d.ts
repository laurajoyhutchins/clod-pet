import type {
  AppSettings as _AppSettings,
  PetInfo as _PetInfo,
  PetData as _PetData,
  WorldContext as _WorldContext,
  BackendResponse as _BackendResponse,
  FullDiagnostics as _FullDiagnostics,
  WindowDiagnosticInfo as _WindowDiagnosticInfo,
  ChatMessage as _ChatMessage,
  ChatStreamEvent as _ChatStreamEvent,
  WorldState as _WorldState,
} from "./store";

declare global {
  type AppSettings = _AppSettings;
  type PetInfo = _PetInfo;
  type PetData = _PetData;
  type WorldContext = _WorldContext;
  type BackendResponse = _BackendResponse;
  type FullDiagnostics = _FullDiagnostics;
  type WindowDiagnosticInfo = _WindowDiagnosticInfo;
  type ChatMessage = _ChatMessage;
  type ChatStreamEvent = _ChatStreamEvent;
  type WorldState = _WorldState;

  interface Window {
    clodPet: {
      send(channel: string, data?: unknown): void;
      on(channel: string, callback: (data: Record<string, unknown>) => void): () => void;
      off(channel: string, callback: (data: Record<string, unknown>) => void): void;
      once(channel: string, callback: (data: Record<string, unknown>) => void): void;
      invoke(channel: string, data?: unknown): Promise<unknown>;
      store: {
        getState(): Promise<WorldState>;
        subscribe(callback: (state: WorldState, prevState?: WorldState) => void): () => void;
      };
      control: {
        getSettings(): Promise<AppSettings>;
        setSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
        listPets(): Promise<string[]>;
        listActive(): Promise<PetInfo[]>;
        addPet(petName: string): Promise<BackendResponse>;
        removePet(petId: string): Promise<boolean>;
        setVolume(volume: number): Promise<AppSettings>;
        setScale(scale: number): Promise<AppSettings>;
        setGravityFactor(gravity: number): Promise<void>;
        resizeWindow(width: number, height: number): Promise<boolean>;
        diagnostics(): Promise<FullDiagnostics>;
        reportError(source: string, message: string, stack?: string): Promise<void>;
        streamChat(messages: ChatMessage[], onEvent: (event: ChatStreamEvent) => void): void;
        closeWindow(): Promise<void>;
        minimizeWindow(): Promise<void>;
      };
    };
  }
}

export {};
