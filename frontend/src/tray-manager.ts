import { Tray, Menu, nativeImage } from "electron";
import path = require("path");
import fs = require("fs");

class TrayManager {
  app: any;
  onCommand: (command: string) => void;
  tray: any;

  constructor(app: any, onCommand: (command: string) => void) {
    this.app = app;
    this.onCommand = onCommand;
    this.tray = null;
  }

  init() {
    const iconPath = path.join(__dirname, "..", "assets", "icon.png");
    this.tray = new Tray(fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty());
    this.tray.setToolTip("Clod Pet");
    this.tray.setContextMenu(this._buildMenu());
  }

  _buildMenu() {
    return Menu.buildFromTemplate([
      {
        label: "Add Pet",
        click: () => this.onCommand("add_pet"),
      },
      {
        label: "Options",
        click: () => this.onCommand("options"),
      },
      {
        label: "Chat",
        click: () => this.onCommand("chat"),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => this.onCommand("quit"),
      },
    ]);
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export = TrayManager;
