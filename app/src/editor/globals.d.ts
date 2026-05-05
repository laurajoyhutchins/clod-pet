import type { PanelStyle, EditorRecentDocument, EditorReadResult, EditorSaveResult, EditorLayoutState, ModernPetDocument } from "./types";

declare global {
  interface SharedThemes {
    panelStyles: readonly PanelStyle[];
    windowsPanelStyles: readonly PanelStyle[];
    macPanelStyles: readonly PanelStyle[];
    roundedPanelStyles: readonly PanelStyle[];
  }

  interface EditorControlApi {
    getSettings(): Promise<Record<string, unknown>>;
    setSettings(settings: Partial<Record<string, unknown>>): Promise<unknown>;
    minimizeWindow(): Promise<boolean>;
    zoomWindow(): Promise<boolean>;
    closeWindow(): Promise<boolean>;
  }

  interface EditorFileApi {
    show(initialPath?: string): Promise<boolean>;
    openPetDirectory(): Promise<string | null>;
    openAnimationFile(): Promise<string | null>;
    readDocument(input: { path: string }): Promise<EditorReadResult>;
    saveDocument(input: {
      documentPath: string;
      document: ModernPetDocument;
      layout?: EditorLayoutState;
      previews?: EditorReadResult["previews"];
    }): Promise<EditorSaveResult>;
    saveDocumentAs(input: {
      documentPath: string;
      document: ModernPetDocument;
      layout?: EditorLayoutState;
      previews?: EditorReadResult["previews"];
    }): Promise<EditorSaveResult>;
    showItemInFolder(path: string): Promise<boolean>;
    getRecentDocuments(): Promise<EditorRecentDocument[]>;
    closeWindow(): Promise<boolean>;
    minimizeWindow(): Promise<boolean>;
    zoomWindow(): Promise<boolean>;
  }

  interface Window {
    clodPetSharedThemes: SharedThemes;
    clodPet: {
      control: EditorControlApi;
      editor: EditorFileApi;
      on(channel: string, callback: (data: Record<string, unknown>) => void): () => void;
    };
  }
}

export {};
