"use strict";
const electron_1 = require("electron");
const path = require("path");
const fs = require("fs");
class TrayManager {
    constructor(app, onCommand) {
        this.app = app;
        this.onCommand = onCommand;
        this.tray = null;
    }
    init() {
        const iconPath = path.join(__dirname, "..", "assets", "icon.png");
        this.tray = new electron_1.Tray(fs.existsSync(iconPath) ? iconPath : electron_1.nativeImage.createEmpty());
        this.tray.setToolTip("Clod Pet");
        this.tray.setContextMenu(this._buildMenu());
    }
    _buildMenu() {
        return electron_1.Menu.buildFromTemplate([
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
module.exports = TrayManager;
