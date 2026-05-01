import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clodPet", {
  send: (channel: string, data?: unknown) => ipcRenderer.send(channel, data),
  on: (channel: string, callback: (data: any) => void) => {
    const listener = (_event: unknown, data: any) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  off: (channel: string, callback: (...args: any[]) => void) => ipcRenderer.removeListener(channel, callback),
  once: (channel: string, callback: (data: any) => void) => ipcRenderer.once(channel, (_event, data) => callback(data)),
  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),
  control: {
    getSettings: () => ipcRenderer.invoke("control:get-settings"),
    setSettings: (settings: unknown) => ipcRenderer.invoke("control:set-settings", settings),
    listPets: () => ipcRenderer.invoke("control:list-pets"),
    listActive: () => ipcRenderer.invoke("control:list-active"),
    addPet: (petName: string) => ipcRenderer.invoke("control:add-pet", petName),
    removePet: (petId: string) => ipcRenderer.invoke("control:remove-pet", petId),
    setVolume: (volume: number) => ipcRenderer.invoke("control:set-volume", volume),
    setScale: (scale: number) => ipcRenderer.invoke("control:set-scale", scale),
    diagnostics: () => ipcRenderer.invoke("control:diagnostics"),
    reportError: (source: string, message: string, stack?: string) => ipcRenderer.invoke("control:renderer-error", { source, message, stack }),
    streamChat: (messages: any[], onEvent: (event: any) => void) => {
      const channel = `llm-stream-${Math.random().toString(36).slice(2)}`;
      ipcRenderer.send("llm-stream-start", { messages, channel });
      const handler = (_event: any, data: any) => {
        onEvent(data);
        if (data.done || data.error) {
          ipcRenderer.removeListener(channel, handler);
        }
      };
      ipcRenderer.on(channel, handler);
    },
  },
});
