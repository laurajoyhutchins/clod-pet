import { BrowserWindow, ipcMain, screen } from "electron";
import path = require("path");
import { pathToFileURL } from "url";
import BackendClient = require("./backend-client");
import WindowManager = require("./window-manager");
import * as BorderDetector from "./border-detector";
import logger = require("./logger");
import { WorldStore, type PetInstance, type PetData, type WorldContext, type BackendWorldContext, type PetWindowOptions, type BackendResponse, type DisplayLike, type StepPetPayload, standardizeError } from "./store";

const log = logger.createLogger("pet-manager");
const isDebug = () => process.env.NODE_ENV === "development" || process.env.VERBOSE === "true";

class PetManager {
  backendClient: InstanceType<typeof BackendClient>;
  windowManager: InstanceType<typeof WindowManager>;
  petTimers: Map<string, NodeJS.Timeout>;
  windowToPetId: WeakMap<BrowserWindow, string>;
  draggingPets: Set<string>;
  ipcHandlersRegistered: boolean;
  appIsQuitting: boolean;
  lastError: string | null;
  lastPetLoad: Record<string, unknown> | null;
  scale: number;
  volume: number;
  multiScreenEnabled: boolean;
  store: WorldStore | null;

  constructor(backendUrl: string, store?: WorldStore) {
    this.backendClient = new BackendClient(backendUrl);
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
    this.multiScreenEnabled = true;
  }

  private _getPet(petId: string): PetInstance | null {
    return this.store?.getState().pets[petId] || null;
  }

  private _setPet(petId: string, pet: PetInstance): void {
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

  private _updatePet(petId: string, updates: Partial<PetInstance>): void {
    if (!this.store) return;
    if (typeof this.store.updatePet === "function") {
      this.store.updatePet(petId, updates);
    }
  }

  private _removePetFromStore(petId: string): void {
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

  private _syncEnvironment(): void {
    if (!this.store) return;
    const displays = this._activeDisplays();
    const display = displays[0] || screen.getPrimaryDisplay();
    const displayBounds = display.bounds || { x: 0, y: 0, width: 0, height: 0 };
    const desktop = BorderDetector.desktopBounds(displays);
    const screenBounds = this.multiScreenEnabled ? desktop : displayBounds;
    const workArea = this.multiScreenEnabled ? BorderDetector.workAreaBounds(displays) : (display.workArea || displayBounds);

    this.store.setState({
      environment: {
        screen: { x: screenBounds.x, y: screenBounds.y, width: screenBounds.width, height: screenBounds.height },
        workArea: { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height },
        desktop: desktop,
        scale: this.scale,
        volume: this.volume,
      }
    });
  }

  async init(): Promise<void> {
    this._setupIpcHandlers();

    try {
      const settingsResp = await this.backendClient.getSettings();
      const settings = settingsResp?.payload || {};
      if (settings && settings.Scale) {
        this.scale = settings.Scale;
      }
      if (settings && typeof settings.Volume === "number") {
        this.volume = settings.Volume;
      }
      if (settings && typeof settings.MultiScreenEnabled === "boolean") {
        this.multiScreenEnabled = settings.MultiScreenEnabled;
      }
    } catch (err: unknown) {
      log.warn("Failed to load initial settings:", err instanceof Error ? err.message : String(err));
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
        isDebug: isDebug(),
      };
    });
  }

