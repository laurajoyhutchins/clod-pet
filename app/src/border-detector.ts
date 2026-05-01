import { screen } from "electron";

class BorderDetector {
  tolerance: number;

  constructor(tolerance = 2) {
    this.tolerance = tolerance;
  }

  async init() {
    // Display geometry is read on demand; no cached taskbar state is needed.
  }

  _displayForRect(displays: any[], x: number, y: number, width: number, height: number) {
    if (!Array.isArray(displays) || displays.length === 0) return null;

    let bestDisplay = null;
    let bestArea = -1;

    displays.forEach((display) => {
      if (!display?.bounds) return;
      const area = this._intersectionArea(display.bounds, x, y, width, height);
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

    return this._nearestDisplay(displays, x, y, width, height);
  }

  _nearestDisplay(displays: any[], x: number, y: number, width: number, height: number) {
    let bestDisplay = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    displays.forEach((display) => {
      if (!display?.bounds) return;
      const distance = this._rectDistance(display.bounds, x, y, width, height);
      if (distance < bestDistance) {
        bestDisplay = display;
        bestDistance = distance;
      }
    });

    return bestDisplay || displays[0] || null;
  }

  _intersectionArea(bounds: any, x: number, y: number, width: number, height: number) {
    const overlapW = Math.min(x + width, bounds.x + bounds.width) - Math.max(x, bounds.x);
    const overlapH = Math.min(y + height, bounds.y + bounds.height) - Math.max(y, bounds.y);
    return Math.max(0, overlapW) * Math.max(0, overlapH);
  }

  _rectDistance(bounds: any, x: number, y: number, width: number, height: number) {
    const dx = Math.max(bounds.x - (x + width), x - (bounds.x + bounds.width), 0);
    const dy = Math.max(bounds.y - (y + height), y - (bounds.y + bounds.height), 0);
    return dx + dy;
  }

  _desktopBounds(displays: any[]) {
    if (!Array.isArray(displays) || displays.length === 0) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }

    let minX = displays[0].bounds?.x ?? 0;
    let minY = displays[0].bounds?.y ?? 0;
    let maxX = (displays[0].bounds?.x ?? 0) + (displays[0].bounds?.width ?? 0);
    let maxY = (displays[0].bounds?.y ?? 0) + (displays[0].bounds?.height ?? 0);

    for (let i = 1; i < displays.length; i++) {
      const b = displays[i].bounds;
      if (!b) continue;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  checkBorder(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const display = this._displayForRect(displays, x, y, width, height);
    if (!display?.bounds) return [];

    const bounds = display.bounds;
    const borders: string[] = [];

    if (Math.abs(y - bounds.y) <= this.tolerance) borders.push("top");
    if (Math.abs((y + height) - (bounds.y + bounds.height)) <= this.tolerance) borders.push("bottom");
    if (Math.abs(x - bounds.x) <= this.tolerance) borders.push("left");
    if (Math.abs((x + width) - (bounds.x + bounds.width)) <= this.tolerance) borders.push("right");

    return borders;
  }

  checkGravity(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const display = this._displayForRect(displays, x, y, width, height);
    if (!display?.workArea) return false;

    const bottom = y + height;
    const workBottom = display.workArea.y + display.workArea.height;
    return bottom < workBottom - this.tolerance;
  }

  getRawWorldContext(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const display = this._displayForRect(displays, x, y, width, height);
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
      desktop: this._desktopBounds(displays),
    };
  }
}

export = BorderDetector;
