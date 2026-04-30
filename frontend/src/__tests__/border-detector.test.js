const BorderDetector = require("../border-detector");

// Mock electron screen
jest.mock("electron", () => ({
  screen: {
    getAllDisplays: jest.fn(),
    getPrimaryDisplay: jest.fn(),
  },
}));

const { screen } = require("electron");

describe("BorderDetector", () => {
  let detector;

  beforeEach(() => {
    detector = new BorderDetector();
    jest.clearAllMocks();
  });

  test("should initialize with empty taskbar bounds", () => {
    expect(detector.taskbarBoundsByDisplay.size).toBe(0);
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

  test("checkBorder should return horizontal for top edge", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        workArea: { x: 0, y: 30, width: 1920, height: 1050 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);
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
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);
    detector.taskbarBoundsByDisplay.set(0, { x: 0, y: 1050, width: 1920, height: 30 });

    const result = detector.checkBorder(500, 1050, 64, 64);
    expect(result).toContain("taskbar");
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
});
