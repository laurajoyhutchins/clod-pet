export const PET_CHANNELS = Object.freeze({
  getInit: "get-pet-init",
  frame: "pet:frame",
  dragStart: "pet:drag",
  dragMove: "pet:drag:move",
  dragEnd: "pet:drop",
});

type Listener = (event: unknown, data: Record<string, unknown>) => void;

export interface PetIpcRenderer {
  invoke(channel: string, data?: unknown): Promise<unknown>;
  send(channel: string, data?: unknown): void;
  on(channel: string, listener: Listener): void;
  removeListener(channel: string, listener: Listener): void;
}

export function createPetBridge(ipcRenderer: PetIpcRenderer) {
  return Object.freeze({
    getInit: (petId: string | null) => ipcRenderer.invoke(PET_CHANNELS.getInit, petId),
    onFrame: (callback: (data: Record<string, unknown>) => void) => {
      const listener: Listener = (_event, data) => callback(data);
      ipcRenderer.on(PET_CHANNELS.frame, listener);
      return () => ipcRenderer.removeListener(PET_CHANNELS.frame, listener);
    },
    beginDrag: () => ipcRenderer.send(PET_CHANNELS.dragStart),
    moveDrag: (position: { x: number; y: number }) => ipcRenderer.send(PET_CHANNELS.dragMove, position),
    endDrag: () => ipcRenderer.send(PET_CHANNELS.dragEnd),
  });
}
