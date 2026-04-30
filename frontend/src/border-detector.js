"use strict";
const electron_1 = require("electron");
class BorderDetector {
    constructor(tolerance = 2) {
        this.taskbarBoundsByDisplay = new Map();
        this.tolerance = tolerance;
    }
    async init() {
        this._detectTaskbar();
    }
    _detectTaskbar() {
        const displays = electron_1.screen.getAllDisplays();
        this.taskbarBoundsByDisplay.clear();
        displays.forEach((display, index) => {
            const workArea = display.workArea;
            const bounds = display.bounds;
            let taskbarBounds = null;
            if (workArea.y > bounds.y) {
                taskbarBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: workArea.y - bounds.y };
            }
            else if (workArea.x > bounds.x) {
                taskbarBounds = { x: bounds.x, y: workArea.y, width: workArea.x - bounds.x, height: workArea.height };
            }
            else if (workArea.width < bounds.width) {
                taskbarBounds = { x: workArea.x + workArea.width, y: workArea.y, width: bounds.width - workArea.width, height: workArea.height };
            }
            else {
                taskbarBounds = { x: bounds.x, y: bounds.y + workArea.height, width: bounds.width, height: bounds.height - workArea.height };
            }
            if (taskbarBounds && taskbarBounds.width > 0 && taskbarBounds.height > 0) {
                const displayId = display.id ?? index;
                this.taskbarBoundsByDisplay.set(displayId, taskbarBounds);
            }
        });
    }
    checkBorder(x, y, width, height) {
        const displays = electron_1.screen.getAllDisplays();
        const results = [];
        const display = this._displayForRect(displays, x, y, width, height);
        if (!display)
            return results;
        const b = display.bounds;
        const tolerance = this.tolerance;
        const onTop = y <= b.y + tolerance;
        const onBottom = y + height >= b.y + b.height - tolerance;
        const onLeft = x <= b.x + tolerance;
        const onRight = x + width >= b.x + b.width - tolerance;
        const onTaskbar = this._onTaskbar(x, y, width, height, display);
        if (onTop || onBottom)
            results.push("horizontal");
        if (onLeft || onRight)
            results.push("vertical");
        if (onTaskbar)
            results.push("taskbar");
        return results;
    }
    checkGravity(x, y, width, height) {
        const displays = electron_1.screen.getAllDisplays();
        const display = this._displayForRect(displays, x, y, width, height);
        if (!display || !display.workArea)
            return false;
        const wa = display.workArea;
        return y + height < wa.y + wa.height;
    }
    _onTaskbar(x, y, width, height, display) {
        const displayId = display?.id ?? this._displayIndex(display);
        const tb = displayId !== null ? this.taskbarBoundsByDisplay.get(displayId) : null;
        if (!tb)
            return false;
        return !(x + width < tb.x || x > tb.x + tb.width || y + height < tb.y || y > tb.y + tb.height);
    }
    _displayForRect(displays, x, y, width, height) {
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        return displays.find((display) => (display.bounds
            && centerX >= display.bounds.x
            && centerX <= display.bounds.x + display.bounds.width
            && centerY >= display.bounds.y
            && centerY <= display.bounds.y + display.bounds.height)) || displays[0] || null;
    }
    _displayIndex(display) {
        if (!display)
            return null;
        const displays = electron_1.screen.getAllDisplays();
        const index = displays.indexOf(display);
        return index >= 0 ? index : null;
    }
}
module.exports = BorderDetector;
