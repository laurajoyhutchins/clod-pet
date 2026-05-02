import {
  BORDER_TOLERANCE,
  checkBorder,
  checkGravity,
  desktopBounds,
  displayForRect,
  getRawWorldContext,
  intersectionArea,
  nearestDisplay,
  rectDistance,
} from "../border-detector";

jest.mock("electron", () => ({
  screen: {
    getAllDisplays: jest.fn(),
    getPrimaryDisplay: jest.fn(),
  },
}));

describe("border-detector utilities", () => {
  test("intersectionArea should compute overlap", () => {
    expect(intersectionArea({ x: 0, y: 0, width: 10, height: 10 }, 5, 5, 10, 10)).toBe(25);
  });

  test("rectDistance should compute manhattan gap", () => {
    expect(rectDistance({ x: 0, y: 0, width: 10, height: 10 }, 20, 30, 5, 5)).toBe(30);
  });

  test("displayForRect should use the display with the largest overlap", () => {
    const displays = [
      { bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { bounds: { x: 100, y: 0, width: 100, height: 100 } },
    ];

    expect(displayForRect(displays, 80, 10, 30, 30)).toBe(displays[0]);
  });

  test("displayForRect should fall back to the nearest display when there is no overlap", () => {
    const displays = [
      { bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { bounds: { x: 200, y: 0, width: 100, height: 100 } },
    ];

    expect(displayForRect(displays, 120, 10, 20, 20)).toBe(displays[0]);
  });

  test("nearestDisplay should return the closest bounds when there is no overlap", () => {
    const displays = [
      { bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { bounds: { x: 300, y: 0, width: 100, height: 100 } },
    ];

    expect(nearestDisplay(displays, 120, 10, 20, 20)).toBe(displays[0]);
  });

  test("desktopBounds should union every display", () => {
    const bounds = desktopBounds([
      { bounds: { x: -100, y: 10, width: 50, height: 50 } },
      { bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { bounds: { x: 125, y: 25, width: 25, height: 25 } },
    ]);

    expect(bounds).toEqual({ x: -100, y: 0, w: 250, h: 100 });
  });

  test("checkBorder should report ceiling, floor, and walls edges independently", () => {
    const displays = [
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1000 },
      },
    ];

    expect(checkBorder(0, 0, 64, 64, displays)).toEqual(expect.arrayContaining(["ceiling", "walls"]));
    expect(checkBorder(0, 936, 64, 64, displays)).toEqual(expect.arrayContaining(["floor", "walls"]));
    expect(checkBorder(1856, 0, 64, 64, displays)).toEqual(expect.arrayContaining(["ceiling", "walls"]));
  });

  test("checkBorder should return an empty array away from edges", () => {
    const displays = [
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ];

    expect(checkBorder(500, 500, 64, 64, displays)).toEqual([]);
  });

  test("checkGravity should return true when the pet is above the work area floor", () => {
    const displays = [
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1000 },
      },
    ];

    expect(checkGravity(500, 500, 64, 64, displays)).toBe(true);
  });

  test("checkGravity should return false when the pet is at or below the work area floor", () => {
    const displays = [
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1000 },
      },
    ];

    expect(checkGravity(500, 936, 64, 64, displays)).toBe(false);
    expect(checkGravity(500, 1000, 64, 64, displays)).toBe(false);
  });

  test("getRawWorldContext should return null when no displays are available", () => {
    expect(getRawWorldContext(100, 100, 64, 64, [])).toBeNull();
  });

  test("getRawWorldContext should return the selected display and desktop union", () => {
    const displays = [
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
    ];

    expect(getRawWorldContext(10, 10, 20, 20, displays)).toEqual({
      screen: { x: 0, y: 0, w: 100, h: 100 },
      work_area: { x: 0, y: 0, w: 100, h: 90 },
      desktop: { x: 0, y: 0, w: 200, h: 100 },
    });
  });

  test("exports the expected tolerance constant", () => {
    expect(BORDER_TOLERANCE).toBe(2);
  });
});
