import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { ChatMessage, ChatStreamEvent } from "./types";

contextBridge.exposeInMainWorld("clodPet", {
  send: (channel: string, data?: unknown) => ipcRenderer.send(channel, data),

  on: (channel: string, callback: (data: Record<string, unknown>) => void) => {
    const listener = (_event: IpcRendererEvent, data: Record<string, unknown>) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  off: (channel: string, callback: (data: Record<string, unknown>) => void) => {
    ipcRenderer.removeListener(channel, (_, data) => callback(data as Record<string, unknown>));
  },

  once: (channel: string, callback: (data: Record<string, unknown>) => void) => {
    ipcRenderer.once(channel, (_event: IpcRendererEvent, data: Record<string, unknown>) => callback(data));
  },

  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),

  store: {
    getState: () => ipcRenderer.invoke("store:get-state"),
    subscribe: (callback: (state: Record<string, unknown>) => void) => {
      const listener = (_event: IpcRendererEvent, state: Record<string, unknown>) => callback(state);
      ipcRenderer.on("store:updated", listener);
      return () => ipcRenderer.removeListener("store:updated", listener);
    },
  },

  control: {
    getSettings: () => ipcRenderer.invoke("control:get-settings"),
    setSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke("control:set-settings", settings),
    listPets: () => ipcRenderer.invoke("control:list-pets"),
    listActive: () => ipcRenderer.invoke("control:list-active"),
    addPet: (petName: string) => ipcRenderer.invoke("control:add-pet", petName),
    removePet: (petId: string) => ipcRenderer.invoke("control:remove-pet", petId),
    setVolume: (volume: number) => ipcRenderer.invoke("control:set-volume", volume),
    setScale: (scale: number) => ipcRenderer.invoke("control:set-scale", scale),
    setGravityFactor: (gravity: number) => ipcRenderer.invoke("control:set-gravity-factor", gravity),
    diagnostics: () => ipcRenderer.invoke("control:diagnostics"),
    reportError: (source: string, message: string, stack?: string) =>
      ipcRenderer.invoke("control:renderer-error", { source, message, stack }),

    streamChat: (messages: ChatMessage[], onEvent: (event: ChatStreamEvent) => void) => {
      const channel = `llm-stream-${Math.random().toString(36).slice(2)}`;
      ipcRenderer.send("llm-stream-start", { messages, channel });
      const handler = (_event: IpcRendererEvent, data: ChatStreamEvent) => {
        onEvent(data);
        if (data.done || data.error) {
          ipcRenderer.removeListener(channel, handler);
        }
      };
      ipcRenderer.on(channel, handler);
    },

    closeWindow: () => ipcRenderer.invoke("control:close-window"),
  },
});