  async setScale(scale: number): Promise<void> {
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

  setVolume(volume: number): void {
    this.volume = volume;
    log.info("Setting volume to:", volume);
    this._syncEnvironment();
    // Renderer now subscribes to store:volume
  }

  setMultiScreenEnabled(enabled: boolean): void {
    this.multiScreenEnabled = enabled;
    this._syncEnvironment();
  }

  private _activeDisplays(): DisplayLike[] {
    if (this.multiScreenEnabled) {
      return screen.getAllDisplays() as DisplayLike[];
    }
    return [screen.getPrimaryDisplay() as DisplayLike];
  }

  async loadAndCreatePet(petPath: string, spawnId = 0): Promise<string> {
    log.info("Loading pet:", petPath);
    this.lastPetLoad = { petPath, startedAt: new Date().toISOString() };
    const petData = await this.backendClient.loadPet(petPath) as PetData;
    log.info("Pet data loaded:", petData ? "success" : "failed");

    if (!petData || !petData.png_base64 || !petData.tiles_x || !petData.tiles_y) {
      this.lastError = `invalid pet sprite data for ${petPath}`;
      throw new Error(`invalid pet sprite data for ${petPath}`);
    }

    const displays = this._activeDisplays();
    const spawnDisplay = displays[0] || screen.getPrimaryDisplay();
    const spawnBounds = spawnDisplay.bounds || { x: 0, y: 0, width: 0, height: 0 };
    const workArea = spawnDisplay.workArea || spawnBounds;
    const backendWorld = BorderDetector.getRawWorldContext(
      workArea.x + Math.floor(workArea.width / 2),
      workArea.y + Math.floor(workArea.height / 2),
      64, 64,
      displays,
      { multiScreen: this.multiScreenEnabled },
    ) || this._buildBackendWorldContext();
    const addResult = await this.backendClient.addPet(petPath, spawnId, backendWorld) as BackendResponse;
    const addResultPayload = addResult && addResult.payload as Record<string, unknown>;
    const backendPetId = addResultPayload && addResultPayload.pet_id as string;
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

    const desktop = backendWorld.desktop;
    const fallbackX = desktop.x + Math.floor(Math.random() * Math.max(1, desktop.w));
    const fallbackY = desktop.y + Math.floor(Math.random() * Math.max(1, desktop.h * 0.8));
    const rawX = typeof addResultPayload.x === "number" && Number.isFinite(addResultPayload.x) ? addResultPayload.x as number : fallbackX;
    const rawY = typeof addResultPayload.y === "number" && Number.isFinite(addResultPayload.y) ? addResultPayload.y as number : fallbackY;

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
      currentAnimId: typeof addResultPayload.current_anim_id === "number" ? addResultPayload.current_anim_id as number : 0,
      currentAnimName: typeof addResultPayload.current_anim_name === "string" ? addResultPayload.current_anim_name as string : "",
      stepFailures: 0,
      lastStepError: null,
      dragOffsetX: 0,
      dragOffsetY: 0,
      state: {
        frameIndex: 0,
        x,
        y,
        flipH: !!addResultPayload.flip_h,
        borderCtx: typeof addResultPayload.border_ctx === "number" ? addResultPayload.border_ctx as number : 0,
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
      } catch (err: unknown) {
        log.warn("Failed to sync clamped spawn position:", err instanceof Error ? err.message : String(err));
      }
    }

    const petHtmlUrl = new URL(pathToFileURL(path.join(__dirname, "..", "pet.html")).toString());
    petHtmlUrl.searchParams.set("petId", backendPetId);
    const loadPromise = win.loadURL(petHtmlUrl.toString());

    let shown = false;
    const showPetWindow = () => {
      if (shown || win.isDestroyed()) return;
      shown = true;
      // Re-apply the intended position right before showing so the window manager has a
      // chance to honor the spawn coordinates before the first physics sync runs.
      const showX = Number.isFinite(x) ? Math.round(x) : desktop.x;
      const showY = Number.isFinite(y) ? Math.round(y) : desktop.y;
      win.setPosition(showX, showY);
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

    win.webContents.on("render-process-gone", (_event: Electron.Event, details: Electron.RenderProcessGoneDetails) => {
      log.error("Pet window crashed:", details);
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

  _buildWorldContext(): WorldContext {
    const displays = this._activeDisplays();
    const display = displays[0] || screen.getPrimaryDisplay();
    const displayBounds = display.bounds || { x: 0, y: 0, width: 0, height: 0 };
    const desktop = BorderDetector.desktopBounds(displays);
    const screenBounds = this.multiScreenEnabled ? desktop : displayBounds;
    const workArea = this.multiScreenEnabled ? BorderDetector.workAreaBounds(displays) : (display.workArea || displayBounds);

    return {
      screen: { x: screenBounds.x, y: screenBounds.y, width: screenBounds.width, height: screenBounds.height },
      workArea: { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height },
      desktop: desktop,
      scale: this.scale,
      volume: this.volume,
    };
  }

  _buildBackendWorldContext(): BackendWorldContext {
    const displays = this._activeDisplays();
    const display = displays[0] || screen.getPrimaryDisplay();
    const displayBounds = display.bounds || { x: 0, y: 0, width: 0, height: 0 };
    const desktop = BorderDetector.desktopBounds(displays);
    const screenBounds = this.multiScreenEnabled ? desktop : displayBounds;
    const workArea = this.multiScreenEnabled ? BorderDetector.workAreaBounds(displays) : (display.workArea || displayBounds);

    return {
      screen: { x: screenBounds.x, y: screenBounds.y, w: screenBounds.width, h: screenBounds.height },
      work_area: { x: workArea.x, y: workArea.y, w: workArea.width, h: workArea.height },
      desktop: { x: desktop.x, y: desktop.y, w: desktop.width, h: desktop.height },
    };
  }

  async removePet(petId: string): Promise<boolean> {
    this.draggingPets.delete(petId);
    this._clearPetTimer(petId);
    await this.backendClient.removePet(petId);
    this._removePetFromStore(petId);
    this.windowManager.removePetWindow(petId);
    return true;
  }

  shutdown(): void {
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

  _startPetLoop(petId: string): void {
    const entry = this._getPet(petId);
    if (!entry || this.petTimers.has(petId)) return;

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

        const backendWorld = BorderDetector.getRawWorldContext(
          winX,
          winY,
          winW,
          winH,
          this._activeDisplays(),
          { multiScreen: this.multiScreenEnabled },
        );
        if (!backendWorld) {
          schedule(200);
          return;
        }

        const result = await this.backendClient.stepPet(petId, backendWorld) as BackendResponse<StepPetPayload>;
        const resultPayload = result.payload;
        if (!resultPayload) {
          schedule(200);
          return;
        }
        const borderCtx = typeof resultPayload.border_ctx === "number" ? resultPayload.border_ctx : 0;
        const borderLabel = this._borderCtxLabel(borderCtx);
        if (isDebug() && borderLabel && lastBorderCtx !== borderCtx) {
          const animId = typeof petEntry.currentAnimId === "number" ? petEntry.currentAnimId : -1;
          const animName = typeof petEntry.currentAnimName === "string" && petEntry.currentAnimName ? petEntry.currentAnimName : "unknown";
          log.info(`[DEBUG] collision animName=${animName} animId=${animId} borders=${borderLabel} win=(${winX},${winY}) size=(${winW}x${winH})`);
        }
        lastBorderCtx = borderCtx;

        if (isDebug()) {
          log.info(`[DEBUG] loop win=(${winX},${winY}) screen=(${backendWorld.screen.w}x${backendWorld.screen.h}) wa=(${backendWorld.work_area.w}x${backendWorld.work_area.h})`);
          log.info(`[DEBUG] loop result animName=${resultPayload.current_anim_name} animId=${resultPayload.current_anim_id} x=${resultPayload.x} y=${resultPayload.y} nextAnim=${resultPayload.next_anim_id} borderCtx=${resultPayload.border_ctx}`);
        }

        const finalX = resultPayload.x ?? 0;
        const finalY = (resultPayload.y ?? 0) + (resultPayload.offset_y ?? 0);
        const currentAnimId = typeof resultPayload.current_anim_id === "number" ? resultPayload.current_anim_id : petEntry.currentAnimId;
        const currentAnimName = typeof resultPayload.current_anim_name === "string" ? resultPayload.current_anim_name : petEntry.currentAnimName;

        const nextPetState = {
          frameIndex: resultPayload.frame_index,
          x: finalX,
          y: finalY,
          offsetY: resultPayload.offset_y,
          flipH: resultPayload.flip_h,
          opacity: resultPayload.opacity ?? 1.0,
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
            frameIndex: resultPayload.frame_index,
            flipH: resultPayload.flip_h,
            opacity: resultPayload.opacity ?? 1.0,
            sound: resultPayload.sound,
            borderCtx,
            world: backendWorld,
            windowPos: { x: winX, y: winY, w: winW, h: winH },
          });
        }

        schedule(resultPayload.interval_ms > 0 ? resultPayload.interval_ms : 200);
      } catch (err) {
        const diag = standardizeError(err, "pet-manager:stepPet");
        const stepFailures = (petEntry.stepFailures || 0) + 1;
        this.lastError = diag.message;
        log.warn("Step pet error:", diag.message);
        this._updatePet(petId, {
          stepFailures,
          lastStepError: diag.message,
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

  _borderCtxLabel(borderCtx: number): string {
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

  _setupIpcHandlers(): void {
    if (this.ipcHandlersRegistered) return;
    this.ipcHandlersRegistered = true;

    ipcMain.on("pet:drag", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;
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
      if (!win) return;
      const petId = this._getPetIdByWindow(win);
      if (!petId) return;
      const entry = this._getPet(petId);
      if (entry) {
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
      if (!win) return;
      const petId = this._getPetIdByWindow(win);
      if (petId) {
        this.draggingPets.delete(petId);
        this.backendClient.dropPet(petId);
      }
    });
  }

  _safeWindowPosition(win: BrowserWindow): [number, number] {
    try {
      const pos = win.getPosition();
      return [pos[0] ?? 0, pos[1] ?? 0];
    } catch {
      return [0, 0];
    }
  }

  _getPetIdByWindow(win: BrowserWindow | null): string | null {
    return win ? this.windowToPetId.get(win) || null : null;
  }

  getAllPets(): string[] {
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
