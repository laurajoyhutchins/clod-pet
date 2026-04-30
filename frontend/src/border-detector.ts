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
      const workArea = display.workArea;
      const bounds = display.bounds;
      let taskbarBounds = null;

      if (workArea.y > bounds.y) {
        taskbarBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: workArea.y - bounds.y };
      } else if (workArea.x > bounds.x) {
        taskbarBounds = { x: bounds.x, y: workArea.y, width: workArea.x - bounds.x, height: workArea.height };
      } else if (workArea.width < bounds.width) {
        taskbarBounds = { x: workArea.x + workArea.width, y: workArea.y, width: bounds.width - workArea.width, height: workArea.height };
      } else {
        taskbarBounds = { x: bounds.x, y: bounds.y + workArea.height, width: bounds.width, height: bounds.height - workArea.height };
      }

      if (taskbarBounds && taskbarBounds.width > 0 && taskbarBounds.height > 0) {
        const displayId = display.id ?? index;
        this.taskbarBoundsByDisplay.set(displayId, taskbarBounds);
      }
    });
  }

  checkBorder(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const results = [];
    const display = this._displayForRect(displays, x, y, width, height);
    if (!display) return results;

    const b = display.bounds;
    const tolerance = this.tolerance;

    const onTop = y <= b.y + tolerance;
    const onBottom = y + height >= b.y + b.height - tolerance;
    const onLeft = x <= b.x + tolerance;
    const onRight = x + width >= b.x + b.width - tolerance;
    const onTaskbar = this._onTaskbar(x, y, width, height, display);

    if (onTop || onBottom) results.push("horizontal");
    if (onLeft || onRight) results.push("vertical");
    if (onTaskbar) results.push("taskbar");

    return results;
  }

  checkGravity(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const centerX = x + width / 2;
    const bottom = y + height;
    
    // Find all displays that overlap horizontally with the pet's center
    const overlappingDisplays = displays.filter(d => 
      centerX >= d.bounds.x && centerX <= d.bounds.x + d.bounds.width
    );

    if (overlappingDisplays.length === 0) return false;

    // Find the current display based on the pet's center
    const centerY = y + height / 2;
    const currentDisplay = overlappingDisplays.find(d => 
      centerY >= d.bounds.y && centerY <= d.bounds.y + d.bounds.height
    ) || overlappingDisplays[0];

    const wa = currentDisplay.workArea;
    if (!wa) return false;

    // 1. If we are above the work area bottom of the current display, we fall.
    if (bottom < wa.y + wa.height - this.tolerance) {
      return true;
    }

    // 2. If we are touching the taskbar of the current display, we don't fall.
    if (this._onTaskbar(x, y, width, height, currentDisplay)) {
      return false;
    }

    // 3. If there's another display below this one at the current X, we keep falling.
    const hasDisplayBelow = overlappingDisplays.some(d => d.bounds.y > currentDisplay.bounds.y);
    return hasDisplayBelow;
  }

  _onTaskbar(x: number, y: number, width: number, height: number, display?: any) {
    const displayId = display?.id ?? this._displayIndex(display);
    const tb = displayId !== null ? this.taskbarBoundsByDisplay.get(displayId) : null;
    if (!tb) return false;
    const t = this.tolerance;
    return !(x + width < tb.x - t || x > tb.x + tb.width + t || y + height < tb.y - t || y > tb.y + tb.height + t);
  }

  _displayForRect(displays: any[], x: number, y: number, width: number, height: number) {
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

  _displayIndex(display: any) {
    if (!display) return null;
    const displays = screen.getAllDisplays();
    const index = displays.indexOf(display);
    return index >= 0 ? index : null;
  }
}

export = BorderDetector;
