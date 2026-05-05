import { app, BrowserWindow, ipcMain, screen } from "electron";
import logger = require("./src/logger");
import BackendManager = require("./src/backend-manager");
import PetManager = require("./src/pet-manager");
import TrayManager = require("./src/tray-manager");
import ChatManager = require("./src/chat-manager");
import globalStore, { standardizeError } from "./src/store";
import { StoreBridge } from "./src/store-bridge";
import path = require("path");
import type { BackendResponse, FullDiagnostics, DiagnosticEvent } from "./src/store";

const log = logger.createLogger("main");
const diagnostics: {
  startedAt: string;
  lastError: string | null;
  rendererErrors: DiagnosticEvent[];
} = {
  startedAt: new Date().toISOString(),
  lastError: null,
  rendererErrors: [],
};

let backendManager: InstanceType<typeof BackendManager> | null = null;
let petManager: InstanceType<typeof PetManager> | null = null;
let trayManager: InstanceType<typeof TrayManager> | null = null;
let chatManager: InstanceType<typeof ChatManager> | null = null;
let controlPanelWindow: BrowserWindow | null = null;
let controlPanelHandlersRegistered = false;
let shutdownStarted = false;

async function createPet(petPath?: string, opts: { throwOnError?: boolean } = {}): Promise<string | null> {
  if (!petManager) return null;
  if (!petPath) {
    const settingsResp = await petManager.backendClient.getSettings().catch(() => ({}) as BackendResponse);
    const settings = settingsResp?.payload || {};
    const defaultPet = (settings as Record<string, unknown>)?.CurrentPet as string || "eSheep-modern";
    petPath = `../pets/${defaultPet}`;
  }
  try {
    return await petManager.loadAndCreatePet(petPath);
  } catch (err) {
    const diag = standardizeError(err, "main:createPet");
    diagnostics.lastError = diag.message;
    log.error("Failed to add pet:", err);
    if (opts.throwOnError) throw err;
    return null;
  }
}

async function handleAutoScaling(): Promise<void> {
  if (!petManager) return;
  try {
    const settingsResp = await petManager.backendClient.getSettings();
    const settings = settingsResp?.payload || {};
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
    log.warn("Auto-scaling failed:", err instanceof Error ? err.message : String(err));
  }
}

