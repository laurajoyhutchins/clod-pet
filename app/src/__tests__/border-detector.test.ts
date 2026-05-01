import BorderDetector from "../border-detector";

// Mock electron screen
jest.mock("electron", () => ({
  screen: {
    getAllDisplays: jest.fn(),
    getPrimaryDisplay: jest.fn(),
  },
}));

const { screen } = require("electron");

describe("BorderDetector", () => {
  let detector: InstanceType<typeof BorderDetector>;

  beforeEach(() => {
    detector = new BorderDetector();
    jest.clearAllMocks();
  });

  test("should initialize with empty taskbar bounds", () => {
    expect(detector.taskbarBoundsByDisplay.size).toBe(0);
  });

  test("should initialize with custom tolerance", () => {
    const d = new BorderDetector(5);
    expect(d.tolerance).toBe(5);
  });

  test("init should call _detectTaskbar", async () => {
    screen.getAllDisplays.mockReturnValue([]);
    const spy = jest.spyOn(detector, "_detectTaskbar");
    await detector.init();
    expect(spy).toHaveBeenCalled();
  });

  test("getRawWorldContext should refresh taskbar bounds when display work area changes", async () => {
    let displays = [
      {
        id: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ];
    screen.getAllDisplays.mockImplementation(() => displays);

    await detector.init();
    expect(detector.taskbarBoundsByDisplay.size).toBe(0);

    displays = [
      {
        id: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
    ];

    const world = detector.getRawWorldContext(100, 100, 64, 64);
    expect(world?.taskbar).toEqual({
      x: 0,
      y: 1040,
      w: 1920,
      h: 40,
    });
  });

  test("getRawWorldContext should prefer the nearest inset when multiple taskbars exist", async () => {
    screen.getAllDisplays.mockReturnValue([
      {
        id: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 40, y: 30, width: 1880, height: 1050 },
      },
    ]);

    await detector.init();

    const world = detector.getRawWorldContext(20, 100, 64, 64);
    expect(world?.taskbar).toEqual({
      x: 0,
      y: 0,
      w: 40,
      h: 1080,
    });
  });

  test("should detect taskbar on top", async () => {
    screen.getAllDisplays.mockReturnValue([
      {
        workArea: { x: 0, y: 30, width: 1920, height: 1050 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    await detector.init();
    expect(detector.taskbarBoundsByDisplay.get(0)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 30,
    });
  });

  test("should detect taskbar on left", async () => {
    screen.getAllDisplays.mockReturnValue([
      {
        workArea: { x: 50, y: 0, width: 1870, height: 1080 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    await detector.init();
    expect(detector.taskbarBoundsByDisplay.get(0)).toEqual({
      x: 0,
      y: 0,
      width: 50,
      height: 1080,
    });
  });

  test("should detect taskbar on right", async () => {
    screen.getAllDisplays.mockReturnValue([
      {
        workArea: { x: 0, y: 0, width: 1870, height: 1080 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    await detector.init();
    expect(detector.taskbarBoundsByDisplay.get(0)).toEqual({
      x: 1870,
      y: 0,
      width: 50,
      height: 1080,
    });
  });

  test("should detect taskbar on bottom", async () => {
    screen.getAllDisplays.mockReturnValue([
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1050 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    await detector.init();
    expect(detector.taskbarBoundsByDisplay.get(0)).toEqual({
      x: 0,
      y: 1050,
      width: 1920,
      height: 30,
    });
  });

  test("should detect bottom taskbar on offset display", async () => {
    screen.getAllDisplays.mockReturnValue([
      {
        workArea: { x: 1920, y: 100, width: 1920, height: 1040 },
        bounds: { x: 1920, y: 100, width: 1920, height: 1080 },
      },
    ]);

    await detector.init();
    expect(detector.taskbarBoundsByDisplay.get(0)).toEqual({
      x: 1920,
      y: 1140,
      width: 1920,
      height: 40,
    });
  });

  test("should handle display with id property", async () => {
    screen.getAllDisplays.mockReturnValue([
      {
        id: 123,
        workArea: { x: 0, y: 30, width: 1920, height: 1050 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    await detector.init();
    expect(detector.taskbarBoundsByDisplay.has(123)).toBe(true);
  });

  test("should skip taskbar with zero width or height", async () => {
    screen.getAllDisplays.mockReturnValue([
      {
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    await detector.init();
    expect(detector.taskbarBoundsByDisplay.size).toBe(0);
  });

  test("checkBorder should return horizontal for top edge", () => {
    detector.taskbarBoundsByDisplay.set(0, { x: 0, y: 0, width: 1920, height: 30 });

    const result = detector.checkBorder(0, 0, 64, 64);
    expect(result).toContain("horizontal");
  });

  test("checkBorder should return vertical for left edge", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    const result = detector.checkBorder(0, 500, 64, 64);
    expect(result).toContain("vertical");
  });

  test("checkBorder should return empty array when not at border", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    const result = detector.checkBorder(500, 500, 64, 64);
    expect(result).toEqual([]);
  });

  test("checkBorder should detect taskbar", () => {
    detector.taskbarBoundsByDisplay.set(0, { x: 0, y: 1050, width: 1920, height: 30 });

    const result = detector.checkBorder(500, 1050, 64, 64);
    expect(result).toContain("taskbar");
  });

  test("checkBorder should detect taskbar when exactly touching its top", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);
    detector.taskbarBoundsByDisplay.set(0, { x: 0, y: 1050, width: 1920, height: 30 });

    const result = detector.checkBorder(500, 986, 64, 64);
    expect(result).toContain("taskbar");
  });

  test("checkBorder should return empty when no display found", () => {
    screen.getAllDisplays.mockReturnValue([]);

    const result = detector.checkBorder(500, 500, 64, 64);
    expect(result).toEqual([]);
  });

  test("checkBorder should use tolerance", () => {
    detector.taskbarBoundsByDisplay.set(0, { x: 0, y: 0, width: 1920, height: 30 });
    const d = new BorderDetector(10);

    // Within tolerance
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    const result = d.checkBorder(5, 5, 64, 64);
    expect(result).toContain("horizontal");
  });

  test("checkGravity should return true when above work area bottom", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { y: 0, height: 1000 },
      },
    ]);

    expect(detector.checkGravity(0, 500, 64, 64)).toBe(true);
  });

  test("checkGravity should return false when at work area bottom", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { y: 0, height: 1000 },
      },
    ]);

    expect(detector.checkGravity(0, 1000, 64, 64)).toBe(false);
  });

  test("checkGravity should return false when within tolerance of work area bottom", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { y: 0, height: 1000 },
      },
    ]);

    // Default tolerance is 2. y + height = 999.
    // 999 < 1000 - 2 is false. This prevents jitter from small vertical movements.
    expect(detector.checkGravity(0, 999 - 64, 64, 64)).toBe(false);
  });

  test("checkGravity should return false when no display found", () => {
    screen.getAllDisplays.mockReturnValue([]);

    expect(detector.checkGravity(0, 500, 64, 64)).toBe(false);
  });

  test("checkGravity should return false when no workArea", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    expect(detector.checkGravity(0, 500, 64, 64)).toBe(false);
  });

  test("checkGravity should return true when there is another display below", () => {
    const displays = [
      {
        id: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
      {
        id: 1,
        bounds: { x: 0, y: 1080, width: 1920, height: 1080 },
        workArea: { x: 0, y: 1080, width: 1920, height: 1080 },
      },
    ];
    screen.getAllDisplays.mockReturnValue(displays);

    // Pet is at the bottom of the first display
    // y + height = 1080.
    // centerY = 1080 - 32 = 1048. 
    // centerX = 500.
    // _displayForRect will find display 0 because centerY (1048) is within [0, 1080].
    // Current checkGravity would return false because 1080 < 1080 is false.
    // But it SHOULD return true because there is display 1 below it.
    expect(detector.checkGravity(500, 1080 - 64, 64, 64)).toBe(true);
  });

  test("checkGravity should not fall through taskbar to another display", () => {
    const displays = [
      {
        id: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
      {
        id: 1,
        bounds: { x: 0, y: 1080, width: 1920, height: 1080 },
        workArea: { x: 0, y: 1080, width: 1920, height: 1080 },
      },
    ];
    screen.getAllDisplays.mockReturnValue(displays);
    detector.taskbarBoundsByDisplay.set(0, { x: 0, y: 1040, width: 1920, height: 40 });

    expect(detector.checkGravity(500, 1040 - 64, 64, 64)).toBe(false);
  });

  test("checkGravity should still fall when touching a side taskbar", () => {
    const displays = [
      {
        id: 0,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 40, y: 0, width: 1880, height: 1080 },
      },
    ];
    screen.getAllDisplays.mockReturnValue(displays);
    detector.taskbarBoundsByDisplay.set(0, { x: 0, y: 0, width: 40, height: 1080 });

    expect(detector.checkGravity(30, 500, 64, 64)).toBe(true);
  });

  test("_displayForRect should use largest overlap instead of only center point", () => {
    const displays = [
      {
        id: 0,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
      },
      {
        id: 1,
        bounds: { x: 100, y: 0, width: 100, height: 100 },
      },
    ];

    expect(detector._displayForRect(displays, 80, 10, 30, 30)).toBe(displays[0]);
  });

  test("_onTaskbar should return false when no taskbar bounds", () => {
    const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
    expect(detector._onTaskbar(0, 0, 64, 64, display)).toBe(false);
  });

  test("_displayIndex should return null for null display", () => {
    expect(detector._displayIndex(null)).toBeNull();
  });

  test("_displayIndex should return null when display not found", () => {
    screen.getAllDisplays.mockReturnValue([]);
    const display = { bounds: { x: 0, y: 0, width: 100, height: 100 } };
    expect(detector._displayIndex(display)).toBeNull();
  });
});
