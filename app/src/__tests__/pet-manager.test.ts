// Mock electron modules
jest.mock("electron", () => ({
  BrowserWindow: Object.assign(jest.fn().mockImplementation((opts) => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    show: jest.fn(),
    showInactive: jest.fn(),
    once: jest.fn((event, cb) => {
      if (event === "ready-to-show") cb();
    }),
    on: jest.fn((event, cb) => {
      if (event === "closed") cb();
    }),
    webContents: {
      on: jest.fn((event, cb) => {
        if (event === "did-finish-load") cb();
      }),
      once: jest.fn((event, cb) => {
        if (event === "did-finish-load") cb();
      }),
      send: jest.fn(),
      getPosition: jest.fn(() => [100, 200]),
      getSize: jest.fn(() => [64, 64]),
    },
    setPosition: jest.fn(),
    getPosition: jest.fn(() => [100, 200]),
    getBounds: jest.fn(() => ({ x: 100, y: 200, width: 64, height: 64 })),
    getSize: jest.fn(() => [64, 64]),
    isDestroyed: jest.fn(() => false),
  })), {
    fromWebContents: jest.fn(),
  }),
  screen: {
    getPrimaryDisplay: jest.fn(() => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getAllDisplays: jest.fn(() => [{
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    }]),
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
  },
}));

jest.mock("../api-adapter", () => {
  return jest.fn().mockImplementation((baseUrl) => ({
    baseUrl,
    loadPet: jest.fn(),
    addPet: jest.fn(),
    removePet: jest.fn(),
    stepPet: jest.fn(),
    dragPet: jest.fn(),
    dropPet: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({ Scale: 1.0, Volume: 0.3 }),
  }));
});

jest.mock("../window-manager", () => {
  return jest.fn().mockImplementation(() => ({
    createPetWindow: jest.fn(),
    getPetWindow: jest.fn(),
    removePetWindow: jest.fn(),
    updatePosition: jest.fn(),
    updateSize: jest.fn(),
    getAllWindows: jest.fn(() => []),
    windows: new Map(),
  }));
});

jest.mock("../border-detector", () => {
  return jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    checkBorder: jest.fn(() => []),
    checkGravity: jest.fn(() => false),
    getRawWorldContext: jest.fn(() => ({
      screen: { x: 0, y: 0, w: 1920, h: 1080 },
      work_area: { x: 0, y: 0, w: 1920, h: 1080 },
      taskbar: { x: 0, y: 1040, w: 1920, h: 40 },
    })),
    _displayForRect: jest.fn((displays, x, y) => displays[0]),
    taskbarBoundsByDisplay: new Map(),
    tolerance: 2,
  }));
});

import PetManager from "../pet-manager";
import { BrowserWindow, ipcMain, screen } from "electron";

