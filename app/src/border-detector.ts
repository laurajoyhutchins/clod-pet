import { screen } from "electron";
import { type Rect, type WorldContext, type BackendWorldContext, type DisplayLike, toRect } from "./store";

export const BORDER_TOLERANCE = 2;

export function intersectionArea(bounds: Rect | Electron.Rectangle, x: number, y: number, width: number, height: number) {
  const boundsRect = 'width' in bounds ? bounds as Rect : toRect(bounds as Electron.Rectangle);
  const overlapW = Math.min(x + width, boundsRect.x + boundsRect.width) - Math.max(x, boundsRect.x);
  const overlapH = Math.min(y + height, boundsRect.y + boundsRect.height) - Math.max(y, boundsRect.y);
  return Math.max(0, overlapW) * Math.max(0, overlapH);
}

export function rectDistance(bounds: Rect | Electron.Rectangle, x: number, y: number, width: number, height: number) {
  const boundsRect = 'width' in bounds ? bounds as Rect : toRect(bounds as Electron.Rectangle);
  const dx = Math.max(boundsRect.x - (x + width), x - (boundsRect.x + boundsRect.width), 0);
  const dy = Math.max(boundsRect.y - (y + height), y - (boundsRect.y + boundsRect.height), 0);
  return dx + dy;
}

export function nearestDisplay(displays: DisplayLike[], x: number, y: number, width: number, height: number): DisplayLike | null {
  let bestDisplay: DisplayLike | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  displays.forEach((display) => {
    if (!display?.bounds) return;
    const distance = rectDistance(display.bounds, x, y, width, height);
    if (distance < bestDistance) {
      bestDisplay = display;
      bestDistance = distance;
    }
  });

  return bestDisplay || displays[0] || null;
}

export function displayForRect(displays: DisplayLike[], x: number, y: number, width: number, height: number): DisplayLike | null {
  if (!Array.isArray(displays) || displays.length === 0) return null;

  let bestDisplay: DisplayLike | null = null;
  let bestArea = -1;

  displays.forEach((display) => {
    if (!display?.bounds) return;
    const area = intersectionArea(display.bounds, x, y, width, height);
    if (area > bestArea) {
      bestDisplay = display;
      bestArea = area;
    }
  });

  if (bestDisplay && bestArea > 0) {
    return bestDisplay;
  }

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const centeredDisplay = displays.find((display) => {
    const bounds = display?.bounds;
    return bounds
    && centerX >= bounds.x
    && centerX <= bounds.x + bounds.width
    && centerY >= bounds.y
    && centerY <= bounds.y + bounds.height;
  });
  if (centeredDisplay) return centeredDisplay;

  return nearestDisplay(displays, x, y, width, height);
}

export function desktopBounds(displays: DisplayLike[]): Rect {
  if (!Array.isArray(displays) || displays.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = displays[0].bounds?.x ?? 0;
  let minY = displays[0].bounds?.y ?? 0;
  let maxX = (displays[0].bounds?.x ?? 0) + (displays[0].bounds?.width ?? 0);
  let maxY = (displays[0].bounds?.y ?? 0) + (displays[0].bounds?.height ?? 0);

  for (let i = 1; i < displays.length; i++) {
    const bounds = displays[i].bounds;
    if (!bounds) continue;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function checkBorder(x: number, y: number, width: number, height: number, displays: DisplayLike[] = screen.getAllDisplays() as DisplayLike[], tolerance = BORDER_TOLERANCE): string[] {
  const display = displayForRect(displays, x, y, width, height);
  if (!display?.bounds) return [];

  const bounds = display.bounds;
  const workArea = display.workArea;
  const borders: string[] = [];

  if (Math.abs(y - bounds.y) <= tolerance) borders.push("ceiling");
  if (workArea && Math.abs((y + height) - (workArea.y + workArea.height)) <= tolerance) borders.push("floor");
  if (Math.abs(x - bounds.x) <= tolerance) borders.push("walls");
  if (Math.abs((x + width) - (bounds.x + bounds.width)) <= tolerance) borders.push("walls");

  return [...new Set(borders)];
}

export function checkGravity(x: number, y: number, width: number, height: number, displays: DisplayLike[] = screen.getAllDisplays() as DisplayLike[], tolerance = BORDER_TOLERANCE): boolean {
  const display = displayForRect(displays, x, y, width, height);
  if (!display?.workArea) return false;

  const bottom = y + height;
  const floorY = display.workArea.y + display.workArea.height;
  return bottom < floorY - tolerance;
}

function toBackendRect(rect: Rect): { x: number; y: number; w: number; h: number } {
  return {
    x: rect.x,
    y: rect.y,
    w: rect.width,
    h: rect.height,
  };
}

export function getRawWorldContext(x: number, y: number, width: number, height: number, displays: DisplayLike[] = screen.getAllDisplays() as DisplayLike[]): BackendWorldContext | null {
  const display = displayForRect(displays, x, y, width, height);
  if (!display?.bounds || !display?.workArea) return null;

  return {
    screen: toBackendRect({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    }),
    work_area: toBackendRect({
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    }),
    desktop: toBackendRect(desktopBounds(displays)),
  };
}
