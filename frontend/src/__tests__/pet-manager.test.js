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

const PetManager = require("../pet-manager");

describe("PetManager", () => {
  let manager;
  let mockBackendClient;
  let mockWindowManager;
  let mockBorderDetector;

  beforeEach(() => {
    manager = new PetManager("http://localhost:8080");
    mockBackendClient = manager.backendClient;
    mockWindowManager = manager.windowManager;
    mockBorderDetector = manager.borderDetector;
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
});