describe("PetManager", () => {
  let manager: InstanceType<typeof PetManager>;
  let mockBackendClient: { loadPet: jest.Mock; addPet: jest.Mock; removePet: jest.Mock; stepPet: jest.Mock; dragPet: jest.Mock; dropPet: jest.Mock; setPosition: jest.Mock; getSettings: jest.Mock };
  let mockWindowManager: { createPetWindow: jest.Mock; getPetWindow: jest.Mock; removePetWindow: jest.Mock; updatePosition: jest.Mock; updateSize: jest.Mock; getAllWindows: jest.Mock; windows: Map<string, any> };
  let mockBorderDetector: { init: jest.Mock; checkBorder: jest.Mock; checkGravity: jest.Mock; _displayForRect: jest.Mock; taskbarBoundsByDisplay: Map<number, any>; tolerance: number };

  beforeEach(() => {
    jest.useFakeTimers();
    manager = new PetManager("http://localhost:8080");
    mockBackendClient = manager.backendClient as any;
    mockWindowManager = manager.windowManager as any;
    mockBorderDetector = manager.borderDetector as any;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should initialize with backend URL", () => {
    expect(manager.backendClient.baseUrl).toBe("http://localhost:8080");
  });

  test("should initialize modules on init", async () => {
    await manager.init();
    expect(mockBorderDetector.init).toHaveBeenCalled();
    expect(ipcMain.handle).toHaveBeenCalledWith("get-pet-init", expect.any(Function));
  });

  test("init should not register IPC handlers twice", async () => {
    await manager.init();
    const initialCallCount = (ipcMain.on as jest.Mock).mock.calls.length;
    await manager.init();
    expect((ipcMain.on as jest.Mock).mock.calls.length).toBe(initialCallCount);
  });

  test("get-pet-init handler should return pet data", async () => {
    await manager.init();
    const handler = (ipcMain.handle as jest.Mock).mock.calls.find(call => call[0] === "get-pet-init")[1];
    
    manager.pets.set("pet_1", {
      backendPetId: "pet_1",
      petData: { png_base64: "abc", tiles_x: 1, tiles_y: 1 }
    });
    
    const result = await handler(null, "pet_1");
    expect(result).toEqual({
      petId: "pet_1",
      pngBase64: "data:image/png;base64,abc",
      tilesX: 1,
      tilesY: 1,
      scale: 1,
      volume: 0.3
    });

    const resultNull = await handler(null, "nonexistent");
    expect(resultNull).toBeNull();
  });

  test("should load and create pet", async () => {
    mockBackendClient.loadPet.mockResolvedValue({
      png_base64: "abc123",
      tiles_x: 4,
      tiles_y: 1,
    });
    mockBackendClient.addPet.mockResolvedValue({ pet_id: "pet_1", x: 321, y: 654, flip_h: false });
    
    const mockWin = {
      loadFile: jest.fn().mockResolvedValue(undefined),
      show: jest.fn(),
      showInactive: jest.fn(),
      once: jest.fn(),
      on: jest.fn(),
      webContents: {
        on: jest.fn(),
        send: jest.fn(),
      },
      setPosition: jest.fn(),
      getBounds: jest.fn(() => ({ x: 100, y: 200, width: 64, height: 64 })),
      getPosition: jest.fn(() => [100, 200]),
      getSize: jest.fn(() => [64, 64]),
      isDestroyed: jest.fn(() => false),
    };
    
    mockWindowManager.createPetWindow.mockReturnValue(mockWin);

    const petId = await manager.loadAndCreatePet("../pets/sheep");

    expect(mockBackendClient.loadPet).toHaveBeenCalledWith("../pets/sheep");
    expect(mockBackendClient.addPet).toHaveBeenCalledWith("../pets/sheep", 1, expect.objectContaining({
      screen: expect.objectContaining({ x: 0, y: 0, w: 1920, h: 1080 }),
      work_area: expect.objectContaining({ x: 0, y: 0, w: 1920, h: 1080 }),
      taskbar: expect.objectContaining({ x: 0, y: 0, w: 0, h: 0 }),
    }));
    expect(mockWindowManager.createPetWindow).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      x: 321,
      y: 654,
    }));
    expect(mockWin.loadFile).toHaveBeenCalledWith(expect.stringContaining("pet.html"), { query: { petId: "pet_1" } });
    expect(petId).toBe("pet_1");

    // Test window events
    const readyToShowCb = mockWin.once.mock.calls.find(c => c[0] === "ready-to-show")[1];
    readyToShowCb();
    expect(mockWin.showInactive).toHaveBeenCalled();

    const loadCb = mockWin.webContents.on.mock.calls.find(c => c[0] === "did-finish-load")[1];
    loadCb();
    expect(manager.pets.get("pet_1").loaded).toBe(true);

    const closedCb = mockWin.on.mock.calls.find(c => c[0] === "closed")[1];
    closedCb();
    expect(manager.pets.has("pet_1")).toBe(false);

    // Test crash event
    const crashCb = mockWin.webContents.on.mock.calls.find(c => c[0] === "crashed")[1];
    crashCb(); // Should log error and not throw
  });

  test("loadAndCreatePet should throw if pet data is invalid", async () => {
    mockBackendClient.loadPet.mockResolvedValue({});
    await expect(manager.loadAndCreatePet("bad")).rejects.toThrow("invalid pet sprite data");
  });

  test("loadAndCreatePet should throw if backend doesn't return pet id", async () => {
    mockBackendClient.loadPet.mockResolvedValue({ png_base64: "a", tiles_x: 1, tiles_y: 1 });
    mockBackendClient.addPet.mockResolvedValue({});
    await expect(manager.loadAndCreatePet("bad")).rejects.toThrow("backend did not return a pet id");
  });

  test("should start pet loop and step pet", async () => {
    const mockWin = {
      getPosition: jest.fn().mockReturnValue([100, 200]),
      getSize: jest.fn().mockReturnValue([64, 64]),
      setPosition: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { send: jest.fn() }
    };
    const petEntry = {
      backendPetId: "pet_1",
      win: mockWin,
      loaded: true,
      interval: null
    };
    manager.pets.set("pet_1", petEntry);

    mockBackendClient.stepPet = jest.fn().mockResolvedValue({
      frame_index: 5,
      x: 110,
      y: 210,
      opacity: 0.5,
      interval_ms: 200,
      sound: { mime_type: "audio/wav", data_base64: "abc" }
    });

    manager["_startPetLoop"]("pet_1");
    
    // Fast-forward 200ms for first loop
    jest.advanceTimersByTime(200);
    await Promise.resolve(); // Wait for loop async work

    expect(mockBackendClient.stepPet).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      screen: expect.any(Object),
      work_area: expect.any(Object),
      taskbar: expect.any(Object),
    }));
    expect(mockWin.setPosition).toHaveBeenCalledWith(110, 210);
    expect(mockWin.webContents.send).toHaveBeenCalledWith("pet:frame", expect.objectContaining({
      frameIndex: 5,
      opacity: 0.5,
      sound: { mime_type: "audio/wav", data_base64: "abc" }
    }));

    // Test default x, y
    mockBackendClient.stepPet.mockResolvedValue({
        frame_index: 6,
        interval_ms: 200
    });
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(mockWin.setPosition).toHaveBeenCalledWith(0, 0);

    // Test loop error handling
    mockBackendClient.stepPet.mockRejectedValue(new Error("fail"));
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    expect(manager.pets.get("pet_1").stepFailures).toBe(1);
    
    // Test loop termination after failures
    for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(200);
        await Promise.resolve();
    }
    expect(manager.pets.get("pet_1").interval).toBeNull();
  });

  test("loop should terminate if pet is unloaded or window destroyed", async () => {
    const mockWin = { isDestroyed: jest.fn().mockReturnValue(true) };
    manager.pets.set("pet_1", { backendPetId: "pet_1", win: mockWin, loaded: true });
    
    manager["_startPetLoop"]("pet_1");
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    
    expect(mockBackendClient.stepPet).not.toHaveBeenCalled();
  });

  test("getDiagnostics should handle windows missing methods", () => {
    mockWindowManager.getAllWindows.mockReturnValue([
      { id: "pet1", win: {} }
    ]);
    const diag = manager.getDiagnostics();
    expect(diag.windows[0].bounds).toBeNull();
    expect(diag.windows[0].visible).toBeNull();
    expect(diag.windows[0].destroyed).toBeNull();
  });

  test("IPC handlers should be registered and work", async () => {
    await manager.init();
    expect(ipcMain.on).toHaveBeenCalledWith("pet:drag", expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith("pet:drag:move", expect.any(Function));
    expect(ipcMain.on).toHaveBeenCalledWith("pet:drop", expect.any(Function));

    const dragHandler = (ipcMain.on as jest.Mock).mock.calls.find(c => c[0] === "pet:drag")[1];
    const moveHandler = (ipcMain.on as jest.Mock).mock.calls.find(c => c[0] === "pet:drag:move")[1];
    const dropHandler = (ipcMain.on as jest.Mock).mock.calls.find(c => c[0] === "pet:drop")[1];

    const mockSender = { id: 1 };
    const mockWin = {
      getPosition: jest.fn().mockReturnValue([10, 20]),
      isDestroyed: jest.fn().mockReturnValue(false),
      setPosition: jest.fn()
    };
    (BrowserWindow.fromWebContents as unknown as jest.Mock).mockReturnValue(mockWin);
    manager["windowToPetId"].set(mockWin, "pet_1");

    dragHandler({ sender: mockSender });
    expect(mockBackendClient.dragPet).toHaveBeenCalledWith("pet_1", 10, 20);

    moveHandler({ sender: mockSender }, { x: 30, y: 40 });
    expect(mockBackendClient.dragPet).toHaveBeenCalledWith("pet_1", 30, 40);
    expect(mockWin.setPosition).toHaveBeenCalledWith(30, 40);

    dropHandler({ sender: mockSender });
    expect(mockBackendClient.dropPet).toHaveBeenCalledWith("pet_1");
  });

  test("pet loop should pause while dragging", async () => {
    const mockWin = {
      getPosition: jest.fn().mockReturnValue([100, 200]),
      getSize: jest.fn().mockReturnValue([64, 64]),
      setPosition: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { send: jest.fn() }
    };
    const petEntry = {
      backendPetId: "pet_1",
      win: mockWin,
      loaded: true,
      interval: null
    };
    manager.pets.set("pet_1", petEntry);
    manager.draggingPets.add("pet_1");

    mockBackendClient.stepPet = jest.fn();

    manager["_startPetLoop"]("pet_1");
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    expect(mockBackendClient.stepPet).not.toHaveBeenCalled();

    manager.draggingPets.delete("pet_1");
  });

  test("removePet should call backend removePet and cleanup when entry exists", async () => {
    const mockWin = { id: 1 };
    const entry = {
      backendPetId: "pet_1",
      interval: setInterval(() => {}, 1000),
      win: mockWin
    };
    manager.pets.set("pet_1", entry);
    
    const mockBackendRemove = jest.fn().mockResolvedValue(true);
    mockBackendClient.removePet = mockBackendRemove;
    
    const result = await manager.removePet("pet_1");
    
    expect(mockBackendRemove).toHaveBeenCalledWith("pet_1");
    expect(result).toBe(true);
    expect(manager.pets.has("pet_1")).toBe(false);
    expect(mockWindowManager.removePetWindow).toHaveBeenCalledWith("pet_1");
  });

  test("removePet should call backend removePet when no entry exists", async () => {
    const mockBackendRemove = jest.fn().mockResolvedValue(true);
    mockBackendClient.removePet = mockBackendRemove;
    
    const result = await manager.removePet("nonexistent");
    
    expect(mockBackendRemove).toHaveBeenCalledWith("nonexistent");
    expect(result).toBe(true);
  });

  test("pet close should skip backend cleanup when app is quitting", async () => {
    mockBackendClient.loadPet.mockResolvedValue({
      png_base64: "abc123",
      tiles_x: 4,
      tiles_y: 1,
    });
    mockBackendClient.addPet.mockResolvedValue({ pet_id: "pet_1", x: 321, y: 654, flip_h: false });

    const mockWin = {
      loadFile: jest.fn().mockResolvedValue(undefined),
      show: jest.fn(),
      showInactive: jest.fn(),
      once: jest.fn(),
      on: jest.fn(),
      webContents: {
        on: jest.fn(),
        send: jest.fn(),
      },
      setPosition: jest.fn(),
      getBounds: jest.fn(() => ({ x: 100, y: 200, width: 64, height: 64 })),
      getPosition: jest.fn(() => [100, 200]),
      getSize: jest.fn(() => [64, 64]),
      isDestroyed: jest.fn(() => false),
    };

    mockWindowManager.createPetWindow.mockReturnValue(mockWin);
    await manager.loadAndCreatePet("../pets/sheep");

    const closedCb = mockWin.on.mock.calls.find(c => c[0] === "closed")[1];
    manager.appIsQuitting = true;
    closedCb();

    expect(mockBackendClient.removePet).not.toHaveBeenCalled();
    expect(manager.pets.has("pet_1")).toBe(false);
  });

  test("shutdown should stop timers and close pet windows without backend cleanup", () => {
    const mockWin1 = { isDestroyed: jest.fn(() => false) };
    const mockWin2 = { isDestroyed: jest.fn(() => false) };
    const interval1 = setInterval(() => {}, 1000);
    const interval2 = setInterval(() => {}, 1000);

    manager.pets.set("pet1", { backendPetId: "pet1", win: mockWin1, interval: interval1 });
    manager.pets.set("pet2", { backendPetId: "pet2", win: mockWin2, interval: interval2 });

    manager.shutdown();

    expect(mockWindowManager.removePetWindow).toHaveBeenCalledWith("pet1");
    expect(mockWindowManager.removePetWindow).toHaveBeenCalledWith("pet2");
    expect(mockBackendClient.removePet).not.toHaveBeenCalled();
    expect(manager.pets.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("_safeWindowPosition should return window position", () => {
    const mockWin = { getPosition: jest.fn().mockReturnValue([100, 200]) };
    const result = manager["_safeWindowPosition"](mockWin);
    expect(result).toEqual([100, 200]);
  });

  test("_safeWindowPosition should handle errors gracefully", () => {
    const mockWin = { getPosition: jest.fn().mockImplementation(() => { throw new Error("test"); }) };
    const result = manager["_safeWindowPosition"](mockWin);
    expect(result).toEqual([0, 0]);
  });

  test("_getPetIdByWindow should return pet id for window", () => {
    const mockWin = {};
    manager["windowToPetId"] = new WeakMap([[mockWin, "pet_123"]]);
    const result = manager["_getPetIdByWindow"](mockWin);
    expect(result).toBe("pet_123");
  });

  test("_getPetIdByWindow should return null for unknown window", () => {
    const mockWin = {};
    manager["windowToPetId"] = new WeakMap();
    const result = manager["_getPetIdByWindow"](mockWin);
    expect(result).toBeNull();
  });

  test("getDiagnostics should return correct info", () => {
    const mockWin1 = {
        getBounds: jest.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
        isVisible: jest.fn().mockReturnValue(true),
        isDestroyed: jest.fn().mockReturnValue(false),
    };
    const mockWin2 = {
        getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 50, height: 50 }),
        isVisible: jest.fn().mockReturnValue(false),
        isDestroyed: jest.fn().mockReturnValue(true),
    };
    manager["windows"] = new Map([["pet1", mockWin1], ["pet2", mockWin2]]);
    
    manager.pets.set("pet1", {});
    manager.pets.set("pet2", {});
    manager.lastError = "test error";
    manager.lastPetLoad = { test: "data" };
    
    // Mock window manager getAllWindows
    mockWindowManager.getAllWindows.mockReturnValue([
      { id: "pet1", win: mockWin1 },
      { id: "pet2", win: mockWin2 }
    ]);
    
    const diag = manager.getDiagnostics();
    expect(diag.activePetIds).toEqual(["pet1", "pet2"]);
    expect(diag.petCount).toBe(2);
    expect(diag.lastError).toBe("test error");
    expect(diag.lastPetLoad).toEqual({ test: "data" });
    expect(diag.windows).toHaveLength(2);
    expect(diag.windows[0].visible).toBe(true);
    expect(diag.windows[1].visible).toBe(false);
  });
});
