export function toFileDataUrl(base64: string, mimeType = "image/png") {
  return `data:${mimeType};base64,${base64}`;
}

export function frameIndexToCoords(frameIndex: number, tilesX: number) {
  const safeTilesX = Math.max(1, tilesX);
  return {
    col: frameIndex % safeTilesX,
    row: Math.floor(frameIndex / safeTilesX),
  };
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}

export function drawFrameToCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  frameIndex: number,
  tilesX: number,
  tilesY: number,
  transparency = "",
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const safeTilesX = Math.max(1, tilesX);
  const safeTilesY = Math.max(1, tilesY);
  const tileW = image.width / safeTilesX;
  const tileH = image.height / safeTilesY;
  const { col, row } = frameIndexToCoords(frameIndex, safeTilesX);
  const sx = col * tileW;
  const sy = row * tileH;
  const width = Math.max(1, Math.round(tileW));
  const height = Math.max(1, Math.round(tileH));

  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, sx, sy, tileW, tileH, 0, 0, width, height);

  if (transparency.toLowerCase() === "magenta") {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

