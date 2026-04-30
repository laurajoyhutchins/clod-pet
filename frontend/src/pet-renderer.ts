class SpriteRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: HTMLImageElement | null;
  tilesX: number;
  tilesY: number;
  tileW: number;
  tileH: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.image = null;
    this.tilesX = 1;
    this.tilesY = 1;
    this.tileW = 0;
    this.tileH = 0;
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

  drawFrame(frameIndex: number, flipH = false) {
    if (!this.image) return;

    const col = frameIndex % this.tilesX;
    const row = Math.floor(frameIndex / this.tilesX);
    const sx = col * this.tileW;
    const sy = row * this.tileH;

    this.canvas.width = Math.ceil(this.tileW);
    this.canvas.height = Math.ceil(this.tileH);
    this.ctx.imageSmoothingEnabled = false;

    this.ctx.save();
    if (flipH) {
      this.ctx.translate(this.tileW, 0);
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(
      this.image,
      sx, sy, this.tileW, this.tileH,
      0, 0, this.tileW, this.tileH
    );
    this.ctx.restore();
  }

  setOpacity(alpha: number) {
    this.canvas.style.opacity = String(alpha);
  }
}

const canvas = document.getElementById("sprite") as HTMLCanvasElement;
const clickLayer = document.getElementById("click-layer") as HTMLElement;
const renderer = new SpriteRenderer(canvas);

let isDragging = false;

async function initPetRenderer() {
  try {
    console.log("[pet-renderer] Requesting init data via invoke...");
    const params = new URLSearchParams(window.location.search);
    const petId = params.get('petId');
    const data = await window.clodPet.invoke("get-pet-init", petId);
    console.log("[pet-renderer] Received init data, loading sprite...");
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
});

initPetRenderer();

window.addEventListener("error", (event) => {
  window.clodPet.control.reportError("pet-renderer", event.message, event.error?.stack);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  window.clodPet.control.reportError("pet-renderer", reason.message, reason.stack);
});
