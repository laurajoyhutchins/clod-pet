import BorderDetector from "../border-detector";

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

  test("init should be a no-op", async () => {
    await expect(detector.init()).resolves.toBeUndefined();
  });

  test("getRawWorldContext should return null when no displays are available", () => {
    screen.getAllDisplays.mockReturnValue([]);

    expect(detector.getRawWorldContext(100, 100, 64, 64)).toBeNull();
  });

  test("getRawWorldContext should return the selected display and desktop union", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        id: 0,
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        workArea: { x: 0, y: 0, width: 100, height: 90 },
      },
      {
        id: 1,
        bounds: { x: 100, y: 0, width: 100, height: 100 },
        workArea: { x: 100, y: 0, width: 100, height: 100 },
      },
    ]);

    const world = detector.getRawWorldContext(10, 10, 20, 20);
    expect(world).toEqual({
      screen: { x: 0, y: 0, w: 100, h: 100 },
      work_area: { x: 0, y: 0, w: 100, h: 90 },
      desktop: { x: 0, y: 0, w: 200, h: 100 },
    });
  });

  test("_displayForRect should use the display with the largest overlap", () => {
    const displays = [
      { bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { bounds: { x: 100, y: 0, width: 100, height: 100 } },
    ];

    expect(detector._displayForRect(displays, 80, 10, 30, 30)).toBe(displays[0]);
  });

  test("_displayForRect should fall back to the nearest display when there is no overlap", () => {
    const displays = [
      { bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { bounds: { x: 200, y: 0, width: 100, height: 100 } },
    ];

    expect(detector._displayForRect(displays, 120, 10, 20, 20)).toBe(displays[0]);
  });

  test("checkBorder should report ceiling, floor, and walls edges independently", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1000 },
      },
    ]);

    expect(detector.checkBorder(0, 0, 64, 64)).toEqual(expect.arrayContaining(["ceiling", "walls"]));
    expect(detector.checkBorder(0, 936, 64, 64)).toEqual(expect.arrayContaining(["floor", "walls"]));
    expect(detector.checkBorder(1856, 0, 64, 64)).toEqual(expect.arrayContaining(["ceiling", "walls"]));
  });

  test("checkBorder should return an empty array away from edges", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]);

    expect(detector.checkBorder(500, 500, 64, 64)).toEqual([]);
  });

  test("checkGravity should return true when the pet is above the work area floor", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1000 },
      },
    ]);

    expect(detector.checkGravity(500, 500, 64, 64)).toBe(true);
  });

  test("checkGravity should return false when the pet is at or below the work area floor", () => {
    screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1000 },
      },
    ]);

    expect(detector.checkGravity(500, 936, 64, 64)).toBe(false);
    expect(detector.checkGravity(500, 1000, 64, 64)).toBe(false);
  });

  test("_desktopBounds should union every display", () => {
    const bounds = detector._desktopBounds([
      { bounds: { x: -100, y: 10, width: 50, height: 50 } },
      { bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { bounds: { x: 125, y: 25, width: 25, height: 25 } },
    ]);

    expect(bounds).toEqual({ x: -100, y: 0, w: 250, h: 100 });
  });
});
