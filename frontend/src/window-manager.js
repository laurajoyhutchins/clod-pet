"use strict";
const electron_1 = require("electron");
class WindowManager {
    constructor() {
        this.windows = new Map();
    }
    createPetWindow(petId, opts = {}) {
        const existing = this.windows.get(petId);
        if (existing && !existing.win.isDestroyed()) {
            existing.win.destroy();
        }
        const { x = 0, y = 0, width = 100, height = 100, preload } = opts;
        const win = new electron_1.BrowserWindow({
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
    getPetWindow(petId) {
        return this.windows.get(petId)?.win || null;
    }
    removePetWindow(petId) {
        const entry = this.windows.get(petId);
        if (entry) {
            if (!entry.win.isDestroyed()) {
                entry.win.destroy();
            }
            this.windows.delete(petId);
        }
    }
    updatePosition(petId, x, y) {
        const entry = this.windows.get(petId);
        if (entry && !entry.win.isDestroyed()) {
            entry.win.setPosition(Math.round(x), Math.round(y));
        }
    }
    updateSize(petId, width, height) {
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
module.exports = WindowManager;
