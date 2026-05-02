import { BrowserWindow, ipcMain, screen } from "electron";
import path = require("path");
import ApiAdapter = require("./api-adapter");
import WindowManager = require("./window-manager");
import BorderDetector = require("./border-detector");
import logger = require("./logger");
import { WorldStore } from "./store";

const log = logger.createLogger("pet-manager");

class PetManager {
  backendClient: any;
  windowManager: any;
  borderDetector: any;
  pets: Map<string, any>;
  windowToPetId: WeakMap<any, string>;
  draggingPets: Set<string>;
  ipcHandlersRegistered: boolean;
  appIsQuitting: boolean;
  lastError: string | null;
  lastPetLoad: any;
  scale: number;
  volume: number;
  store: WorldStore | null;

  constructor(backendUrl: string, store?: WorldStore) {
    this.backendClient = new ApiAdapter(backendUrl);
    this.store = store || null;
    this.windowManager = new WindowManager(this.store || undefined);
    this.borderDetector = new BorderDetector();
    this.pets = new Map();
    this.windowToPetId = new WeakMap();
    this.draggingPets = new Set();
    this.ipcHandlersRegistered = false;
    this.appIsQuitting = false;
    this.lastError = null;
    this.lastPetLoad = null;
    this.scale = 1.0;
    this.volume = 0.3;
  }

