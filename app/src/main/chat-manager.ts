import { BrowserWindow, ipcMain, type WebContents } from "electron";
import * as path from "path";
import { hardenLocalWindow, localWindowWebPreferences } from "./window-security";

class ChatManager {
  window: BrowserWindow | null = null;
  preloadPath: string;

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;
    this.setupIpc();
  }

  setupIpc(): void {
    ipcMain.on("chat-close", (event) => {
      if (!this.ownsSender(event.sender)) return;
      this.closeChat();
    });
  }

  ownsSender(sender: WebContents) {
    return Boolean(this.window && !this.window.isDestroyed() && sender === this.window.webContents);
  }

  showChat(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return;
    }

    this.window = new BrowserWindow({
      width: 400,
      height: 500,
      title: "Pet Chat",
      webPreferences: localWindowWebPreferences(this.preloadPath),
      show: false,
      backgroundColor: "#1a1a2e",
    });
    hardenLocalWindow(this.window);

    this.window.loadFile(path.join(__dirname, "..", "..", "chat.html"));

    this.window.once("ready-to-show", () => {
      this.window?.show();
    });

    this.window.on("closed", () => {
      this.window = null;
    });
  }

  closeChat(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
  }

  isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible();
  }
}

export = ChatManager;
