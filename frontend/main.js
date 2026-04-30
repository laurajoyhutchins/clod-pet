"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const logger = require("./src/logger");
const BackendManager = require("./src/backend-manager");
const PetManager = require("./src/pet-manager");
const TrayManager = require("./src/tray-manager");
const ChatManager = require("./src/chat-manager");
const path = require("path");
const log = logger.createLogger("main");
const diagnostics = {
    startedAt: new Date().toISOString(),
    lastError: null,
    rendererErrors: [],
};
let backendManager = null;
let petManager = null;
let trayManager = null;
let chatManager;
let controlPanelWindow = null;
let controlPanelHandlersRegistered = false;
async function createPet(petPath = "../pets/esheep64", opts = {}) {
    try {
        return await petManager.loadAndCreatePet(petPath);
    }
    catch (err) {
        diagnostics.lastError = err.message;
        log.error("Failed to add pet:", err);
        if (opts.throwOnError)
            throw err;
        return null;
    }
}
function showControlPanel() {
    if (controlPanelWindow) {
        controlPanelWindow.show();
        return;
    }
    controlPanelWindow = new electron_1.BrowserWindow({
        width: 360,
        height: 500,
        resizable: false,
        minimizable: false,
        maximizable: false,
        icon: path.join(__dirname, "assets", "icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "src", "preload.js"),
        },
    });
    controlPanelWindow.loadFile(path.join(__dirname, "control-panel.html"));
    controlPanelWindow.on("closed", () => {
        controlPanelWindow = null;
    });
}
function setupControlPanelHandlers() {
    if (controlPanelHandlersRegistered)
        return;
    controlPanelHandlersRegistered = true;
    electron_1.ipcMain.handle("control:get-settings", () => petManager.backendClient.getSettings());
    electron_1.ipcMain.handle("control:set-settings", (_event, settings) => petManager.backendClient.setSettings(settings));
    electron_1.ipcMain.handle("control:list-pets", () => petManager.backendClient.listPets());
    electron_1.ipcMain.handle("control:list-active", () => petManager.backendClient.listActive());
    electron_1.ipcMain.handle("control:set-volume", (_event, volume) => petManager.backendClient.setVolume(volume));
    electron_1.ipcMain.handle("control:set-scale", (_event, scale) => petManager.backendClient.setScale(scale));
    electron_1.ipcMain.handle("control:add-pet", async (_event, petName) => {
        if (!petName || typeof petName !== "string") {
            throw new Error("pet name is required");
        }
        return createPet(`../pets/${petName}`, { throwOnError: true });
    });
    electron_1.ipcMain.handle("control:remove-pet", (_event, petId) => petManager.removePet(petId));
    electron_1.ipcMain.handle("control:diagnostics", async () => getDiagnostics());
    electron_1.ipcMain.handle("control:renderer-error", (_event, err) => {
        const entry = { ...err, at: new Date().toISOString() };
        diagnostics.rendererErrors.unshift(entry);
        diagnostics.rendererErrors = diagnostics.rendererErrors.slice(0, 20);
        diagnostics.lastError = `${entry.source}: ${entry.message}`;
        log.error("renderer error", entry);
        return true;
    });
    electron_1.ipcMain.on("llm-stream-start", async (event, { messages, channel }) => {
        try {
            await petManager.apiAdapter.streamChat(messages, (streamEvent) => {
                if (!event.sender.isDestroyed()) {
                    event.sender.send(channel, streamEvent);
                }
            });
        }
        catch (err) {
            if (!event.sender.isDestroyed()) {
                event.sender.send(channel, { error: err.message });
            }
        }
    });
}
electron_1.app.whenReady().then(async () => {
    backendManager = new BackendManager({ preferSource: !electron_1.app.isPackaged });
    const backendUrl = await backendManager.start();
    petManager = new PetManager(backendUrl);
    await petManager.init();
    setupControlPanelHandlers();
    const preloadPath = path.join(__dirname, "src", "preload.js");
    chatManager = new ChatManager(preloadPath);
    trayManager = new TrayManager(electron_1.app, (command) => {
        if (command === "add_pet")
            createPet();
        else if (command === "options")
            showControlPanel();
        else if (command === "chat")
            chatManager.showChat();
        else if (command === "quit")
            electron_1.app.quit();
    });
    trayManager.init();
    await createPet();
    showControlPanel();
    electron_1.app.on("activate", () => createPet());
});
async function getDiagnostics() {
    const backend = backendManager ? backendManager.getDiagnostics() : null;
    const pets = petManager ? petManager.getDiagnostics() : null;
    let backendHealth = null;
    let backendVersion = null;
    if (petManager) {
        try {
            backendHealth = await petManager.backendClient.health();
        }
        catch (err) {
            backendHealth = { ok: false, error: err.message };
        }
        try {
            backendVersion = await petManager.backendClient.version();
        }
        catch (err) {
            backendVersion = { ok: false, error: err.message };
        }
    }
    return {
        app: {
            startedAt: diagnostics.startedAt,
            packaged: electron_1.app.isPackaged,
            logDir: logger.getLogDir(),
            lastError: diagnostics.lastError,
        },
        backend,
        backendHealth,
        backendVersion,
        pets,
        rendererErrors: diagnostics.rendererErrors,
    };
}
process.on("uncaughtException", (err) => {
    diagnostics.lastError = err.message;
    log.error("uncaught exception", err);
});
process.on("unhandledRejection", (err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    diagnostics.lastError = error.message;
    log.error("unhandled rejection", error);
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
electron_1.app.on("before-quit", () => {
    if (backendManager)
        backendManager.stop();
});
