import { BrowserWindow, ipcMain } from "electron";
import * as path from "path";

class ChatManager {
  window: BrowserWindow | null = null;
  preloadPath: string;

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;
    this.setupIpc();
  }

  setupIpc() {
    ipcMain.on("chat-close", () => {
      this.closeChat();
    });
  }

  showChat() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return;
    }

    this.window = new BrowserWindow({
      width: 400,
      height: 500,
      title: "Pet Chat",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: this.preloadPath,
      },
      show: false,
      backgroundColor: "#1a1a2e",
    });

    this.window.loadFile(path.join(__dirname, "../chat.html"));

    this.window.once("ready-to-show", () => {
      this.window?.show();
    });

    this.window.on("closed", () => {
      this.window = null;
    });
  }

  closeChat() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
  }

  isVisible() {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible();
  }
}

export = ChatManager;
