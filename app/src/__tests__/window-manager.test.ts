import { BrowserWindow } from "electron";

// Mock electron BrowserWindow
jest.mock("electron", () => ({
  BrowserWindow: jest.fn().mockImplementation((opts) => ({
    loadFile: jest.fn(),
    show: jest.fn(),
    showInactive: jest.fn(),
    setPosition: jest.fn(),
    setSize: jest.fn(),
    destroy: jest.fn(),
    isDestroyed: jest.fn(() => false),
    getBounds: jest.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
    ...opts,
  })),
}));

import WindowManager from "../window-manager";

describe("WindowManager", () => {
  let manager: InstanceType<typeof WindowManager>;

  beforeEach(() => {
    manager = new WindowManager();
    jest.clearAllMocks();
  });

  test("should initialize with empty windows map", () => {
    expect(manager.windows.size).toBe(0);
  });

  test("should create pet window with default options", () => {
    const win = manager.createPetWindow("pet1");

    expect(win).toBeDefined();
    expect(manager.windows.has("pet1")).toBe(true);
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        show: false,
        skipTaskbar: true,
        hasShadow: false,
      })
    );
  });

  test("should create pet window with custom options", () => {
    manager.createPetWindow("pet2", { x: 100, y: 200, width: 128, height: 128 });

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 100,
        y: 200,
        width: 128,
        height: 128,
      })
    );
  });

  test("should destroy existing window when creating duplicate pet id", () => {
    const win1 = manager.createPetWindow("pet1") as any;
    expect(manager.windows.has("pet1")).toBe(true);

    manager.createPetWindow("pet1");

    expect(win1.destroy).toHaveBeenCalled();
    expect(manager.windows.get("pet1")!.win).not.toBe(win1);
  });

  test("should get pet window by id", () => {
    const win = manager.createPetWindow("pet1");
    const retrieved = manager.getPetWindow("pet1");

    expect(retrieved).toBe(win);
  });

  test("should return null for non-existent pet", () => {
    const result = manager.getPetWindow("nonexistent");
    expect(result).toBeNull();
  });

  test("should remove pet window", () => {
    const win = manager.createPetWindow("pet1");
    expect(manager.windows.has("pet1")).toBe(true);

    manager.removePetWindow("pet1");

    expect(manager.windows.has("pet1")).toBe(false);
    expect(win.destroy).toHaveBeenCalled();
  });

  test("should not throw when removing non-existent pet", () => {
    expect(() => manager.removePetWindow("nonexistent")).not.toThrow();
  });

  test("should not destroy already destroyed window on remove", () => {
    const win = manager.createPetWindow("pet1") as any;
    win.isDestroyed.mockReturnValue(true);

    manager.removePetWindow("pet1");

    expect(win.destroy).not.toHaveBeenCalled();
    expect(manager.windows.has("pet1")).toBe(false);
  });

  test("should update position", () => {
    const win = manager.createPetWindow("pet1");
    manager.updatePosition("pet1", 300, 400);

    expect(win.setPosition).toHaveBeenCalledWith(300, 400);
  });

  test("should not update position for destroyed window", () => {
    const win = manager.createPetWindow("pet1") as any;
    win.isDestroyed.mockReturnValue(true);

    manager.updatePosition("pet1", 300, 400);

    expect(win.setPosition).not.toHaveBeenCalled();
  });

  test("should update size", () => {
    const win = manager.createPetWindow("pet1");
    manager.updateSize("pet1", 200, 300);

    expect(win.setSize).toHaveBeenCalledWith(200, 300);
  });

  test("should not update size for destroyed window", () => {
    const win = manager.createPetWindow("pet1") as any;
    win.isDestroyed.mockReturnValue(true);

    manager.updateSize("pet1", 200, 300);

    expect(win.setSize).not.toHaveBeenCalled();
  });

  test("should return all windows", () => {
    const win1 = manager.createPetWindow("pet1");
    const win2 = manager.createPetWindow("pet2");

    const all = manager.getAllWindows();

    expect(all).toHaveLength(2);
    expect(all[0]).toEqual({ id: "pet1", win: win1 });
    expect(all[1]).toEqual({ id: "pet2", win: win2 });
  });
});
