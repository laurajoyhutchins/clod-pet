import { BrowserWindow } from "electron";

class WindowManager {
  windows: Map<string, any>;

  constructor() {
    this.windows = new Map();
  }

  createPetWindow(petId: string, opts: { x?: number; y?: number; width?: number; height?: number; preload?: string } = {}) {
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
