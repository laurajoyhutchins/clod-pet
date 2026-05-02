import { BrowserWindow } from "electron";
import { WorldStore } from "./store";

class WindowManager {
  windows: Map<string, any>;
  store: WorldStore | null;

  constructor(store?: WorldStore) {
    this.windows = new Map();
    this.store = store || null;
    if (this.store) {
      this.subscribeToStore();
    }
  }

  private subscribeToStore() {
    if (!this.store) return;

    this.store.subscribe((state, prevState) => {
      // Synchronize window existence with state.pets
      const currentIds = Object.keys(state.pets);
      const prevIds = Object.keys(prevState.pets);

      // Removed pets -> Close windows
      for (const id of prevIds) {
        if (!state.pets[id]) {
          this.removePetWindow(id);
        }
      }

      // Synchronize positions
      for (const [id, pet] of Object.entries(state.pets)) {
        const prevPet = prevState.pets[id];
        if (!prevPet || pet.state.x !== prevPet.state.x || pet.state.y !== prevPet.state.y) {
          this.updatePosition(id, pet.state.x, pet.state.y);
        }
      }

      // NOTE: Window creation is still handled by PetManager.loadAndCreatePet 
      // for now, as it involves complex async initialization and query params.
      // In a full redesign, loadAndCreatePet would just update the store, 
      // and this subscriber would handle the creation.
    });
  }

  createPetWindow(petId: string, opts: { x?: number; y?: number; width?: number; height?: number; preload?: string; petData?: any } = {}) {
    const existing = this.windows.get(petId);
    if (existing && !existing.win.isDestroyed()) {
      existing.win.destroy();
    }

    const { x = 0, y = 0, width = 100, height = 100, preload } = opts;

    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      resizable: false,
      transparent: true,
      alwaysOnTop: true,
      show: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload,
      },
    });

    this.windows.set(petId, { win, opts });

    return win;
  }

  getPetWindow(petId: string) {
    return this.windows.get(petId)?.win || null;
  }

  removePetWindow(petId: string) {
    const entry = this.windows.get(petId);
    if (entry) {
      if (!entry.win.isDestroyed()) {
        entry.win.destroy();
      }
      this.windows.delete(petId);
    }
  }

  updatePosition(petId: string, x: number, y: number) {
    const entry = this.windows.get(petId);
    if (entry && !entry.win.isDestroyed()) {
      entry.win.setPosition(Math.round(x), Math.round(y));
    }
  }

  updateSize(petId: string, width: number, height: number) {
    const entry = this.windows.get(petId);
    if (entry && !entry.win.isDestroyed()) {
      entry.win.setSize(width, height);
    }
  }

  getAllWindows() {
    return Array.from(this.windows.entries()).map(([id, { win }]) => ({
      id,
      win,
    }));
  }
}

export = WindowManager;
