// Mock electron modules
jest.mock("electron", () => ({
  BrowserWindow: jest.fn().mockImplementation((opts) => ({
    loadFile: jest.fn(),
    show: jest.fn(),
    once: jest.fn((event, cb) => {
      if (event === "ready-to-show") cb();
    }),
    on: jest.fn((event, cb) => {
      if (event === "closed") cb();
    }),
    webContents: {
      on: jest.fn((event, cb) => {
        if (event === "dom-ready") cb();
      }),
      once: jest.fn((event, cb) => {
        if (event === "dom-ready") cb();
      }),
      send: jest.fn(),
      getPosition: jest.fn(() => [100, 200]),
      getSize: jest.fn(() => [64, 64]),
    },
    setPosition: jest.fn(),
    getPosition: jest.fn(() => [100, 200]),
  })),
  screen: {
    getPrimaryDisplay: jest.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getAllDisplays: jest.fn(() => []),
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
  }));
});

import PetManager from "../pet-manager";

describe("PetManager", () => {
  let manager: InstanceType<typeof PetManager>;
  let mockBackendClient: { loadPet: jest.Mock; addPet: jest.Mock; removePet: jest.Mock; stepPet: jest.Mock; dragPet: jest.Mock; dropPet: jest.Mock };
  let mockWindowManager: { createPetWindow: jest.Mock; getPetWindow: jest.Mock; removePetWindow: jest.Mock; updatePosition: jest.Mock; updateSize: jest.Mock; getAllWindows: jest.Mock; windows: Map<string, any> };
  let mockBorderDetector: { init: jest.Mock; checkBorder: jest.Mock; checkGravity: jest.Mock };

  beforeEach(() => {
    manager = new PetManager("http://localhost:8080");
    mockBackendClient = manager.backendClient as any;
    mockWindowManager = manager.windowManager as any;
    mockBorderDetector = manager.borderDetector as any;
    jest.clearAllMocks();
  });

  test("should initialize with backend URL", () => {
    expect(manager.backendClient.baseUrl).toBe("http://localhost:8080");
  });

  test("should initialize modules on init", async () => {
    await manager.init();
    expect(mockBorderDetector.init).toHaveBeenCalled();
  });

  test("should load and create pet", async () => {
    mockBackendClient.loadPet.mockResolvedValue({
      png_base64: "abc123",
      tiles_x: 4,
      tiles_y: 1,
    });
    mockBackendClient.addPet.mockResolvedValue({ pet_id: "pet_1" });
    
    const mockWin = {
      loadFile: jest.fn(),
      show: jest.fn(),
      showInactive: jest.fn(),
      once: jest.fn((event, cb) => {
        if (event === "ready-to-show") cb();
      }),
      on: jest.fn(),
      webContents: {
        on: jest.fn((event, cb) => {
          if (event === "did-finish-load") cb();
        }),
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
    expect(mockBackendClient.addPet).toHaveBeenCalledWith("../pets/sheep", 1);
    expect(mockWindowManager.createPetWindow).toHaveBeenCalledWith("pet_1", expect.any(Object));
    expect(mockWin.loadFile).toHaveBeenCalledWith(expect.stringContaining("pet.html"), { query: { petId: "pet_1" } });
    expect(petId).toBe("pet_1");

    await manager.removePet("pet_1");
  });

  test("should return all pets", () => {
    manager.pets.set("pet1", {});
    manager.pets.set("pet2", {});

    const pets = manager.getAllPets();
    expect(pets).toHaveLength(2);
  });

  test("removePet should call backend removePet", async () => {
    const mockBackendRemove = jest.fn().mockResolvedValue(true);
    mockBackendClient.removePet = mockBackendRemove;
    
    const result = await manager.removePet("pet_1");
    
    expect(mockBackendRemove).toHaveBeenCalledWith("pet_1");
    expect(result).toBe(true);
    expect(manager.pets.has("pet_1")).toBe(false);
  });

  test("removePet should handle pet not found", async () => {
    const mockBackendRemove = jest.fn().mockResolvedValue(true);
    mockBackendClient.removePet = mockBackendRemove;
    
    const result = await manager.removePet("nonexistent");
    
    expect(mockBackendRemove).toHaveBeenCalledWith("nonexistent");
    expect(result).toBe(true);
  });

  test("_mapBorderToContext should return none for empty hits", () => {
    const result = manager["_mapBorderToContext"]([]);
    expect(result).toBe(0);
  });

  test("_mapBorderToContext should return taskbar for taskbar hit", () => {
    const result = manager["_mapBorderToContext"](["taskbar"]);
    expect(result).toBe(1);
  });

  test("_mapBorderToContext should return window for window hit", () => {
    const result = manager["_mapBorderToContext"](["window"]);
    expect(result).toBe(2);
  });

  test("_mapBorderToContext should return horizontal for horizontal hit", () => {
    const result = manager["_mapBorderToContext"](["horizontal"]);
    expect(result).toBe(3);
  });

  test("_mapBorderToContext should return vertical for vertical hit", () => {
    const result = manager["_mapBorderToContext"](["vertical"]);
    expect(result).toBe(4);
  });

  test("_mapBorderToContext should prioritize taskbar over other hits", () => {
    const result = manager["_mapBorderToContext"](["taskbar", "horizontal"]);
    expect(result).toBe(1);
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
    const mockWin1 = { getBounds: jest.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }) };
    const mockWin2 = { getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 50, height: 50 }) };
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
  });
});
