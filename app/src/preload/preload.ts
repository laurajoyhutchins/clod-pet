import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { ChatMessage, ChatStreamEvent } from "../shared/store";
import { createPetBridge } from "./ipc-contract";

contextBridge.exposeInMainWorld("clodPet", Object.freeze({
  pet: createPetBridge(ipcRenderer),

  store: Object.freeze({
    getState: () => ipcRenderer.invoke("store:get-state"),
    subscribe: (callback: (state: Record<string, unknown>) => void) => {
      const listener = (_event: IpcRendererEvent, state: Record<string, unknown>) => callback(state);
      ipcRenderer.on("store:updated", listener);
      return () => ipcRenderer.removeListener("store:updated", listener);
    },
  }),

  control: Object.freeze({
    getSettings: () => ipcRenderer.invoke("control:get-settings"),
    setSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke("control:set-settings", settings),
    listPets: () => ipcRenderer.invoke("control:list-pets"),
    listActive: () => ipcRenderer.invoke("control:list-active"),
    addPet: (petName: string) => ipcRenderer.invoke("control:add-pet", petName),
    removePet: (petId: string) => ipcRenderer.invoke("control:remove-pet", petId),
    setVolume: (volume: number) => ipcRenderer.invoke("control:set-volume", volume),
    setScale: (scale: number) => ipcRenderer.invoke("control:set-scale", scale),
    setGravityFactor: (gravity: number) => ipcRenderer.invoke("control:set-gravity-factor", gravity),
    resizeWindow: (width: number, height: number) => ipcRenderer.invoke("control:resize-window", { width, height }),
    diagnostics: () => ipcRenderer.invoke("control:diagnostics"),
    log: (source: string, level: "debug" | "info" | "warn" | "error", ...args: unknown[]) =>
      ipcRenderer.invoke("control:renderer-log", { source, level, args }),
    reportError: (source: string, message: string, stack?: string) =>
      ipcRenderer.invoke("control:renderer-error", { source, message, stack }),

    streamChat: (messages: ChatMessage[], onEvent: (event: ChatStreamEvent) => void) => {
      const channel = `llm-stream-${crypto.randomUUID()}`;
      const handler = (_event: IpcRendererEvent, data: ChatStreamEvent) => {
        onEvent(data);
        if (data.done || data.error) {
          ipcRenderer.removeListener(channel, handler);
        }
      };
      ipcRenderer.on(channel, handler);
      ipcRenderer.send("llm-stream-start", { messages, channel });
    },

    closeWindow: () => ipcRenderer.invoke("control:close-window"),
    minimizeWindow: () => ipcRenderer.invoke("control:minimize-window"),
    zoomWindow: () => ipcRenderer.invoke("control:zoom-window"),
  }),

  editor: Object.freeze({
    show: (initialPath?: string) => ipcRenderer.invoke("editor:show", initialPath),
    openPetDirectory: () => ipcRenderer.invoke("editor:open-pet-directory"),
    openAnimationFile: () => ipcRenderer.invoke("editor:open-animation-file"),
    readDocument: (input: { path: string }) => ipcRenderer.invoke("editor:read-document", input),
    refreshDocumentPreviews: (input: { documentPath: string; document: Record<string, unknown> }) =>
      ipcRenderer.invoke("editor:refresh-document-previews", input),
    saveDocument: (input: Record<string, unknown>) => ipcRenderer.invoke("editor:save-document", input),
    saveDocumentAs: (input: Record<string, unknown>) => ipcRenderer.invoke("editor:save-document-as", input),
    showItemInFolder: (targetPath: string) => ipcRenderer.invoke("editor:show-item-in-folder", targetPath),
    getRecentDocuments: () => ipcRenderer.invoke("editor:get-recent-documents"),
    getBootstrapPath: () => ipcRenderer.invoke("editor:get-bootstrap-path"),
    closeWindow: () => ipcRenderer.invoke("editor:close-window"),
    minimizeWindow: () => ipcRenderer.invoke("editor:minimize-window"),
    zoomWindow: () => ipcRenderer.invoke("editor:zoom-window"),
  }),
}));
