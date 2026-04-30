const { BrowserWindow } = require("electron");

// Mock electron BrowserWindow
jest.mock("electron", () => ({
  BrowserWindow: jest.fn().mockImplementation((opts) => ({
    loadFile: jest.fn(),
    setPosition: jest.fn(),
    setSize: jest.fn(),
    destroy: jest.fn(),
    isDestroyed: jest.fn(() => false),
    ...opts,
  })),
}));

const WindowManager = require("../window-manager");

describe("WindowManager", () => {
  let manager;

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

  test("should update position", () => {
    const win = manager.createPetWindow("pet1");
    manager.updatePosition("pet1", 300, 400);
    
    expect(win.setPosition).toHaveBeenCalledWith(300, 400);
  });

  test("should update size", () => {
    const win = manager.createPetWindow("pet1");
    manager.updateSize("pet1", 200, 300);
    
    expect(win.setSize).toHaveBeenCalledWith(200, 300);
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
