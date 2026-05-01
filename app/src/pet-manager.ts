import { BrowserWindow, ipcMain, screen } from "electron";
import path = require("path");
import ApiAdapter = require("./api-adapter");
import WindowManager = require("./window-manager");
import BorderDetector = require("./border-detector");
import logger = require("./logger");

const log = logger.createLogger("pet-manager");

class PetManager {
  backendClient: any;
  windowManager: any;
  borderDetector: any;
  pets: Map<string, any>;
  windowToPetId: WeakMap<any, string>;
  ipcHandlersRegistered: boolean;
  appIsQuitting: boolean;
  lastError: string | null;
  lastPetLoad: any;
  scale: number;
  volume: number;

  constructor(backendUrl: string) {
    this.backendClient = new ApiAdapter(backendUrl);
    this.windowManager = new WindowManager();
    this.borderDetector = new BorderDetector();
    this.pets = new Map();
    this.windowToPetId = new WeakMap();
    this.ipcHandlersRegistered = false;
    this.appIsQuitting = false;
    this.lastError = null;
    this.lastPetLoad = null;
    this.scale = 1.0;
    this.volume = 0.3;
  }

  async init() {
    await this.borderDetector.init();
    this._setupIpcHandlers();

    try {
      const settings = await this.backendClient.getSettings();
      if (settings && settings.Scale) {
        this.scale = settings.Scale;
      }
      if (settings && typeof settings.Volume === "number") {
        this.volume = settings.Volume;
      }
    } catch (err) {
      log.warn("Failed to load initial scale:", err.message);
    }

    ipcMain.handle("get-pet-init", (_event, petId) => {
      const targetEntry = this.pets.get(String(petId));
      if (!targetEntry) return null;
      return {
        petId: targetEntry.backendPetId,
        pngBase64: `data:image/png;base64,${targetEntry.petData.png_base64}`,
        tilesX: targetEntry.petData.tiles_x,
        tilesY: targetEntry.petData.tiles_y,
        scale: this.scale,
        volume: this.volume,
      };
    });
  }

  async setScale(scale: number) {
    this.scale = scale;
    log.info("Setting scale to:", scale);
    for (const entry of this.pets.values()) {
      if (!entry.win.isDestroyed()) {
        const width = Math.round(entry.frameW * scale);
        const height = Math.round(entry.frameH * scale);
        entry.win.setSize(width, height);
        entry.win.webContents.send("pet:scale", scale);
      }
    }
  }

  setVolume(volume: number) {
    this.volume = volume;
    log.info("Setting volume to:", volume);
    for (const entry of this.pets.values()) {
      if (!entry.win.isDestroyed()) {
        entry.win.webContents.send("pet:volume", volume);
      }
    }
  }

  async loadAndCreatePet(petPath: string, spawnId = 1) {
    log.info("Loading pet:", petPath);
    this.lastPetLoad = { petPath, startedAt: new Date().toISOString() };
    const petData = await this.backendClient.loadPet(petPath);
    log.info("Pet data loaded:", petData ? "success" : "failed");

    if (!petData || !petData.png_base64 || !petData.tiles_x || !petData.tiles_y) {
      this.lastError = `invalid pet sprite data for ${petPath}`;
      throw new Error(`invalid pet sprite data for ${petPath}`);
    }

    const world = this._buildWorldContext();
    const addResult = await this.backendClient.addPet(petPath, spawnId, world);
    const backendPetId = addResult && addResult.pet_id;
    if (!backendPetId) {
      this.lastError = "backend did not return a pet id";
      throw new Error("backend did not return a pet id");
    }

    this.lastPetLoad = {
      ...this.lastPetLoad,
      backendPetId,
      tilesX: petData.tiles_x,
      tilesY: petData.tiles_y,
      completedAt: new Date().toISOString(),
    };

    const workArea = screen.getPrimaryDisplay().workArea;
    const x = typeof addResult.x === "number" ? addResult.x : workArea.x + Math.floor(Math.random() * workArea.width);
    const y = typeof addResult.y === "number" ? addResult.y : workArea.y + Math.floor(Math.random() * workArea.height * 0.8);

    const frameW = petData.frame_w || 64;
    const frameH = petData.frame_h || 64;
    const width = Math.round(frameW * this.scale);
    const height = Math.round(frameH * this.scale);

    const win = this.windowManager.createPetWindow(backendPetId, {
      x, y,
      width, height,
      preload: path.join(__dirname, "preload.js"),
    });

    log.info("Window created, loading pet.html...");

    const petEntry = {
      win,
      petData,
      petPath,
      backendPetId,
      frameW,
      frameH,
      state: { frameIndex: 0, x, y, flipH: !!addResult.flip_h },
      interval: null,
      stepFailures: 0,
      stopped: false,
      loaded: false,
    };

    this.pets.set(petEntry.backendPetId, petEntry);
    this.windowToPetId.set(win, petEntry.backendPetId);

    const petId = petEntry.backendPetId;
    const loadPromise = win.loadFile(path.join(__dirname, "..", "pet.html"), { query: { petId } });

    let shown = false;
    const showPetWindow = () => {
      if (shown || win.isDestroyed()) return;
      shown = true;
      log.debug("Window ready to show", win.getBounds());
      win.showInactive();
    };

    win.once("ready-to-show", showPetWindow);

    win.webContents.on("did-finish-load", () => {
      log.info("pet.html loaded successfully");
      petEntry.loaded = true;
      this._startPetLoop(petEntry.backendPetId);
      setTimeout(showPetWindow, 50);
    });

    win.webContents.on("crashed", () => {
      log.error("Pet window crashed");
    });

    win.on("closed", () => {
      petEntry.stopped = true;
      if (petEntry.interval) clearTimeout(petEntry.interval);
      if (!this.appIsQuitting && this.pets.has(petEntry.backendPetId)) {
        this.backendClient.removePet(petEntry.backendPetId);
      }
      this.pets.delete(petEntry.backendPetId);
    });

    await loadPromise;
    return petEntry.backendPetId;
  }