  _syncStore() {
    if (!this.store) return;
    const pets: Record<string, any> = {};
    for (const [id, entry] of this.pets) {
      pets[id] = {
        id: id,
        path: entry.petPath,
        backendPetId: entry.backendPetId,
        frameW: entry.frameW,
        frameH: entry.frameH,
        currentAnimId: entry.currentAnimId,
        currentAnimName: entry.currentAnimName,
        state: entry.state,
        loaded: entry.loaded,
        stopped: entry.stopped,
      };
    }

    const display = screen.getPrimaryDisplay();
    const desktop = this._desktopBounds();

    this.store.setState({
      pets,
      environment: {
        DisplayBounds: { x: display.bounds.x, y: display.bounds.y, w: display.bounds.width, h: display.bounds.height },
        WorkArea: { x: display.workArea.x, y: display.workArea.y, w: display.workArea.width, h: display.workArea.height },
        Desktop: { x: desktop.x, y: desktop.y, w: desktop.w, h: desktop.h },
        scale: this.scale,
        volume: this.volume,
      }
    });
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

    this._syncStore();

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
        isDebug: process.env.NODE_ENV === "development" || process.env.VERBOSE === "true",
      };
    });
  }

  async setScale(scale: number) {
    this.scale = scale;
    log.info("Setting scale to:", scale);
    this._syncStore();
    for (const entry of this.pets.values()) {
      if (!entry.win.isDestroyed()) {
        const width = Math.round(entry.frameW * scale);
        const height = Math.round(entry.frameH * scale);
        entry.win.setSize(width, height);
        // Renderer now subscribes to store:scale
      }
    }
  }

  setVolume(volume: number) {
    this.volume = volume;
    log.info("Setting volume to:", volume);
    this._syncStore();
    // Renderer now subscribes to store:volume
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

    const workArea = screen.getPrimaryDisplay().workArea;
    const world = this.borderDetector.getRawWorldContext(
      workArea.x + Math.floor(workArea.width / 2),
      workArea.y + Math.floor(workArea.height / 2),
      64, 64
    ) || this._buildWorldContext();
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

    const frameW = petData.frame_w || 64;
    const frameH = petData.frame_h || 64;
    const width = Math.round(frameW * this.scale);
    const height = Math.round(frameH * this.scale);

    const desktop = world.desktop;
    const rawX = typeof addResult.x === "number" ? addResult.x : desktop.x + Math.floor(Math.random() * desktop.w);
    const rawY = typeof addResult.y === "number" ? addResult.y : desktop.y + Math.floor(Math.random() * desktop.h * 0.8);

    // Clamp to desktop area — Wayland can't position windows off-screen, so the OS would snap an
    // off-screen spawn (e.g. screenW+10) to (0,0). Clamping here puts the pet at the nearest
    // visible edge instead, preserving the intended "enter from the side" behaviour.
    const x = Math.max(desktop.x, Math.min(desktop.x + desktop.w - width, rawX));
    const y = Math.max(desktop.y, Math.min(desktop.y + desktop.h - height, rawY));

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
      currentAnimId: typeof addResult.current_anim_id === "number" ? addResult.current_anim_id : 0,
      currentAnimName: typeof addResult.current_anim_name === "string" ? addResult.current_anim_name : "",
      state: { frameIndex: 0, x, y, flipH: !!addResult.flip_h },
      interval: null,
      stepFailures: 0,
      stopped: false,
      loaded: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
    };

    this.pets.set(petEntry.backendPetId, petEntry);
    this.windowToPetId.set(win, petEntry.backendPetId);
    this._syncStore();

    // If the OS clamped our spawn position, tell the backend the real starting point so
    // its physics begin from where the window actually is.
    if (x !== rawX || y !== rawY) {
      try {
        await this.backendClient.setPosition(backendPetId, x, y);
      } catch (err) {
        log.warn("Failed to sync clamped spawn position:", err.message);
      }
    }

    const petId = petEntry.backendPetId;
    const loadPromise = win.loadFile(path.join(__dirname, "..", "pet.html"), { query: { petId } });

    let shown = false;
    const showPetWindow = () => {
      if (shown || win.isDestroyed()) return;
      shown = true;
      // Re-apply the intended position right before showing so the window manager has a
      // chance to honor the spawn coordinates before the first physics sync runs.
      win.setPosition(x, y);
      log.debug("Window ready to show", win.getBounds());
      win.showInactive();
      this._startPetLoop(petEntry.backendPetId);
    };

    win.once("ready-to-show", showPetWindow);

    win.webContents.on("did-finish-load", () => {
      log.info("pet.html loaded successfully");
      petEntry.loaded = true;
      this._syncStore();
      setTimeout(showPetWindow, 50);
    });

    win.webContents.on("crashed", () => {
      log.error("Pet window crashed");
    });

    win.on("closed", () => {
      petEntry.stopped = true;
      this.draggingPets.delete(petEntry.backendPetId);
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
    const desktop = this._desktopBounds();

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
      desktop: {
        x: desktop.x,
        y: desktop.y,
        w: desktop.w,
        h: desktop.h,
      },
    };
  }

  _desktopBounds() {
    const displays = screen.getAllDisplays();
    if (displays.length === 0) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }

    let minX = displays[0].bounds.x;
    let minY = displays[0].bounds.y;
    let maxX = displays[0].bounds.x + displays[0].bounds.width;
    let maxY = displays[0].bounds.y + displays[0].bounds.height;

    for (let i = 1; i < displays.length; i++) {
      const bounds = displays[i].bounds;
      if (!bounds) continue;
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    };
  }

  async removePet(petId: string) {
    const entry = this.pets.get(petId);
    if (!entry) {
      return this.backendClient.removePet(petId);
    }

    this.draggingPets.delete(petId);
    entry.stopped = true;
    if (entry.interval) clearTimeout(entry.interval);
    await this.backendClient.removePet(petId);
    this.pets.delete(petId);
    this.windowManager.removePetWindow(petId);
    this._syncStore();
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

    this.draggingPets.clear();

    for (const petId of Array.from(this.pets.keys())) {
      this.windowManager.removePetWindow(petId);
    }

    this.pets.clear();
    this._syncStore();
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
        const isDragging = this.draggingPets.has(petId);
        const [winX, winY] = petEntry.win.getPosition();
        const [winW, winH] = petEntry.win.getSize();

        const world = this.borderDetector.getRawWorldContext(winX, winY, winW, winH);
        if (!world) {
          schedule(200);
          return;
        }

        if (petEntry._debugCount === undefined) petEntry._debugCount = 0;
        if (petEntry._debugCount < 5) {
          log.info(`[DEBUG] loop win=(${winX},${winY}) screen=(${world.screen.w}x${world.screen.h}) desktop=(${world.desktop.w}x${world.desktop.h}) wa=(${world.work_area.w}x${world.work_area.h})`);
          petEntry._debugCount++;
        }

        const collision = this.borderDetector.checkBorder(winX, winY, winW, winH);
        const collisionKey = collision.length > 0 ? collision.join(",") : "";
        if (collisionKey && petEntry._lastCollisionKey !== collisionKey) {
          const animId = typeof petEntry.currentAnimId === "number" ? petEntry.currentAnimId : -1;
          const animName = typeof petEntry.currentAnimName === "string" && petEntry.currentAnimName ? petEntry.currentAnimName : "unknown";
          log.info(`[DEBUG] collision animName=${animName} animId=${animId} borders=${collisionKey} win=(${winX},${winY}) size=(${winW}x${winH})`);
        }
        petEntry._lastCollisionKey = collisionKey;

        const result = await this.backendClient.stepPet(petId, world);
        if (process.env.VERBOSE === "true") {
          log.info(`[DEBUG] loop win=(${winX},${winY}) screen=(${world.screen.w}x${world.screen.h}) wa=(${world.work_area.w}x${world.work_area.h})`);
          log.info(`[DEBUG] loop result animName=${result.current_anim_name} animId=${result.current_anim_id} x=${result.x} y=${result.y} nextAnim=${result.next_anim_id}`);
        }
        petEntry.stepFailures = 0;

        const finalX = result.x ?? 0;
        const finalY = (result.y ?? 0) + (result.offset_y ?? 0);
        petEntry.currentAnimId = typeof result.current_anim_id === "number" ? result.current_anim_id : petEntry.currentAnimId;
        petEntry.currentAnimName = typeof result.current_anim_name === "string" ? result.current_anim_name : petEntry.currentAnimName;

        if (petEntry._debugCount <= 5) {
          const animId = typeof petEntry.currentAnimId === "number" ? petEntry.currentAnimId : -1;
          const animName = typeof petEntry.currentAnimName === "string" && petEntry.currentAnimName ? petEntry.currentAnimName : "unknown";
          log.info(`[DEBUG] loop result animName=${animName} animId=${animId} x=${finalX} y=${finalY} nextAnim=${result.next_anim_id}`);
        }

        const nextPetState = {
          frameIndex: result.frame_index,
          x: finalX,
          y: finalY,
          offsetY: result.offset_y,
          flipH: result.flip_h,
        };

        if (this.store) {
          this.store.updatePet(petId, {
            currentAnimId: petEntry.currentAnimId,
            currentAnimName: petEntry.currentAnimName,
            state: nextPetState,
          });
        }

        if (!petEntry.win.isDestroyed()) {
          petEntry.state = nextPetState;
          petEntry.win.webContents.send("pet:frame", {
            frameIndex: result.frame_index,
            flipH: result.flip_h,
            opacity: result.opacity ?? 1.0,
            sound: result.sound,
            borders: collision,
            // Optimization: Renderer will soon read world/pos from store
            world,
            windowPos: { x: winX, y: winY, w: winW, h: winH },
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
      if (petId) {
        this.draggingPets.add(petId);
        const [winX, winY] = this._safeWindowPosition(win);
        // Record where in the window the user clicked so we can preserve that offset
        // during drag instead of snapping the window's top-left to the cursor.
        const cursor = screen.getCursorScreenPoint();
        const entry = this.pets.get(petId);
        if (entry) {
          entry.dragOffsetX = cursor.x - winX;
          entry.dragOffsetY = cursor.y - winY;
        }
        this.backendClient.dragPet(petId, winX, winY);
      }
    });

    ipcMain.on("pet:drag:move", (event, _data) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const petId = this._getPetIdByWindow(win);
      const entry = this.pets.get(petId);
      if (petId && entry) {
        this.draggingPets.add(petId);
        // Use the main-process cursor position instead of the renderer's screenX/screenY —
        // on Wayland those values are window-relative, not absolute screen coordinates.
        const cursor = screen.getCursorScreenPoint();
        const newX = cursor.x - (entry.dragOffsetX ?? 0);
        const newY = cursor.y - (entry.dragOffsetY ?? 0);
        this.backendClient.dragPet(petId, newX, newY);
        if (!win.isDestroyed()) win.setPosition(Math.round(newX), Math.round(newY));
      }
    });

    ipcMain.on("pet:drop", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const petId = this._getPetIdByWindow(win);
      if (petId) {
        this.draggingPets.delete(petId);
        this.backendClient.dropPet(petId);
      }
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
