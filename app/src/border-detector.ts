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

  _taskbarCandidatesForDisplay(display: any) {
    if (!display || !display.bounds || !display.workArea) return [];

    const workArea = display.workArea;
    const bounds = display.bounds;
    const topInset = workArea.y - bounds.y;
    const leftInset = workArea.x - bounds.x;
    const rightInset = (bounds.x + bounds.width) - (workArea.x + workArea.width);
    const bottomInset = (bounds.y + bounds.height) - (workArea.y + workArea.height);

    const candidates: any[] = [];
    if (topInset > 0) {
      candidates.push({ edge: "top", x: bounds.x, y: bounds.y, width: bounds.width, height: topInset });
    }
    if (leftInset > 0) {
      candidates.push({ edge: "left", x: bounds.x, y: bounds.y, width: leftInset, height: bounds.height });
    }
    if (rightInset > 0) {
      candidates.push({ edge: "right", x: workArea.x + workArea.width, y: bounds.y, width: rightInset, height: bounds.height });
    }
    if (bottomInset > 0) {
      candidates.push({ edge: "bottom", x: bounds.x, y: workArea.y + workArea.height, width: bounds.width, height: bottomInset });
    }

    return candidates;
  }

  _pickTaskbarCandidate(candidates: any[], x?: number, y?: number, width?: number, height?: number) {
    if (!candidates.length) return null;

    if ([x, y, width, height].some((value) => typeof value !== "number")) {
      return candidates.reduce((largest, current) => (
        current.width * current.height > largest.width * largest.height ? current : largest
      ), candidates[0]);
    }

    let best = candidates[0];
    let bestOverlap = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    candidates.forEach((candidate) => {
      const overlap = this._intersectionArea(candidate, x as number, y as number, width as number, height as number);
      if (overlap > 0) {
        if (overlap > bestOverlap || (overlap === bestOverlap && candidate.width * candidate.height > best.width * best.height)) {
          best = candidate;
          bestOverlap = overlap;
          bestDistance = 0;
        }
        return;
      }

      if (bestOverlap > 0) return;

      const distance = this._rectDistance(candidate, x as number, y as number, width as number, height as number);
      if (distance < bestDistance || (distance === bestDistance && candidate.width * candidate.height > best.width * best.height)) {
        best = candidate;
        bestDistance = distance;
      }
    });

    return best;
  }

  _taskbarBoundsForDisplay(display: any) {
    const taskbar = this._pickTaskbarCandidate(this._taskbarCandidatesForDisplay(display));
    if (!taskbar) return null;

    return {
      x: taskbar.x,
      y: taskbar.y,
      width: taskbar.width,
      height: taskbar.height,
    };
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

  _rectDistance(bounds: any, x: number, y: number, width: number, height: number) {
    const dx = Math.max(bounds.x - (x + width), x - (bounds.x + bounds.width), 0);
    const dy = Math.max(bounds.y - (y + height), y - (bounds.y + bounds.height), 0);
    return dx + dy;
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
    const taskbar = this._taskbarForRect(display, displayIndex, x, y, width, height);

    if (Math.abs(y - bounds.y) <= this.tolerance || Math.abs((y + height) - (bounds.y + bounds.height)) <= this.tolerance) {
      borders.push("horizontal");
    }
    if (Math.abs(x - bounds.x) <= this.tolerance || Math.abs((x + width) - (bounds.x + bounds.width)) <= this.tolerance) {
      borders.push("vertical");
    }
    if (this._onTaskbar(x, y, width, height, display, displayIndex, taskbar)) {
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
    const taskbar = this._taskbarForRect(display, displayIndex, x, y, width, height);
    if (this._onBottomTaskbar(x, y, width, height, display, displayIndex, taskbar)) return false;

    if (bottom < workBottom - this.tolerance) return true;

    return displays.some((candidate) => {
      if (candidate === display || !candidate.bounds) return false;
      const horizontallyOverlaps = x + width > candidate.bounds.x && x < candidate.bounds.x + candidate.bounds.width;
      return horizontallyOverlaps && candidate.bounds.y >= display.bounds.y + display.bounds.height - this.tolerance;
    });
  }

  _onTaskbar(x: number, y: number, width: number, height: number, display: any, displayIndex: number | null = null, taskbar: any = null) {
    taskbar = taskbar || this._taskbarForRect(display, displayIndex, x, y, width, height);
    if (!taskbar) return false;
    const t = this.tolerance;

    return !(x + width < taskbar.x - t
      || x > taskbar.x + taskbar.width + t
      || y + height < taskbar.y - t
      || y > taskbar.y + taskbar.height + t);
  }

  _onBottomTaskbar(x: number, y: number, width: number, height: number, display: any, displayIndex: number | null = null, taskbar: any = null) {
    taskbar = taskbar || this._taskbarForRect(display, displayIndex, x, y, width, height);
    if (!taskbar || !display?.bounds) return false;
    const screenTop = display.bounds.y;
    const taskbarBottom = taskbar.y + taskbar.height;
    const screenBottom = display.bounds.y + display.bounds.height;
    return taskbar.y > screenTop + this.tolerance
      && taskbarBottom >= screenBottom - this.tolerance
      && this._onTaskbar(x, y, width, height, display, displayIndex, taskbar);
  }

  _taskbarForDisplay(display: any, displayIndex: number | null = null) {
    const displayId = display?.id ?? displayIndex ?? this._displayIndex(display);
    if (displayId === null || displayId === undefined) return null;

    const candidates = this._taskbarCandidatesForDisplay(display);
    if (candidates.length > 0) {
      return this._pickTaskbarCandidate(candidates);
    }

    return this.taskbarBoundsByDisplay.get(displayId) || null;
  }

  _taskbarForRect(display: any, displayIndex: number | null = null, x?: number, y?: number, width?: number, height?: number) {
    const displayId = display?.id ?? displayIndex ?? this._displayIndex(display);
    if (displayId === null || displayId === undefined) return null;
    const candidates = this._taskbarCandidatesForDisplay(display);
    if (candidates.length > 0) {
      return this._pickTaskbarCandidate(candidates, x, y, width, height);
    }
    return this.taskbarBoundsByDisplay.get(displayId) || null;
  }

  getRawWorldContext(x: number, y: number, width: number, height: number) {
    this._detectTaskbar();

    const displays = screen.getAllDisplays();
    const display = this._displayForRect(displays, x, y, width, height);
    if (!display) return null;

    const taskbar = this._taskbarForRect(display, displays.indexOf(display), x, y, width, height) || { x: 0, y: 0, width: 0, height: 0 };

    return {
      screen: { x: display.bounds.x, y: display.bounds.y, w: display.bounds.width, h: display.bounds.height },
      work_area: { x: display.workArea.x, y: display.workArea.y, w: display.workArea.width, h: display.workArea.height },
      taskbar: { x: taskbar.x, y: taskbar.y, w: taskbar.width, h: taskbar.height },
    };
  }
}

export = BorderDetector;