  _buildWorldContext() {
    const display = screen.getPrimaryDisplay();
    return {
      screen: {
        x: display.bounds.x,
        y: display.bounds.y,
        w: display.bounds.width,
        h: display.bounds.height,
      },
      work_area: {
        x: display.workArea.x,
        y: display.workArea.y,
        w: display.workArea.width,
        h: display.workArea.height,
      },
      taskbar: {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      },
    };
  }

  async removePet(petId: string) {
    const entry = this.pets.get(petId);
    if (!entry) {
      return this.backendClient.removePet(petId);
    }

    entry.stopped = true;
    if (entry.interval) clearTimeout(entry.interval);
    await this.backendClient.removePet(petId);
    this.pets.delete(petId);
    this.windowManager.removePetWindow(petId);
    return true;
  }

  shutdown() {
    this.appIsQuitting = true;

    for (const entry of this.pets.values()) {
      entry.stopped = true;
      if (entry.interval) {
        clearTimeout(entry.interval);
        entry.interval = null;
      }
    }

    for (const petId of Array.from(this.pets.keys())) {
      this.windowManager.removePetWindow(petId);
    }

    this.pets.clear();
  }

  _startPetLoop(petId: string) {
    const entry = this.pets.get(petId);
    if (!entry || entry.interval) return;

    const schedule = (delay: number) => {
      const petEntry = this.pets.get(petId);
      if (!petEntry || petEntry.stopped || petEntry.win.isDestroyed()) return;
      if (petEntry.interval) clearTimeout(petEntry.interval);
      petEntry.interval = setTimeout(loop, delay);
    };

    const loop = async () => {
      const petEntry = this.pets.get(petId);
      if (!petEntry || petEntry.stopped || !petEntry.loaded || petEntry.win.isDestroyed()) return;

      petEntry.interval = null;

      try {
        const [winX, winY] = petEntry.win.getPosition();
        const [winW, winH] = petEntry.win.getSize();

        const world = this.borderDetector.getRawWorldContext(winX, winY, winW, winH);
        if (!world) return;

        const result = await this.backendClient.stepPet(petId, world);
        petEntry.stepFailures = 0;

        const finalX = result.x ?? 0;
        const finalY = (result.y ?? 0) + (result.offset_y ?? 0);

        petEntry.state = {
          frameIndex: result.frame_index,
          x: finalX,
          y: finalY,
          offsetY: result.offset_y,
          flipH: result.flip_h,
        };

        if (!petEntry.win.isDestroyed()) {
          petEntry.win.setPosition(Math.round(finalX), Math.round(finalY));
          petEntry.win.webContents.send("pet:frame", {
            frameIndex: result.frame_index,
            flipH: result.flip_h,
            opacity: result.opacity ?? 1.0,
            sound: result.sound,
          });
        }

        schedule(result.interval_ms > 0 ? result.interval_ms : 200);
      } catch (err) {
        petEntry.stepFailures = (petEntry.stepFailures || 0) + 1;
        petEntry.lastStepError = err.message;
        this.lastError = err.message;
        log.warn("Step pet error:", err.message);
        if (petEntry.stepFailures >= 5) {
          petEntry.stopped = true;
          return;
        }
        schedule(200);
      }
    };

    if (entry.interval) clearTimeout(entry.interval);
    schedule(200);
  }

  _setupIpcHandlers() {
    if (this.ipcHandlersRegistered) return;
    this.ipcHandlersRegistered = true;

    ipcMain.on("pet:drag", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const petId = this._getPetIdByWindow(win);
      if (petId) this.backendClient.dragPet(petId, ...this._safeWindowPosition(win));
    });

    ipcMain.on("pet:drag:move", (event, data) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const petId = this._getPetIdByWindow(win);
      if (petId) {
        this.backendClient.dragPet(petId, data.x, data.y);
        if (!win.isDestroyed()) win.setPosition(Math.round(data.x), Math.round(data.y));
      }
    });

    ipcMain.on("pet:drop", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const petId = this._getPetIdByWindow(win);
      if (petId) this.backendClient.dropPet(petId);
    });
  }

  _safeWindowPosition(win: any): [number, number] {
    try {
      return win.getPosition();
    } catch {
      return [0, 0];
    }
  }

  _getPetIdByWindow(win: any) {
    return win ? this.windowToPetId.get(win) || null : null;
  }

  getAllPets() {
    return Array.from(this.pets.keys());
  }

  getDiagnostics() {
    return {
      activePetIds: this.getAllPets(),
      petCount: this.pets.size,
      lastError: this.lastError,
      lastPetLoad: this.lastPetLoad,
      windows: this.windowManager.getAllWindows().map(({ id, win }) => ({
        id,
        bounds: typeof win.getBounds === "function" ? win.getBounds() : null,
        visible: typeof win.isVisible === "function" ? win.isVisible() : null,
        destroyed: typeof win.isDestroyed === "function" ? win.isDestroyed() : null,
      })),
    };
  }
}

export = PetManager;
