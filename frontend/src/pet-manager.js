"use strict";
const electron_1 = require("electron");
const path = require("path");
const ApiAdapter = require("./api-adapter");
const WindowManager = require("./window-manager");
const BorderDetector = require("./border-detector");
const logger = require("./logger");
const log = logger.createLogger("pet-manager");
class PetManager {
    constructor(backendUrl) {
        this.backendClient = new ApiAdapter(backendUrl);
        this.windowManager = new WindowManager();
        this.borderDetector = new BorderDetector();
        this.pets = new Map();
        this.windowToPetId = new WeakMap();
        this.ipcHandlersRegistered = false;
        this.lastError = null;
        this.lastPetLoad = null;
    }
    async init() {
        await this.borderDetector.init();
        this._setupIpcHandlers();
        electron_1.ipcMain.handle("get-pet-init", (_event, petId) => {
            const targetEntry = this.pets.get(String(petId));
            if (!targetEntry)
                return null;
            return {
                petId: targetEntry.backendPetId,
                pngBase64: `data:image/png;base64,${targetEntry.petData.png_base64}`,
                tilesX: targetEntry.petData.tiles_x,
                tilesY: targetEntry.petData.tiles_y,
            };
        });
    }
    async loadAndCreatePet(petPath, spawnId = 1) {
        log.info("Loading pet:", petPath);
        this.lastPetLoad = { petPath, startedAt: new Date().toISOString() };
        const petData = await this.backendClient.loadPet(petPath);
        log.info("Pet data loaded:", petData ? "success" : "failed");
        if (!petData || !petData.png_base64 || !petData.tiles_x || !petData.tiles_y) {
            this.lastError = `invalid pet sprite data for ${petPath}`;
            throw new Error(`invalid pet sprite data for ${petPath}`);
        }
        const addResult = await this.backendClient.addPet(petPath, spawnId);
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
        const workArea = electron_1.screen.getPrimaryDisplay().workArea;
        const x = workArea.x + Math.floor(Math.random() * workArea.width);
        const y = workArea.y + Math.floor(Math.random() * workArea.height * 0.8);
        const win = this.windowManager.createPetWindow(backendPetId, {
            x, y,
            width: 64, height: 64,
            preload: path.join(__dirname, "preload.js"),
        });
        log.info("Window created, loading pet.html...");
        const petEntry = {
            win,
            petData,
            petPath,
            backendPetId,
            state: { frameIndex: 0, x, y, flipH: false },
            interval: null,
            stepFailures: 0,
            loaded: false,
        };
        this.pets.set(petEntry.backendPetId, petEntry);
        this.windowToPetId.set(win, petEntry.backendPetId);
        const petId = petEntry.backendPetId;
        const loadPromise = win.loadFile(path.join(__dirname, "..", "pet.html"), { query: { petId } });
        let shown = false;
        const showPetWindow = () => {
            if (shown || win.isDestroyed())
                return;
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
            if (this.pets.has(petEntry.backendPetId)) {
                this.backendClient.removePet(petEntry.backendPetId);
                this.pets.delete(petEntry.backendPetId);
            }
            if (petEntry.interval)
                clearInterval(petEntry.interval);
        });
        await loadPromise;
        return petEntry.backendPetId;
    }
    async removePet(petId) {
        const entry = this.pets.get(petId);
        if (!entry) {
            return this.backendClient.removePet(petId);
        }
        await this.backendClient.removePet(petId);
        this.pets.delete(petId);
        if (entry.interval)
            clearInterval(entry.interval);
        this.windowManager.removePetWindow(petId);
        return true;
    }
    _startPetLoop(petId) {
        const entry = this.pets.get(petId);
        if (!entry || entry.interval)
            return;
        const loop = async () => {
            const petEntry = this.pets.get(petId);
            if (!petEntry || !petEntry.loaded || petEntry.win.isDestroyed())
                return;
            try {
                const [winX, winY] = petEntry.win.getPosition();
                const [winW, winH] = petEntry.win.getSize();
                const world = this.borderDetector.getRawWorldContext(winX, winY, winW, winH);
                if (!world)
                    return;
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
                    });
                }
                if (result.interval_ms > 0 && petEntry.interval) {
                    clearInterval(petEntry.interval);
                    petEntry.interval = setInterval(loop, result.interval_ms);
                }
            }
            catch (err) {
                petEntry.stepFailures = (petEntry.stepFailures || 0) + 1;
                petEntry.lastStepError = err.message;
                this.lastError = err.message;
                log.warn("Step pet error:", err.message);
                if (petEntry.stepFailures >= 5 && petEntry.interval) {
                    clearInterval(petEntry.interval);
                    petEntry.interval = null;
                }
            }
        };
        if (entry.interval)
            clearInterval(entry.interval);
        entry.interval = setInterval(loop, 200);
    }
    _setupIpcHandlers() {
        if (this.ipcHandlersRegistered)
            return;
        this.ipcHandlersRegistered = true;
        electron_1.ipcMain.on("pet:drag", (event) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            const petId = this._getPetIdByWindow(win);
            if (petId)
                this.backendClient.dragPet(petId, ...this._safeWindowPosition(win));
        });
        electron_1.ipcMain.on("pet:drag:move", (event, data) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            const petId = this._getPetIdByWindow(win);
            if (petId) {
                this.backendClient.dragPet(petId, data.x, data.y);
                if (!win.isDestroyed())
                    win.setPosition(Math.round(data.x), Math.round(data.y));
            }
        });
        electron_1.ipcMain.on("pet:drop", (event) => {
            const win = electron_1.BrowserWindow.fromWebContents(event.sender);
            const petId = this._getPetIdByWindow(win);
            if (petId)
                this.backendClient.dropPet(petId);
        });
    }
    _safeWindowPosition(win) {
        try {
            return win.getPosition();
        }
        catch {
            return [0, 0];
        }
    }
    _getPetIdByWindow(win) {
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
module.exports = PetManager;
