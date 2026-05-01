import { screen } from "electron";

class BorderDetector {
  taskbarBoundsByDisplay: Map<number, any>;
  tolerance: number;

  constructor(tolerance = 2) {
    this.taskbarBoundsByDisplay = new Map();
    this.tolerance = tolerance;
  }

  async init() {
    this._detectTaskbar();
  }

  _detectTaskbar() {
    const displays = screen.getAllDisplays();
    this.taskbarBoundsByDisplay.clear();

    displays.forEach((display, index) => {
      const taskbarBounds = this._taskbarBoundsForDisplay(display);

      if (taskbarBounds && taskbarBounds.width > 0 && taskbarBounds.height > 0) {
        const displayId = display.id ?? index;
        this.taskbarBoundsByDisplay.set(displayId, taskbarBounds);
      }
    });
  }

  _taskbarBoundsForDisplay(display: any) {
    if (!display || !display.bounds || !display.workArea) return null;

    const workArea = display.workArea;
    const bounds = display.bounds;
    const rightInset = (bounds.x + bounds.width) - (workArea.x + workArea.width);
    const bottomInset = (bounds.y + bounds.height) - (workArea.y + workArea.height);
    const edgeInsets = [
      { edge: "top", size: workArea.y - bounds.y },
      { edge: "left", size: workArea.x - bounds.x },
      { edge: "right", size: rightInset },
      { edge: "bottom", size: bottomInset },
    ];
    const inset = edgeInsets.reduce((largest, current) => (
      current.size > largest.size ? current : largest
    ), { edge: "", size: 0 });

    if (inset.size <= 0) return null;

    switch (inset.edge) {
      case "top":
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: inset.size };
      case "left":
        return { x: bounds.x, y: bounds.y, width: inset.size, height: bounds.height };
      case "right":
        return { x: workArea.x + workArea.width, y: bounds.y, width: inset.size, height: bounds.height };
      case "bottom":
        return { x: bounds.x, y: workArea.y + workArea.height, width: bounds.width, height: inset.size };
      default:
        return null;
    }
  }

  _displayForRect(displays: any[], x: number, y: number, width: number, height: number) {
    let bestDisplay = null;
    let bestArea = 0;

    displays.forEach((display) => {
      if (!display.bounds) return;
      const area = this._intersectionArea(display.bounds, x, y, width, height);
      if (area > bestArea) {
        bestDisplay = display;
        bestArea = area;
      }
    });

    if (bestDisplay) return bestDisplay;

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    return displays.find((display) => (
      display.bounds
      && centerX >= display.bounds.x
      && centerX <= display.bounds.x + display.bounds.width
      && centerY >= display.bounds.y
      && centerY <= display.bounds.y + display.bounds.height
    )) || displays[0] || null;
  }

  _intersectionArea(bounds: any, x: number, y: number, width: number, height: number) {
    const overlapW = Math.min(x + width, bounds.x + bounds.width) - Math.max(x, bounds.x);
    const overlapH = Math.min(y + height, bounds.y + bounds.height) - Math.max(y, bounds.y);
    return Math.max(0, overlapW) * Math.max(0, overlapH);
  }

  _displayIndex(display: any) {
    if (!display) return null;
    const displays = screen.getAllDisplays();
    const index = displays.indexOf(display);
    return index >= 0 ? index : null;
  }

  checkBorder(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const display = this._displayForRect(displays, x, y, width, height);
    if (!display || !display.bounds) return [];

    const bounds = display.bounds;
    const borders: string[] = [];
    const displayIndex = displays.indexOf(display);

    if (Math.abs(y - bounds.y) <= this.tolerance || Math.abs((y + height) - (bounds.y + bounds.height)) <= this.tolerance) {
      borders.push("horizontal");
    }
    if (Math.abs(x - bounds.x) <= this.tolerance || Math.abs((x + width) - (bounds.x + bounds.width)) <= this.tolerance) {
      borders.push("vertical");
    }
    if (this._onTaskbar(x, y, width, height, display, displayIndex)) {
      borders.push("taskbar");
    }

    return borders;
  }

  checkGravity(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const display = this._displayForRect(displays, x, y, width, height);
    if (!display || !display.bounds || !display.workArea) return false;

    const bottom = y + height;
    const workBottom = display.workArea.y + display.workArea.height;
    const displayIndex = displays.indexOf(display);
    if (this._onBottomTaskbar(x, y, width, height, display, displayIndex)) return false;

    if (bottom < workBottom - this.tolerance) return true;

    return displays.some((candidate) => {
      if (candidate === display || !candidate.bounds) return false;
      const horizontallyOverlaps = x + width > candidate.bounds.x && x < candidate.bounds.x + candidate.bounds.width;
      return horizontallyOverlaps && candidate.bounds.y >= display.bounds.y + display.bounds.height - this.tolerance;
    });
  }

  _onTaskbar(x: number, y: number, width: number, height: number, display: any, displayIndex: number | null = null) {
    const taskbar = this._taskbarForDisplay(display, displayIndex);
    if (!taskbar) return false;
    const t = this.tolerance;

    return !(x + width < taskbar.x - t
      || x > taskbar.x + taskbar.width + t
      || y + height < taskbar.y - t
      || y > taskbar.y + taskbar.height + t);
  }

  _onBottomTaskbar(x: number, y: number, width: number, height: number, display: any, displayIndex: number | null = null) {
    const taskbar = this._taskbarForDisplay(display, displayIndex);
    if (!taskbar || !display?.bounds) return false;
    const screenTop = display.bounds.y;
    const taskbarBottom = taskbar.y + taskbar.height;
    const screenBottom = display.bounds.y + display.bounds.height;
    return taskbar.y > screenTop + this.tolerance
      && taskbarBottom >= screenBottom - this.tolerance
      && this._onTaskbar(x, y, width, height, display, displayIndex);
  }

  _taskbarForDisplay(display: any, displayIndex: number | null = null) {
    const displayId = display?.id ?? displayIndex ?? this._displayIndex(display);
    if (displayId === null || displayId === undefined) return null;
    return this.taskbarBoundsByDisplay.get(displayId) || null;
  }

  getRawWorldContext(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const display = this._displayForRect(displays, x, y, width, height);
    if (!display) return null;

    const displayId = display.id ?? displays.indexOf(display);
    const taskbar = this.taskbarBoundsByDisplay.get(displayId) || { x: 0, y: 0, width: 0, height: 0 };

    return {
      screen: { x: display.bounds.x, y: display.bounds.y, w: display.bounds.width, h: display.bounds.height },
      work_area: { x: display.workArea.x, y: display.workArea.y, w: display.workArea.width, h: display.workArea.height },
      taskbar: { x: taskbar.x, y: taskbar.y, w: taskbar.width, h: taskbar.height },
    };
  }
}

export = BorderDetector;
