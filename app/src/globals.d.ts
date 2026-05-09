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
} from "./shared/store";

declare global {
  type PanelStyle =
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

  interface ControlPanelThemes {
    panelStyles: readonly PanelStyle[];
    windowsPanelStyles: readonly PanelStyle[];
    macPanelStyles: readonly PanelStyle[];
    roundedPanelStyles: readonly PanelStyle[];
  }

  interface SharedThemes {
    panelStyles: readonly PanelStyle[];
    windowsPanelStyles: readonly PanelStyle[];
    macPanelStyles: readonly PanelStyle[];
    roundedPanelStyles: readonly PanelStyle[];
  }

  interface EditorRecentDocument {
    path: string;
    title: string;
    petName: string;
    openedAt: string;
  }

  interface EditorLayoutNode {
    x: number;
    y: number;
  }

  interface EditorLayoutState {
    nodes: Record<string, EditorLayoutNode>;
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
  }

  interface EditorPreviewState {
    spritesheetDataUrl: string | null;
    iconDataUrl: string | null;
    spritesheetError: string | null;
    iconError: string | null;
  }

  interface EditorReadResult {
    documentPath: string;
    petDir: string;
    document: Record<string, unknown>;
    layout: EditorLayoutState;
    previews: EditorPreviewState;
    recentDocuments: EditorRecentDocument[];
  }

  interface EditorSaveResult {
    documentPath: string;
    petDir: string;
    recentDocuments: EditorRecentDocument[];
  }

  interface EditorApi {
    show(initialPath?: string): Promise<boolean>;
    openPetDirectory(): Promise<string | null>;
    openAnimationFile(): Promise<string | null>;
    readDocument(input: { path: string }): Promise<EditorReadResult>;
    refreshDocumentPreviews(input: {
      documentPath: string;
      document: Record<string, unknown>;
    }): Promise<EditorPreviewState>;
    saveDocument(input: {
      documentPath: string;
      document: Record<string, unknown>;
      layout?: EditorLayoutState;
    }): Promise<EditorSaveResult>;
    saveDocumentAs(input: {
      documentPath: string;
      document: Record<string, unknown>;
      layout?: EditorLayoutState;
    }): Promise<EditorSaveResult>;
    showItemInFolder(path: string): Promise<boolean>;
    getRecentDocuments(): Promise<EditorRecentDocument[]>;
    getBootstrapPath(): Promise<string>;
    closeWindow(): Promise<boolean>;
    minimizeWindow(): Promise<boolean>;
    zoomWindow(): Promise<boolean>;
  }

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
        zoomWindow(): Promise<boolean>;
      };
      editor: EditorApi;
    };
    clodPetSharedThemes: SharedThemes;
    clodPetControlPanelThemes: ControlPanelThemes;
  }
}

export {};