function showControlPanel(): void {
  if (controlPanelWindow) {
    controlPanelWindow.show();
    return;
  }

  controlPanelWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 350,
    minHeight: 400,
    resizable: true,
    minimizable: false,
    maximizable: false,
    frame: false,
    roundedCorners: false,
    hasShadow: false,
    backgroundColor: "#008080",
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

function shutdown(): void {
  if (shutdownStarted) return;
  shutdownStarted = true;

  if (petManager) {
    petManager.shutdown();
  }

  if (controlPanelWindow && !controlPanelWindow.isDestroyed()) {
    controlPanelWindow.close();
  }

  if (chatManager) {
    chatManager.closeChat();
  }

  if (trayManager) {
    trayManager.destroy();
  }

  if (backendManager) {
    backendManager.stopWithReason("app quitting");
  }
}

function setupControlPanelHandlers(): void {
  if (controlPanelHandlersRegistered) return;
  controlPanelHandlersRegistered = true;

  ipcMain.handle("control:get-settings", async () => {
    const resp = await petManager?.backendClient.getSettings();
    return resp?.payload || {};
  });
  ipcMain.handle("control:set-settings", (_event, settings) => petManager?.backendClient.setSettings(settings));
  ipcMain.handle("control:list-pets", async () => {
    const resp = await petManager?.backendClient.listPets();
    return resp?.payload || [];
  });
  ipcMain.handle("control:list-active", async () => {
    const resp = await petManager?.backendClient.listActive();
    return resp?.payload || [];
  });
  ipcMain.handle("control:set-volume", async (_event, volume) => {
    const result = await petManager?.backendClient.setVolume(volume);
    petManager?.setVolume(volume);
    return result;
  });
  ipcMain.handle("control:set-scale", async (_event, scale) => {
    await petManager?.backendClient.setScale(scale);
    petManager?.setScale(scale);
  });
  ipcMain.handle("control:set-gravity-factor", async (_event, gravity) => {
    await petManager?.backendClient.setGravityFactor(gravity);
  });
  ipcMain.handle("control:resize-window", (_event, size: { width: number; height: number }) => {
    if (!controlPanelWindow || controlPanelWindow.isDestroyed()) {
      return false;
    }

    const width = Math.max(350, Math.ceil(size?.width || 0));
    const height = Math.max(400, Math.ceil(size?.height || 0));
    controlPanelWindow.setContentSize(width, height);
    return true;
  });
  ipcMain.handle("control:add-pet", async (_event, petName) => {
    if (!petName || typeof petName !== "string") {
      throw new Error("pet name is required");
    }
    return createPet(`../pets/${petName}`, { throwOnError: true });
  });
  ipcMain.handle("control:remove-pet", (_event, petId) => petManager?.removePet(petId));
  ipcMain.handle("control:diagnostics", async () => getDiagnostics());
  ipcMain.handle("control:renderer-error", (_event, err) => {
    const entry: DiagnosticEvent = {
      source: err.source || "renderer",
      message: err.message || "unknown error",
      stack: err.stack,
      at: new Date().toISOString()
    };
    diagnostics.rendererErrors.unshift(entry);
    diagnostics.rendererErrors = diagnostics.rendererErrors.slice(0, 20);
    diagnostics.lastError = `${entry.source}: ${entry.message}`;
    log.error("renderer error", entry);
    return true;
  });

  ipcMain.handle("control:close-window", () => {
    app.quit();
    return true;
  });

  ipcMain.on("llm-stream-start", async (event, { messages, channel }) => {
    try {
      await petManager?.backendClient.streamChat(messages, (streamEvent: any) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(channel, streamEvent);
        }
      });
    } catch (err) {
      if (!event.sender.isDestroyed()) {
        event.sender.send(channel, { error: err instanceof Error ? err.message : String(err) });
      }
    }
  });
}

app.whenReady().then(async () => {
  const bridge = new StoreBridge(globalStore);
  bridge.init();

  backendManager = new BackendManager({ preferSource: !app.isPackaged, store: globalStore });
  const backendUrl = await backendManager.start();

  petManager = new PetManager(backendUrl, globalStore);
  await petManager.init();
  setupControlPanelHandlers();

  await handleAutoScaling();

  const preloadPath = path.join(__dirname, "src", "preload.js");
  chatManager = new ChatManager(preloadPath);

  trayManager = new TrayManager(app, (command) => {
    if (command === "add_pet") createPet();
    else if (command === "options") showControlPanel();
    else if (command === "chat") chatManager?.showChat();
    else if (command === "quit") app.quit();
  });
  trayManager.init();

  await createPet();
  showControlPanel();

  app.on("activate", () => createPet());
});

async function getDiagnostics(): Promise<FullDiagnostics> {
  const state = globalStore.getState();
  const backend = backendManager ? backendManager.getDiagnostics() : null;
  const pets = petManager ? petManager.getDiagnostics() : null;
  let backendHealth: { ok: boolean; error?: string } | null = null;
  let backendVersion: { version?: string; ok?: boolean; error?: string } | null = null;

  if (petManager) {
    try {
      const health = await petManager.backendClient.health() as any;
      backendHealth = { ok: !!health?.ok, error: health?.error };
    } catch (err) {
      backendHealth = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    try {
      const versionResp = await petManager.backendClient.version() as any;
      backendVersion = { version: versionResp?.version, ok: !!versionResp?.ok, error: versionResp?.error };
      if (backendVersion && backendVersion.version) {
        globalStore.setState({
          backend: {
            ...state.backend,
            version: backendVersion.version
          }
        });
      }
    } catch (err) {
      backendVersion = { ok: false, error: err instanceof Error ? err.message : String(err) };
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
    state,
  };
}

process.on("uncaughtException", (err: Error) => {
  diagnostics.lastError = err.message;
  log.error("uncaught exception", err);
});

process.on("unhandledRejection", (err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  diagnostics.lastError = error.message;
  log.error("unhandled rejection", error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  shutdown();
});
