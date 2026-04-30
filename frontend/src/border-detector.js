const { screen } = require("electron");

class BorderDetector {
  constructor() {
    this.taskbarBounds = null;
  }

  async init() {
    this._detectTaskbar();
  }

  _detectTaskbar() {
    const displays = screen.getAllDisplays();
    for (const display of displays) {
      const workArea = display.workArea;
      const bounds = display.bounds;

      if (workArea.y > bounds.y) {
        this.taskbarBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: workArea.y - bounds.y };
      } else if (workArea.x > bounds.x) {
        this.taskbarBounds = { x: bounds.x, y: workArea.y, width: bounds.width - workArea.x, height: workArea.height };
      } else if (workArea.width < bounds.width) {
        this.taskbarBounds = { x: workArea.x + workArea.width, y: workArea.y, width: bounds.width - workArea.width, height: workArea.height };
      } else {
        this.taskbarBounds = { x: bounds.x, y: bounds.y + bounds.height - (bounds.height - workArea.height), width: bounds.width, height: bounds.height - workArea.height };
      }
    }
  }

  checkBorder(x, y, width, height) {
    const displays = screen.getAllDisplays();
    const results = [];

    for (const display of displays) {
      const wa = display.workArea;
      const b = display.bounds;

      const onTop = y <= b.y + 2;
      const onBottom = y + height >= b.y + b.height - 2;
      const onLeft = x <= b.x + 2;
      const onRight = x + width >= b.x + b.width - 2;
      const onTaskbar = this._onTaskbar(x, y, width, height);

      if (onTop || onBottom) results.push("horizontal");
      if (onLeft || onRight) results.push("vertical");
      if (onTaskbar) results.push("taskbar");
    }

    return results;
  }

  checkGravity(x, y, width, height) {
    const displays = screen.getAllDisplays();
    for (const display of displays) {
      const wa = display.workArea;
      if (y + height < wa.y + wa.height - 2) {
        return true;
      }
    }
    return false;
  }

  _onTaskbar(x, y, width, height) {
    if (!this.taskbarBounds) return false;
    const tb = this.taskbarBounds;
    return !(x + width < tb.x || x > tb.x + tb.width || y + height < tb.y || y > tb.y + tb.height);
  }
}

module.exports = BorderDetector;
