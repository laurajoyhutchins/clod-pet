class SpriteRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.image = null;
    this.tilesX = 1;
    this.tilesY = 1;
    this.tileW = 0;
    this.tileH = 0;
  }

  loadSpriteSheet(pngData, tilesX, tilesY) {
    return new Promise((resolve, reject) => {
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

  drawFrame(frameIndex, flipH = false) {
    if (!this.image) return;

    const col = frameIndex % this.tilesX;
    const row = Math.floor(frameIndex / this.tilesX);
    const sx = col * this.tileW;
    const sy = row * this.tileH;

    this.canvas.width = Math.ceil(this.tileW);
    this.canvas.height = Math.ceil(this.tileH);

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

  setOpacity(alpha) {
    this.canvas.style.opacity = alpha;
  }
}

const canvas = document.getElementById("sprite");
const clickLayer = document.getElementById("click-layer");
const renderer = new SpriteRenderer(canvas);

let isDragging = false;

async function init() {
  try {
    const data = await window.clodPet.receive("pet:init");
    await renderer.loadSpriteSheet(data.pngBase64, data.tilesX, data.tilesY);
    renderer.drawFrame(0);
  } catch (err) {
    console.error("Failed to init pet:", err);
  }
}

window.clodPet.on("pet:frame", (data) => {
  renderer.drawFrame(data.frameIndex, data.flipH);
  renderer.setOpacity(data.opacity);
});

clickLayer.addEventListener("mousedown", (e) => {
  isDragging = true;
  clickLayer.classList.add("dragging");
  window.clodPet.send("pet:drag");
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  window.clodPet.send("pet:drag:move", {
    x: e.screenX,
    y: e.screenY,
  });
});

window.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  clickLayer.classList.remove("dragging");
  window.clodPet.send("pet:drop");
});

init();
