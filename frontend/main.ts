import { app, BrowserWindow, ipcMain, screen } from "electron";
import logger = require("./src/logger");
import BackendManager = require("./src/backend-manager");
import PetManager = require("./src/pet-manager");
import TrayManager = require("./src/tray-manager");
import ChatManager = require("./src/chat-manager");
import path = require("path");

const log = logger.createLogger("main");
const diagnostics = {
  startedAt: new Date().toISOString(),
  lastError: null,
  rendererErrors: [],
};

let backendManager: any = null;
let petManager: any = null;
let trayManager: any = null;
let chatManager: ChatManager;
let controlPanelWindow: any = null;
let controlPanelHandlersRegistered = false;

async function createPet(petPath = "../pets/esheep64", opts: { throwOnError?: boolean } = {}) {
  try {
    return await petManager.loadAndCreatePet(petPath);
  } catch (err) {
    diagnostics.lastError = err.message;
    log.error("Failed to add pet:", err);
    if (opts.throwOnError) throw err;
    return null;
  }
}

async function handleAutoScaling() {
  try {
    const settings = await petManager.backendClient.getSettings();
    // Only auto-scale if the scale is exactly 1.0 (default) 
    // and hasn't been manually adjusted or if we want to be proactive.
    // For now, let's only do it if it's 1.0.
    if (settings && settings.Scale === 1.0) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const height = primaryDisplay.bounds.height;
      
      let recommendedScale = 1.0;
      if (height >= 2160) recommendedScale = 2.0;
      else if (height >= 1440) recommendedScale = 1.5;
      
      if (recommendedScale !== 1.0) {
        log.info(`Auto-scaling: screen height ${height}px, setting scale to ${recommendedScale}x`);
        await petManager.backendClient.setScale(recommendedScale);
        petManager.setScale(recommendedScale);
      }
    }
  } catch (err) {
    log.warn("Auto-scaling failed:", err.message);
  }
}

function showControlPanel() {
  if (controlPanelWindow) {
    controlPanelWindow.show();
    return;
  }

  controlPanelWindow = new BrowserWindow({
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
  if (controlPanelHandlersRegistered) return;
  controlPanelHandlersRegistered = true;

  ipcMain.handle("control:get-settings", () => petManager.backendClient.getSettings());
  ipcMain.handle("control:set-settings", (_event, settings) => petManager.backendClient.setSettings(settings));
  ipcMain.handle("control:list-pets", () => petManager.backendClient.listPets());
  ipcMain.handle("control:list-active", () => petManager.backendClient.listActive());
  ipcMain.handle("control:set-volume", (_event, volume) => petManager.backendClient.setVolume(volume));
  ipcMain.handle("control:set-scale", async (_event, scale) => {
    await petManager.backendClient.setScale(scale);
    petManager.setScale(scale);
  });
  ipcMain.handle("control:add-pet", async (_event, petName) => {
    if (!petName || typeof petName !== "string") {
      throw new Error("pet name is required");
    }
    return createPet(`../pets/${petName}`, { throwOnError: true });
  });
  ipcMain.handle("control:remove-pet", (_event, petId) => petManager.removePet(petId));
  ipcMain.handle("control:diagnostics", async () => getDiagnostics());
  ipcMain.handle("control:renderer-error", (_event, err) => {
    const entry = { ...err, at: new Date().toISOString() };
    diagnostics.rendererErrors.unshift(entry);
    diagnostics.rendererErrors = diagnostics.rendererErrors.slice(0, 20);
    diagnostics.lastError = `${entry.source}: ${entry.message}`;
    log.error("renderer error", entry);
    return true;
  });

  ipcMain.on("llm-stream-start", async (event, { messages, channel }) => {
    try {
      await petManager.apiAdapter.streamChat(messages, (streamEvent: any) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(channel, streamEvent);
        }
      });
    } catch (err) {
      if (!event.sender.isDestroyed()) {
        event.sender.send(channel, { error: err.message });
      }
    }
  });
}

app.whenReady().then(async () => {
  backendManager = new BackendManager({ preferSource: !app.isPackaged });
  const backendUrl = await backendManager.start();

  petManager = new PetManager(backendUrl);
  await petManager.init();
  setupControlPanelHandlers();

  await handleAutoScaling();

  const preloadPath = path.join(__dirname, "src", "preload.js");
  chatManager = new ChatManager(preloadPath);

  trayManager = new TrayManager(app, (command) => {
    if (command === "add_pet") createPet();
    else if (command === "options") showControlPanel();
    else if (command === "chat") chatManager.showChat();
    else if (command === "quit") app.quit();
  });
  trayManager.init();

  await createPet();
  showControlPanel();

  app.on("activate", () => createPet());
});

async function getDiagnostics() {
  const backend = backendManager ? backendManager.getDiagnostics() : null;
  const pets = petManager ? petManager.getDiagnostics() : null;
  let backendHealth = null;
  let backendVersion = null;

  if (petManager) {
    try {
      backendHealth = await petManager.backendClient.health();
    } catch (err) {
      backendHealth = { ok: false, error: err.message };
    }
    try {
      backendVersion = await petManager.backendClient.version();
    } catch (err) {
      backendVersion = { ok: false, error: err.message };
    }
  }

  return {
    app: {
      startedAt: diagnostics.startedAt,
      packaged: app.isPackaged,
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendManager) backendManager.stop();
});
