const { Tray, Menu } = require("electron");
const path = require("path");

class TrayManager {
  constructor(app, onCommand) {
    this.app = app;
    this.onCommand = onCommand;
    this.tray = null;
  }

  init() {
    this.tray = new Tray(path.join(__dirname, "..", "assets", "icon.png"));
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

module.exports = TrayManager;
