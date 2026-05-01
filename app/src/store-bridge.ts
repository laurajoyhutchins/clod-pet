import { BrowserWindow, ipcMain } from "electron";
import { WorldStore } from "./store";
import { WorldState } from "./store/state";

/**
 * StoreBridge synchronizes the main process WorldStore with all renderer processes.
 */
export class StoreBridge {
  private store: WorldStore;

  constructor(store: WorldStore) {
    this.store = store;
  }

  init() {
    // 1. Listen for store changes and broadcast to all windows
    this.store.subscribe((state, prevState) => {
      this.broadcastUpdate(state, prevState);
    });

    // 2. Allow windows to request the current state on mount
    ipcMain.handle("store:get-state", () => {
      return this.store.getState();
    });

    // 3. Optional: Forward renderer actions to the main store
    // For now, we keep existing control handlers, but in the future 
    // we could have a generic "store:dispatch" handler.
  }

  private broadcastUpdate(state: WorldState, _prevState: WorldState) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        // We send the full state for now for simplicity.
        // Optimization: In Phase 4, we can implement diffing/patching.
        win.webContents.send("store:updated", state);
      }
    }
  }
}
