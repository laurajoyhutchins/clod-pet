import { BrowserWindow, ipcMain, screen } from "electron";
import path = require("path");
import ApiAdapter = require("./api-adapter");
import WindowManager = require("./window-manager");
import * as BorderDetector from "./border-detector";
import logger = require("./logger");
import { WorldStore } from "./store";

const log = logger.createLogger("pet-manager");

class PetManager {
  backendClient: any;
  windowManager: any;
  petTimers: Map<string, any>;
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
    this.petTimers = new Map();
    this.windowToPetId = new WeakMap();
    this.draggingPets = new Set();
    this.ipcHandlersRegistered = false;
    this.appIsQuitting = false;
    this.lastError = null;
    this.lastPetLoad = null;
    this.scale = 1.0;
    this.volume = 0.3;
  }

  private _getPet(petId: string) {
    return this.store?.getState().pets[petId] || null;
  }

  private _setPet(petId: string, pet: any) {
    if (!this.store) return;
    if (typeof this.store.setPet === "function") {
      this.store.setPet(petId, pet);
      return;
    }

    const nextPets = {
      ...this.store.getState().pets,
      [petId]: pet,
    };
    this.store.setState({ pets: nextPets });
  }

  private _updatePet(petId: string, updates: any) {
    if (!this.store) return;
    if (typeof this.store.updatePet === "function") {
      this.store.updatePet(petId, updates);
    }
  }

  private _removePetFromStore(petId: string) {
    if (!this.store) return;
    if (typeof this.store.removePet === "function") {
      this.store.removePet(petId);
      return;
    }

    const pets = { ...this.store.getState().pets };
    if (!pets[petId]) return;
    delete pets[petId];
    this.store.setState({ pets });
  }

  private _clearPetTimer(petId: string) {
    const timer = this.petTimers.get(petId);
    if (timer) {
      clearTimeout(timer);
      this.petTimers.delete(petId);
    }
  }

  private _syncEnvironment() {
    if (!this.store) return;
    const display = screen.getPrimaryDisplay();
    const desktop = BorderDetector.desktopBounds(screen.getAllDisplays());

    this.store.setState({
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

    this._syncEnvironment();

    ipcMain.handle("get-pet-init", (_event, petId) => {
      const petIdStr = String(petId);
      const petWindow = this.windowManager?.windows?.get?.(petIdStr);
      const petData = petWindow?.opts?.petData;
      if (!petData) return null;
      return {
        petId: petIdStr,
        pngBase64: `data:image/png;base64,${petData.png_base64}`,
        tilesX: petData.tiles_x,
        tilesY: petData.tiles_y,
        scale: this.scale,
        volume: this.volume,
        isDebug: process.env.NODE_ENV === "development" || process.env.VERBOSE === "true",
      };
    });
  }

  async setScale(scale: number) {
    this.scale = scale;
    log.info("Setting scale to:", scale);
    this._syncEnvironment();
    for (const [petId, entry] of Object.entries(this.store?.getState().pets || {})) {
      const win = this.windowManager.getPetWindow(petId);
      if (win && !win.isDestroyed()) {
        const width = Math.round(entry.frameW * scale);
        const height = Math.round(entry.frameH * scale);
        win.setSize(width, height);
        // Renderer now subscribes to store:scale
      }
    }
  }

  setVolume(volume: number) {
    this.volume = volume;
    log.info("Setting volume to:", volume);
    this._syncEnvironment();
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
    const world = BorderDetector.getRawWorldContext(
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

    this._setPet(backendPetId, {
      id: backendPetId,
      path: petPath,
      backendPetId,
      frameW,
      frameH,
      currentAnimId: typeof addResult.current_anim_id === "number" ? addResult.current_anim_id : 0,
      currentAnimName: typeof addResult.current_anim_name === "string" ? addResult.current_anim_name : "",
      stepFailures: 0,
      lastStepError: null,
      dragOffsetX: 0,
      dragOffsetY: 0,
      state: {
        frameIndex: 0,
        x,
        y,
        flipH: !!addResult.flip_h,
        borderCtx: typeof addResult.border_ctx === "number" ? addResult.border_ctx : 0,
      },
      loaded: false,
      stopped: false,
    });

    const win = this.windowManager.createPetWindow(backendPetId, {
      x, y,
      width, height,
      preload: path.join(__dirname, "preload.js"),
      petData,
    });

    log.info("Window created, loading pet.html...");
    this.windowToPetId.set(win, backendPetId);

    // If the OS clamped our spawn position, tell the backend the real starting point so
    // its physics begin from where the window actually is.
    if (x !== rawX || y !== rawY) {
      try {
        await this.backendClient.setPosition(backendPetId, x, y);
      } catch (err) {
        log.warn("Failed to sync clamped spawn position:", err.message);
      }
    }

    const loadPromise = win.loadFile(path.join(__dirname, "..", "pet.html"), { query: { petId: backendPetId } });

    let shown = false;
    const showPetWindow = () => {
      if (shown || win.isDestroyed()) return;
      shown = true;
      // Re-apply the intended position right before showing so the window manager has a
      // chance to honor the spawn coordinates before the first physics sync runs.
      win.setPosition(x, y);
      log.debug("Window ready to show", win.getBounds());
      win.showInactive();
      this._startPetLoop(backendPetId);
    };

    win.once("ready-to-show", showPetWindow);

    win.webContents.on("did-finish-load", () => {
      log.info("pet.html loaded successfully");
      this._updatePet(backendPetId, { loaded: true });
      setTimeout(showPetWindow, 50);
    });

    win.webContents.on("crashed", () => {
      log.error("Pet window crashed");
    });

    win.on("closed", () => {
      this.draggingPets.delete(backendPetId);
      this._clearPetTimer(backendPetId);
      if (!this.appIsQuitting && this._getPet(backendPetId)) {
        this.backendClient.removePet(backendPetId);
      }
      this._removePetFromStore(backendPetId);
    });

    await loadPromise;
    return backendPetId;
  }

  _buildWorldContext() {
    const display = screen.getPrimaryDisplay();
    const desktop = BorderDetector.desktopBounds(screen.getAllDisplays());

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

  async removePet(petId: string) {
    this.draggingPets.delete(petId);
    this._clearPetTimer(petId);
    await this.backendClient.removePet(petId);
    this._removePetFromStore(petId);
    this.windowManager.removePetWindow(petId);
    return true;
  }

  shutdown() {
    this.appIsQuitting = true;

    const petIds = Object.keys(this.store?.getState().pets || {});
    for (const petId of petIds) {
      this._clearPetTimer(petId);
    }

    this.draggingPets.clear();

    for (const petId of petIds) {
      this.windowManager.removePetWindow(petId);
    }

    if (this.store) {
      this.store.setState({ pets: {} });
    }
  }

  _startPetLoop(petId: string) {
    const entry = this._getPet(petId);
    if (!entry || this.petTimers.has(petId)) return;

    let debugCount = 0;
    let lastBorderCtx = -1;

    const schedule = (delay: number) => {
      const petEntry = this._getPet(petId);
      const win = this.windowManager.getPetWindow(petId);
      if (!petEntry || petEntry.stopped || !win || win.isDestroyed()) return;
      this._clearPetTimer(petId);
      this.petTimers.set(petId, setTimeout(loop, delay));
    };

    const loop = async () => {
      const petEntry = this._getPet(petId);
      const win = this.windowManager.getPetWindow(petId);
      if (!petEntry || petEntry.stopped || !petEntry.loaded || !win || win.isDestroyed()) return;

      this.petTimers.delete(petId);

      try {
        const [winX, winY] = win.getPosition();
        const [winW, winH] = win.getSize();

        const world = BorderDetector.getRawWorldContext(winX, winY, winW, winH);
        if (!world) {
          schedule(200);
          return;
        }

        if (debugCount < 5) {
          log.info(`[DEBUG] loop win=(${winX},${winY}) screen=(${world.screen.w}x${world.screen.h}) desktop=(${world.desktop.w}x${world.desktop.h}) wa=(${world.work_area.w}x${world.work_area.h})`);
          debugCount++;
        }

        const result = await this.backendClient.stepPet(petId, world);
        const borderCtx = typeof result.border_ctx === "number" ? result.border_ctx : 0;
        const borderLabel = this._borderCtxLabel(borderCtx);
        if (borderLabel && lastBorderCtx !== borderCtx) {
          const animId = typeof petEntry.currentAnimId === "number" ? petEntry.currentAnimId : -1;
          const animName = typeof petEntry.currentAnimName === "string" && petEntry.currentAnimName ? petEntry.currentAnimName : "unknown";
          log.info(`[DEBUG] collision animName=${animName} animId=${animId} borders=${borderLabel} win=(${winX},${winY}) size=(${winW}x${winH})`);
        }
        lastBorderCtx = borderCtx;

        if (process.env.VERBOSE === "true") {
          log.info(`[DEBUG] loop win=(${winX},${winY}) screen=(${world.screen.w}x${world.screen.h}) wa=(${world.work_area.w}x${world.work_area.h})`);
          log.info(`[DEBUG] loop result animName=${result.current_anim_name} animId=${result.current_anim_id} x=${result.x} y=${result.y} nextAnim=${result.next_anim_id} borderCtx=${result.border_ctx}`);
        }

        const finalX = result.x ?? 0;
        const finalY = (result.y ?? 0) + (result.offset_y ?? 0);
        const currentAnimId = typeof result.current_anim_id === "number" ? result.current_anim_id : petEntry.currentAnimId;
        const currentAnimName = typeof result.current_anim_name === "string" ? result.current_anim_name : petEntry.currentAnimName;

        if (debugCount <= 5) {
          const animId = typeof currentAnimId === "number" ? currentAnimId : -1;
          const animName = typeof currentAnimName === "string" && currentAnimName ? currentAnimName : "unknown";
          log.info(`[DEBUG] loop result animName=${animName} animId=${animId} x=${finalX} y=${finalY} nextAnim=${result.next_anim_id}`);
        }

        const nextPetState = {
          frameIndex: result.frame_index,
          x: finalX,
          y: finalY,
          offsetY: result.offset_y,
          flipH: result.flip_h,
          borderCtx,
        };

        this._updatePet(petId, {
          currentAnimId,
          currentAnimName,
          state: nextPetState,
          stepFailures: 0,
          lastStepError: null,
        });

        if (!win.isDestroyed()) {
          win.webContents.send("pet:frame", {
            frameIndex: result.frame_index,
            flipH: result.flip_h,
            opacity: result.opacity ?? 1.0,
            sound: result.sound,
            borderCtx,
            world,
            windowPos: { x: winX, y: winY, w: winW, h: winH },
          });
        }

        schedule(result.interval_ms > 0 ? result.interval_ms : 200);
      } catch (err) {
        const stepFailures = (petEntry.stepFailures || 0) + 1;
        this.lastError = err.message;
        log.warn("Step pet error:", err.message);
        this._updatePet(petId, {
          stepFailures,
          lastStepError: err.message,
        });
        if (stepFailures >= 5) {
          this._updatePet(petId, { stopped: true });
          return;
        }
        schedule(200);
      }
    };

    this._clearPetTimer(petId);
    schedule(200);
  }

  _borderCtxLabel(borderCtx: number) {
    switch (borderCtx) {
      case 1:
        return "floor";
      case 2:
        return "ceiling";
      case 3:
        return "walls";
      case 4:
        return "obstacle";
      default:
        return "";
    }
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
        const entry = this._getPet(petId);
        if (entry) {
          this._updatePet(petId, {
            dragOffsetX: cursor.x - winX,
            dragOffsetY: cursor.y - winY,
          });
        }
        this.backendClient.dragPet(petId, winX, winY);
      }
    });

    ipcMain.on("pet:drag:move", (event, _data) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const petId = this._getPetIdByWindow(win);
      const entry = this._getPet(petId);
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
    return Object.keys(this.store?.getState().pets || {});
  }

  getDiagnostics() {
    const activePetIds = this.getAllPets();
    return {
      activePetIds,
      petCount: activePetIds.length,
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
