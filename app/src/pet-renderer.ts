class SpriteRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: HTMLImageElement | null;
  tilesX: number;
  tilesY: number;
  tileW: number;
  tileH: number;
  scale: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.image = null;
    this.tilesX = 1;
    this.tilesY = 1;
    this.tileW = 0;
    this.tileH = 0;
    this.scale = 1.0;
  }

  loadSpriteSheet(pngData: string, tilesX: number, tilesY: number) {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.tilesX = tilesX;
        this.tilesY = tilesY;
        this.tileW = img.width / tilesX;
        this.tileH = img.height / tilesY;
        resolve();
      };
      img.onerror = reject;
      img.src = pngData;
    });
  }

  setScale(scale: number) {
    this.scale = scale;
  }

  drawFrame(frameIndex: number, flipH = false) {
    if (!this.image) return;

    const col = frameIndex % this.tilesX;
    const row = Math.floor(frameIndex / this.tilesX);
    const sx = col * this.tileW;
    const sy = row * this.tileH;

    const dw = this.tileW * this.scale;
    const dh = this.tileH * this.scale;

    this.canvas.width = Math.ceil(dw);
    this.canvas.height = Math.ceil(dh);
    this.ctx.imageSmoothingEnabled = false;

    this.ctx.save();
    if (flipH) {
      this.ctx.translate(dw, 0);
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(
      this.image,
      sx, sy, this.tileW, this.tileH,
      0, 0, dw, dh
    );
    this.ctx.restore();
  }

  setOpacity(alpha: number) {
    this.canvas.style.opacity = String(alpha);
  }
}

type SoundPayload = {
  mime_type?: string;
  data_base64?: string;
  loop?: number;
};

class SoundPlayer {
  volume: number;

  constructor(volume = 0.3) {
    this.volume = volume;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  play(sound?: SoundPayload) {
    if (!sound || !sound.data_base64) return;

    const mimeType = sound.mime_type || "audio/wav";
    const audio = new Audio(`data:${mimeType};base64,${sound.data_base64}`);
    audio.volume = this.volume;
    audio.play().catch((err) => {
      console.warn("[pet-renderer] Failed to play sound:", err);
    });
  }
}

const canvasEl = document.getElementById("sprite");
const clickLayerEl = document.getElementById("click-layer");
const backendStatusEl = document.getElementById("backend-status");
const debugBordersEl = document.getElementById("debug-borders");

if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("Missing #sprite canvas element");
}
if (!(clickLayerEl instanceof HTMLElement)) {
  throw new Error("Missing #click-layer element");
}
if (!(backendStatusEl instanceof HTMLDivElement)) {
  throw new Error("Missing #backend-status element");
}
if (!(debugBordersEl instanceof HTMLDivElement)) {
  throw new Error("Missing #debug-borders element");
}

const canvas = canvasEl;
const clickLayer = clickLayerEl;
const backendStatus = backendStatusEl;
const debugBorders = debugBordersEl;
const renderer = new SpriteRenderer(canvas);
const soundPlayer = new SoundPlayer();
const BORDER_CTX_LABELS: Record<number, string> = {
  0: "",
  1: "floor",
  2: "ceiling",
  3: "walls",
  4: "obstacle",
};

let isDragging = false;
let isDebug = false;
let backendStatusTimer: any = null;

function setBackendStatus(message: string | null) {
  if (!backendStatus) return;

  if (!message) {
    backendStatus.style.display = "none";
    backendStatus.textContent = "";
    return;
  }

  backendStatus.textContent = message;
  backendStatus.style.display = "block";
}

async function refreshBackendStatus() {
  // Now handled reactively by subscribeToStore
}

async function initPetRenderer() {
  try {
    console.log("[pet-renderer] Requesting init data via invoke...");
    const params = new URLSearchParams(window.location.search);
    const petId = params.get('petId');
    const data = await window.clodPet.invoke("get-pet-init", petId);
    console.log("[pet-renderer] Received init data, loading sprite...");
    
    // Initial sync from store
    const state = await window.clodPet.store.getState();
    if (state.environment.scale) renderer.setScale(state.environment.scale);
    if (typeof state.environment.volume === "number") soundPlayer.setVolume(state.environment.volume);
    
    isDebug = !!data.isDebug;
    if (isDebug && debugBorders) {
      debugBorders.style.display = "block";
    }
    await renderer.loadSpriteSheet(data.pngBase64, data.tilesX, data.tilesY);
    renderer.drawFrame(0);
    
    subscribeToStore(petId);
    console.log("[pet-renderer] Pet initialized successfully");
  } catch (err) {
    console.error("[pet-renderer] Failed to init pet:", err);
  }
}

function subscribeToStore(petId: string | null) {
  if (!petId) return;

  window.clodPet.store.subscribe((state: any) => {
    // 1. Sync Settings
    renderer.setScale(state.environment.scale);
    soundPlayer.setVolume(state.environment.volume);

    // 2. Sync Backend Status
    const backend = state.backend;
    if (backend.status === "fatal" || backend.status === "failed" || !backend.available) {
      const fatal = backend.lastError || "unexpected crash";
      setBackendStatus(`Backend unavailable: ${fatal}`);
    } else if (backend.status === "restarting") {
      const suffix = backend.nextRestartAt ? `, retrying at ${backend.nextRestartAt}` : "";
      setBackendStatus(`Backend restarting after crash${suffix}`);
    } else {
      setBackendStatus(null);
    }

    // 3. Debug Overlays (Reactive)
    if (isDebug && debugBorders) {
      const pet = state.pets[petId];
      if (pet) {
        updateDebugBorders(typeof pet.state.borderCtx === "number" ? pet.state.borderCtx : 0);
      }
    }
  });
}

const removeFrameListener = window.clodPet.on("pet:frame", (data) => {
  renderer.drawFrame(data.frameIndex, data.flipH);
  renderer.setOpacity(data.opacity);
  soundPlayer.play(data.sound);

  if (isDebug && debugBorders) {
    updateDebugBorders(typeof data.borderCtx === "number" ? data.borderCtx : 0);
  }
});

function updateDebugBorders(borderCtx: number) {
  if (!debugBorders) return;

  const label = BORDER_CTX_LABELS[borderCtx] || "";
  debugBorders.textContent = label ? `Border: ${label}` : "";
}

// Remove old listeners
const removeScaleListener = () => {};
const removeVolumeListener = () => {};

clickLayer.addEventListener("pointerdown", (e) => {
  isDragging = true;
  clickLayer.classList.add("dragging");
  clickLayer.setPointerCapture(e.pointerId);
  window.clodPet.send("pet:drag");
});

clickLayer.addEventListener("pointermove", (e) => {
  if (!isDragging) return;
  window.clodPet.send("pet:drag:move", {
    x: e.screenX,
    y: e.screenY,
  });
});

clickLayer.addEventListener("pointerup", (e) => {
  if (!isDragging) return;
  isDragging = false;
  clickLayer.releasePointerCapture(e.pointerId);
  clickLayer.classList.remove("dragging");
  window.clodPet.send("pet:drop");
});

window.addEventListener("beforeunload", () => {
  removeFrameListener();
  removeScaleListener();
  removeVolumeListener();
  if (backendStatusTimer) clearInterval(backendStatusTimer);
});

initPetRenderer();
refreshBackendStatus();
backendStatusTimer = setInterval(refreshBackendStatus, 2000);

window.addEventListener("error", (event) => {
  window.clodPet.control.reportError("pet-renderer", event.message, event.error?.stack);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  window.clodPet.control.reportError("pet-renderer", reason.message, reason.stack);
});
