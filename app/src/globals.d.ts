import type {
  AppSettings,
  PetInfo,
  PetData,
  WorldContext,
  BackendResponse,
  FullDiagnostics,
  ChatMessage,
  ChatStreamEvent,
} from "./types";

declare global {
  interface Window {
    clodPet: {
      send(channel: string, data?: unknown): void;
      on(channel: string, callback: (data: Record<string, unknown>) => void): () => void;
      off(channel: string, callback: (data: Record<string, unknown>) => void): void;
      once(channel: string, callback: (data: Record<string, unknown>) => void): void;
      invoke(channel: string, data?: unknown): Promise<unknown>;
      store: {
        getState(): Promise<Record<string, unknown>>;
        subscribe(callback: (state: Record<string, unknown>, prevState?: Record<string, unknown>) => void): () => void;
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
        diagnostics(): Promise<FullDiagnostics>;
        reportError(source: string, message: string, stack?: string): Promise<void>;
        streamChat(messages: ChatMessage[], onEvent: (event: ChatStreamEvent) => void): void;
        closeWindow(): Promise<void>;
      };
    };
  }
}

export {};
