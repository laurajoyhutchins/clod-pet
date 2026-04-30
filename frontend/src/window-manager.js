const { BrowserWindow } = require("electron");

class WindowManager {
  constructor() {
    this.windows = new Map();
  }

  createPetWindow(petId, opts = {}) {
    const { x = 0, y = 0, width = 100, height = 100 } = opts;

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
        preload: __dirname + "/preload.js",
      },
    });

    win.loadFile("pet.html");
    this.windows.set(petId, { win, opts });

    return win;
  }

  getPetWindow(petId) {
    return this.windows.get(petId)?.win || null;
  }

  removePetWindow(petId) {
    const entry = this.windows.get(petId);
    if (entry) {
      entry.win.destroy();
      this.windows.delete(petId);
    }
  }

  updatePosition(petId, x, y) {
    const entry = this.windows.get(petId);
    if (entry) {
      entry.win.setPosition(Math.round(x), Math.round(y));
    }
  }

  updateSize(petId, width, height) {
    const entry = this.windows.get(petId);
    if (entry) {
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

module.exports = WindowManager;
