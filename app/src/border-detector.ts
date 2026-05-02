import { screen } from "electron";

export const BORDER_TOLERANCE = 2;

export type DisplayLike = {
  bounds?: { x: number; y: number; width: number; height: number };
  workArea?: { x: number; y: number; width: number; height: number };
};

export function intersectionArea(bounds: { x: number; y: number; width: number; height: number }, x: number, y: number, width: number, height: number) {
  const overlapW = Math.min(x + width, bounds.x + bounds.width) - Math.max(x, bounds.x);
  const overlapH = Math.min(y + height, bounds.y + bounds.height) - Math.max(y, bounds.y);
  return Math.max(0, overlapW) * Math.max(0, overlapH);
}

export function rectDistance(bounds: { x: number; y: number; width: number; height: number }, x: number, y: number, width: number, height: number) {
  const dx = Math.max(bounds.x - (x + width), x - (bounds.x + bounds.width), 0);
  const dy = Math.max(bounds.y - (y + height), y - (bounds.y + bounds.height), 0);
  return dx + dy;
}

export function nearestDisplay(displays: DisplayLike[], x: number, y: number, width: number, height: number) {
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

export function displayForRect(displays: DisplayLike[], x: number, y: number, width: number, height: number) {
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
  const centeredDisplay = displays.find((display) => (
    display?.bounds
    && centerX >= display.bounds.x
    && centerX <= display.bounds.x + display.bounds.width
    && centerY >= display.bounds.y
    && centerY <= display.bounds.y + display.bounds.height
  ));
  if (centeredDisplay) return centeredDisplay;

  return nearestDisplay(displays, x, y, width, height);
}

export function desktopBounds(displays: DisplayLike[]) {
  if (!Array.isArray(displays) || displays.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
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

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function checkBorder(x: number, y: number, width: number, height: number, displays: DisplayLike[] = screen.getAllDisplays(), tolerance = BORDER_TOLERANCE) {
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

export function checkGravity(x: number, y: number, width: number, height: number, displays: DisplayLike[] = screen.getAllDisplays(), tolerance = BORDER_TOLERANCE) {
  const display = displayForRect(displays, x, y, width, height);
  if (!display?.workArea) return false;

  const bottom = y + height;
  const floorY = display.workArea.y + display.workArea.height;
  return bottom < floorY - tolerance;
}

export function getRawWorldContext(x: number, y: number, width: number, height: number, displays: DisplayLike[] = screen.getAllDisplays()) {
  const display = displayForRect(displays, x, y, width, height);
  if (!display?.bounds || !display?.workArea) return null;

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
    desktop: desktopBounds(displays),
  };
}
