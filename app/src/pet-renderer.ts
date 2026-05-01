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

if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("Missing #sprite canvas element");
}
if (!(clickLayerEl instanceof HTMLElement)) {
  throw new Error("Missing #click-layer element");
}
if (!(backendStatusEl instanceof HTMLDivElement)) {
  throw new Error("Missing #backend-status element");
}

const canvas = canvasEl;
const clickLayer = clickLayerEl;
const backendStatus = backendStatusEl;
const renderer = new SpriteRenderer(canvas);
const soundPlayer = new SoundPlayer();

let isDragging = false;
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
  try {
    const diag = await window.clodPet.control.diagnostics();
    const backend = diag?.backend || {};

    if (backend.state === "fatal" || backend.state === "failed" || backend.available === false) {
      const fatal = backend.fatalError || backend.lastError || "unexpected crash";
      setBackendStatus(`Backend unavailable: ${fatal}`);
      return;
    }

    if (backend.state === "restarting") {
      const suffix = backend.nextRestartAt ? `, retrying at ${backend.nextRestartAt}` : "";
      setBackendStatus(`Backend restarting after crash${suffix}`);
      return;
    }

    setBackendStatus(null);
  } catch (err: any) {
    setBackendStatus(`Backend unavailable: ${err.message}`);
  }
}

async function initPetRenderer() {
  try {
    console.log("[pet-renderer] Requesting init data via invoke...");
    const params = new URLSearchParams(window.location.search);
    const petId = params.get('petId');
    const data = await window.clodPet.invoke("get-pet-init", petId);
    console.log("[pet-renderer] Received init data, loading sprite...");
    if (data.scale) renderer.setScale(data.scale);
    if (typeof data.volume === "number") soundPlayer.setVolume(data.volume);
    await renderer.loadSpriteSheet(data.pngBase64, data.tilesX, data.tilesY);
    renderer.drawFrame(0);
    console.log("[pet-renderer] Pet initialized successfully");
  } catch (err) {
    console.error("[pet-renderer] Failed to init pet:", err);
  }
}

const removeFrameListener = window.clodPet.on("pet:frame", (data) => {
  renderer.drawFrame(data.frameIndex, data.flipH);
  renderer.setOpacity(data.opacity);
  soundPlayer.play(data.sound);
});

const removeScaleListener = window.clodPet.on("pet:scale", (scale) => {
  renderer.setScale(scale);
});

const removeVolumeListener = window.clodPet.on("pet:volume", (volume) => {
  soundPlayer.setVolume(volume);
});

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
