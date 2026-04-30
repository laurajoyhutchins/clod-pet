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

  getRawWorldContext(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const display = this._displayForRect(displays, x, y, width, height);
    if (!display) return null;

    const displayId = display.id ?? this._displayIndex(display);
    const taskbar = this.taskbarBoundsByDisplay.get(displayId) || { x: 0, y: 0, width: 0, height: 0 };

    return {
      screen: { x: display.bounds.x, y: display.bounds.y, w: display.bounds.width, h: display.bounds.height },
      work_area: { x: display.workArea.x, y: display.workArea.y, w: display.workArea.width, h: display.workArea.height },
      taskbar: { x: taskbar.x, y: taskbar.y, w: taskbar.width, h: taskbar.height },
    };
  }
}

export = BorderDetector;
