// Mock electron modules
jest.mock("electron", () => ({
  BrowserWindow: Object.assign(jest.fn().mockImplementation((opts) => ({
    loadURL: jest.fn().mockResolvedValue(undefined),
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
    getCursorScreenPoint: jest.fn(() => ({ x: 400, y: 300 })),
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
  },
}));

jest.mock("../../src/main/backend-client", () => {
  return jest.fn().mockImplementation((baseUrl) => ({
    baseUrl,
    loadPet: jest.fn(),
    addPet: jest.fn(),
    removePet: jest.fn(),
    stepPet: jest.fn(),
    setPosition: jest.fn(),
    dragPet: jest.fn(),
    dropPet: jest.fn(),
    getSettings: jest.fn().mockResolvedValue({ Scale: 1.0, Volume: 0.3 }),
  }));
});

jest.mock("../../src/main/window-manager", () => {
  return jest.fn().mockImplementation(() => ({
    windows: new Map<string, { win: any; opts?: unknown }>(),
    createPetWindow: jest.fn(),
    setPetWindowsForeground: jest.fn(),
    raisePetWindow: jest.fn(),
    getPetWindow: jest.fn(function (petId) {
      return this.windows.get(petId)?.win || null;
    }),
    removePetWindow: jest.fn(function (petId) {
      this.windows.delete(petId);
    }),
    updatePosition: jest.fn(),
    updateSize: jest.fn(),
    getAllWindows: jest.fn(function () {
      const entries = Array.from(this.windows.entries()) as Array<[string, { win: any }]>;
      return entries.map(([id, entry]) => ({ id, win: entry.win }));
    }),
  }));
});

jest.mock("../../src/shared/store", () => {
  type TestState = {
    pets: Record<string, any>;
    backend: Record<string, unknown>;
    environment: Record<string, unknown>;
    ui: Record<string, unknown>;
  };

  const createState = (): TestState => ({
    pets: {},
    backend: {
      status: "idle",
      url: null,
      port: null,
      version: null,
      lastError: null,
      pid: null,
      exitCode: null,
      available: false,
      ready: false,
      restartAttempt: 0,
      nextRestartAt: null,
    },
    environment: {
      DisplayBounds: { x: 0, y: 0, w: 0, h: 0 },
      WorkArea: { x: 0, y: 0, w: 0, h: 0 },
      Desktop: { x: 0, y: 0, w: 0, h: 0 },
      scale: 1.0,
      volume: 0.3,
    },
    ui: {
      isChatOpen: false,
      isControlPanelOpen: false,
      lastError: null,
    },
  });

  const createStore = () => {
    let state: TestState = createState();
    return {
      getState: jest.fn(() => state),
      setState: jest.fn((newState: Partial<TestState>) => {
        state = {
          ...state,
          ...newState,
        };
      }),
      setPet: jest.fn((petId: string, pet: unknown) => {
        state = {
          ...state,
          pets: {
            ...state.pets,
            [petId]: pet,
          },
        };
      }),
      updatePet: jest.fn((petId: string, updates: Partial<Record<string, unknown>>) => {
        if (!state.pets[petId]) return;
        state = {
          ...state,
          pets: {
            ...state.pets,
            [petId]: {
              ...state.pets[petId],
              ...updates,
            },
          },
        };
      }),
      removePet: jest.fn((petId: string) => {
        if (!state.pets[petId]) return;
        const pets = { ...state.pets };
        delete pets[petId];
        state = {
          ...state,
          pets,
        };
      }),
      subscribe: jest.fn(() => () => {}),
      __reset: jest.fn(() => {
        state = createState();
      }),
    };
  };

  const globalStore = createStore();

  return {
    __esModule: true,
    default: globalStore,
    standardizeError: jest.fn((err: unknown, source: string) => ({
      message: err instanceof Error ? err.message : String(err),
      source,
    })),
    WorldStore: jest.fn().mockImplementation(() => createStore()),
  };
});

import PetManager from "../../src/main/pet-manager";
import { BrowserWindow, ipcMain, screen } from "electron";
import globalStore from "../../src/shared/store";
import * as BorderDetector from "../../src/border-detector";

// Type for mock BrowserWindow
type MockBrowserWindow = {
  loadURL: jest.Mock;
  show: jest.Mock;
  showInactive: jest.Mock;
  once: jest.Mock;
  on: jest.Mock;
  webContents: {
    on: jest.Mock;
    once: jest.Mock;
    send: jest.Mock;
    getPosition: jest.Mock;
    getSize: jest.Mock;
  };
  setPosition: jest.Mock;
  getPosition: jest.Mock;
  getBounds: jest.Mock;
  getSize: jest.Mock;
  isDestroyed: jest.Mock;
} & Electron.BrowserWindow;

describe("PetManager", () => {
  let manager: InstanceType<typeof PetManager>;
  let mockBackendClient: { loadPet: jest.Mock; addPet: jest.Mock; removePet: jest.Mock; stepPet: jest.Mock; dragPet: jest.Mock; dropPet: jest.Mock; setPosition: jest.Mock; getSettings: jest.Mock };
  let mockWindowManager: { createPetWindow: jest.Mock; setPetWindowsForeground: jest.Mock; raisePetWindow: jest.Mock; getPetWindow: jest.Mock; removePetWindow: jest.Mock; updatePosition: jest.Mock; updateSize: jest.Mock; getAllWindows: jest.Mock; windows: Map<string, any> };
  let mockStore: any;
  const flushPetQueue = async (petId: string) => {
    const queued = (manager as any).petBackendQueues.get(petId) as Promise<unknown> | undefined;
    if (queued) await queued;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockStore = globalStore;
    mockStore.__reset();
    manager = new PetManager("http://localhost:8080", mockStore);
    mockBackendClient = manager.backendClient as any;
    mockWindowManager = manager.windowManager as any;
    mockWindowManager.windows.clear();
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

    const mockWin = {
      petData: { png_base64: "abc", tiles_x: 1, tiles_y: 1 }
    };
    mockWindowManager.windows.set("pet_1", {
      win: mockWin,
      opts: {
        petData: { png_base64: "abc", tiles_x: 1, tiles_y: 1 }
      }
    });

    const result = await handler(null, "pet_1");
    expect(result).toEqual({
      petId: "pet_1",
      pngBase64: "data:image/png;base64,abc",
      tilesX: 1,
      tilesY: 1,
      scale: 1.0,
      volume: 0.3,
      isDebug: false,
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
    mockBackendClient.addPet.mockResolvedValue({
      ok: true,
      payload: { pet_id: "pet_1", x: 321, y: 654, flip_h: false },
    });

    const mockWin = {
      loadURL: jest.fn().mockResolvedValue(undefined),
      show: jest.fn(),
      showInactive: jest.fn(),
      moveTop: jest.fn(),
      setAlwaysOnTop: jest.fn(),
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
    expect(mockBackendClient.addPet).toHaveBeenCalledWith("../pets/sheep", 0, expect.objectContaining({
      screen: expect.objectContaining({ x: 0, y: 0, w: 1920, h: 1080 }),
    }));
    expect(mockWindowManager.createPetWindow).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      x: 321,
      y: 654,
    }));
    expect(mockWin.loadURL).toHaveBeenCalledWith(expect.stringContaining("pet.html?petId=pet_1"));
    expect(petId).toBe("pet_1");

    // Test window events
    const readyToShowCb = mockWin.once.mock.calls.find(c => c[0] === "ready-to-show")[1];
    readyToShowCb();
    expect(mockWin.showInactive).toHaveBeenCalled();
    expect(mockWindowManager.raisePetWindow).toHaveBeenCalledWith("pet_1");

    const loadCb = mockWin.webContents.on.mock.calls.find(c => c[0] === "did-finish-load")[1];
    loadCb();
    expect(mockStore.getState().pets.pet_1.loaded).toBe(true);

    const closedCb = mockWin.on.mock.calls.find(c => c[0] === "closed")[1];
    closedCb();
    expect(mockStore.getState().pets.pet_1).toBeUndefined();

    // Test crash event
    const crashCb = mockWin.webContents.on.mock.calls.find(c => c[0] === "render-process-gone");
    if (crashCb) crashCb[1](null, { reason: "crashed" }); // Should log error and not throw
  });

  test("loadAndCreatePet should throw if pet data is invalid", async () => {
    mockBackendClient.loadPet.mockResolvedValue({});
    await expect(manager.loadAndCreatePet("bad")).rejects.toThrow("invalid pet sprite data");
  });

  test("loadAndCreatePet should throw if backend doesn't return pet id", async () => {
    mockBackendClient.loadPet.mockResolvedValue({ png_base64: "a", tiles_x: 1, tiles_y: 1 });
    mockBackendClient.addPet.mockResolvedValue({ ok: true, payload: {} });
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
    mockWindowManager.windows.set("pet_1", { win: mockWin, opts: {} });
    mockStore.setPet("pet_1", {
      id: "pet_1",
      path: "../pets/sheep",
      backendPetId: "pet_1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 100, y: 200, flipH: false },
      loaded: true,
      stopped: false,
      stepFailures: 0,
      lastStepError: null,
      dragOffsetX: 0,
      dragOffsetY: 0,
    });

    mockBackendClient.stepPet = jest.fn().mockResolvedValue({
      ok: true,
      payload: {
        frame_index: 5,
        x: 110,
        y: 210,
        opacity: 0.5,
        interval_ms: 200,
        sound: { mime_type: "audio/wav", data_base64: "abc" }
      }
    });

    manager["_startPetLoop"]("pet_1");

    // Fast-forward 200ms for first loop
    await jest.advanceTimersByTimeAsync(200);

    expect(mockBackendClient.stepPet).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      screen: expect.any(Object),
      work_area: expect.any(Object),
    }));
    expect(mockStore.updatePet).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      state: expect.objectContaining({ x: 110, y: 210 })
    }));
    expect(mockWin.webContents.send).toHaveBeenCalledWith("pet:frame", expect.objectContaining({
      frameIndex: 5,
      opacity: 0.5,
      sound: { mime_type: "audio/wav", data_base64: "abc" }
    }));

    // Test default x, y
    mockBackendClient.stepPet.mockResolvedValue({
      ok: true,
      payload: {
        frame_index: 6,
        interval_ms: 200
      }
    });
    await jest.advanceTimersByTimeAsync(200);
    expect(mockStore.updatePet).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      state: expect.objectContaining({ x: 0, y: 0 })
    }));

    // Test loop error handling
    mockBackendClient.stepPet.mockRejectedValue(new Error("fail"));
    await jest.advanceTimersByTimeAsync(200);
    expect(mockStore.getState().pets.pet_1.stepFailures).toBe(1);

    // Test loop termination after failures
    for (let i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(200);
    }
    expect(mockStore.getState().pets.pet_1.stopped).toBe(true);
  });

  test("loop should terminate if pet is unloaded or window destroyed", async () => {
    const mockWin = { isDestroyed: jest.fn().mockReturnValue(true) };
    mockWindowManager.windows.set("pet_1", { win: mockWin, opts: {} });
    mockStore.setPet("pet_1", {
      id: "pet_1",
      path: "../pets/sheep",
      backendPetId: "pet_1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 0, y: 0, flipH: false },
      loaded: true,
      stopped: false,
    });

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
    } as unknown as Electron.BrowserWindow;
    (BrowserWindow.fromWebContents as unknown as jest.Mock).mockReturnValue(mockWin);
    manager["windowToPetId"].set(mockWin, "pet_1");
    mockStore.setPet("pet_1", {
      id: "pet_1",
      path: "../pets/sheep",
      backendPetId: "pet_1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 0, y: 0, flipH: false },
      loaded: true,
      stopped: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
    });

    // Cursor is at (40, 60) when the user presses down. The drag origin comes
    // from cached state x/y (0,0) instead of win.getPosition() (10,20), which
    // avoids Wayland reporting (0,0) and breaking the offset.
    // → offset = (40, 60). Then cursor moves to (130, 160) → new window pos = (90, 100).
    (screen.getCursorScreenPoint as jest.Mock)
      .mockReturnValueOnce({ x: 40, y: 60 })
      .mockReturnValueOnce({ x: 130, y: 160 });

    dragHandler({ sender: mockSender });
    expect(mockBackendClient.dragPet).toHaveBeenCalledWith("pet_1", 0, 0);
    expect(mockStore.updatePet).toHaveBeenCalledWith("pet_1", {
      dragOffsetX: 40,
      dragOffsetY: 60,
    });

    await flushPetQueue("pet_1");
    moveHandler({ sender: mockSender }, { x: 0, y: 0 }); // renderer coords ignored
    await flushPetQueue("pet_1");
    expect(mockBackendClient.dragPet).toHaveBeenCalledWith("pet_1", 90, 100);
    expect(mockWin.setPosition).toHaveBeenCalledWith(90, 100);

    dropHandler({ sender: mockSender });
    await flushPetQueue("pet_1");
    expect(mockBackendClient.dropPet).toHaveBeenCalledWith("pet_1");
  });

  test("pet backend commands should preserve drag/drop order", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    (manager as any)._queuePetBackendCommand("pet_1", () => {
      order.push("drag");
      return first;
    });
    (manager as any)._queuePetBackendCommand("pet_1", () => {
      order.push("drop");
      return Promise.resolve();
    });

    expect(order).toEqual(["drag"]);
    const queued = (manager as any).petBackendQueues.get("pet_1") as Promise<unknown>;
    releaseFirst();
    await queued;

    expect(order).toEqual(["drag", "drop"]);
  });

  test("pet loop should advance frames while dragging without moving the window", async () => {
    const mockWin = {
      getPosition: jest.fn().mockReturnValue([100, 200]),
      getSize: jest.fn().mockReturnValue([64, 64]),
      setPosition: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { send: jest.fn() }
    };
    mockWindowManager.windows.set("pet_1", { win: mockWin, opts: {} });
    mockStore.setPet("pet_1", {
      id: "pet_1",
      path: "../pets/sheep",
      backendPetId: "pet_1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 100, y: 200, flipH: false },
      loaded: true,
      stopped: false,
    });
    manager.draggingPets.add("pet_1");

    mockBackendClient.stepPet = jest.fn().mockResolvedValue({
      ok: true,
      payload: {
        frame_index: 42,
        x: 110,
        y: 210,
        opacity: 1,
        interval_ms: 100
      }
    });

    manager["_startPetLoop"]("pet_1");
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    expect(mockBackendClient.stepPet).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      screen: expect.any(Object),
      work_area: expect.any(Object),
    }));
    expect(mockWin.setPosition).not.toHaveBeenCalled();
    expect(mockWin.webContents.send).toHaveBeenCalledWith("pet:frame", expect.objectContaining({
      frameIndex: 42,
      opacity: 1,
    }));

    manager.draggingPets.delete("pet_1");
  });

  test("pet loop should not feed OS clamp back into backend physics", async () => {
    const mockWin = {
      getPosition: jest.fn().mockReturnValue([0, 0]),
      getSize: jest.fn().mockReturnValue([64, 64]),
      setPosition: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { send: jest.fn() }
    };
    mockWindowManager.windows.set("pet_1", { win: mockWin, opts: {} });
    mockStore.setPet("pet_1", {
      id: "pet_1",
      path: "../pets/sheep",
      backendPetId: "pet_1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 1930, y: 976, offsetY: 0, flipH: false },
      loaded: true,
      stopped: false,
    });

    mockBackendClient.setPosition.mockResolvedValue({ ok: true, payload: {} });
    mockBackendClient.stepPet.mockResolvedValue({
      ok: true,
      payload: {
        frame_index: 5,
        x: 0,
        y: 10,
        opacity: 1,
        interval_ms: 100
      }
    });

    manager["_startPetLoop"]("pet_1");
    await jest.advanceTimersByTimeAsync(200);

    expect(mockBackendClient.stepPet).toHaveBeenCalledWith("pet_1", expect.any(Object));
    expect(mockStore.updatePet).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      state: expect.objectContaining({ x: 0, y: 10 })
    }));
    expect(mockBackendClient.setPosition).not.toHaveBeenCalled();
  });

  test("pet loop should choose display bounds from cached pet state when window position is unreliable", async () => {
    const rawWorldSpy = jest.spyOn(BorderDetector, "getRawWorldContext");
    (screen.getAllDisplays as jest.Mock).mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
      {
        bounds: { x: 1920, y: 0, width: 1080, height: 1920 },
        workArea: { x: 1920, y: 0, width: 1080, height: 1880 },
      },
    ]);

    const mockWin = {
      getPosition: jest.fn().mockReturnValue([0, 0]),
      getSize: jest.fn().mockReturnValue([64, 64]),
      setPosition: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { send: jest.fn() }
    };
    mockWindowManager.windows.set("pet_1", { win: mockWin, opts: {} });
    mockStore.setPet("pet_1", {
      id: "pet_1",
      path: "../pets/sheep",
      backendPetId: "pet_1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 2000, y: 1700, offsetY: 0, flipH: false },
      loaded: true,
      stopped: false,
    });

    mockBackendClient.stepPet.mockResolvedValue({
      ok: true,
      payload: {
        frame_index: 5,
        x: 2000,
        y: 1700,
        opacity: 1,
        interval_ms: 100
      }
    });

    manager["_startPetLoop"]("pet_1");
    await jest.advanceTimersByTimeAsync(200);

    expect(rawWorldSpy).toHaveBeenCalledWith(
      2000,
      1700,
      64,
      64,
      expect.any(Array),
      { multiScreen: true },
    );

    rawWorldSpy.mockRestore();
  });

  test("pet loop should forward backend border context to store and renderer", async () => {
    const originalEnv = process.env.VERBOSE;
    process.env.VERBOSE = "true";
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const mockWin = {
      getPosition: jest.fn().mockReturnValue([100, 200]),
      getSize: jest.fn().mockReturnValue([64, 64]),
      setPosition: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { send: jest.fn() }
    };
    mockWindowManager.windows.set("pet_1", { win: mockWin, opts: {} });
    mockStore.setPet("pet_1", {
      id: "pet_1",
      path: "../pets/sheep",
      backendPetId: "pet_1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 1,
      currentAnimName: "walk",
      state: { frameIndex: 0, x: 100, y: 200, flipH: false },
      loaded: true,
      stopped: false,
    });

    mockBackendClient.stepPet.mockResolvedValue({
      ok: true,
      payload: {
        frame_index: 5,
        x: 100,
        y: 200,
        opacity: 1,
        interval_ms: 100,
        current_anim_id: 1,
        current_anim_name: "walk",
        border_ctx: 1,
      }
    });

    manager["_startPetLoop"]("pet_1");
    await jest.advanceTimersByTimeAsync(200);

    expect(mockStore.updatePet).toHaveBeenCalledWith("pet_1", expect.objectContaining({
      state: expect.objectContaining({ borderCtx: 1 }),
    }));
    expect(mockWin.webContents.send).toHaveBeenCalledWith("pet:frame", expect.objectContaining({
      borderCtx: 1,
    }));
    expect(infoSpy.mock.calls.some((call) => (
      call[0] === "[pet-manager]"
      && typeof call[1] === "string"
      && call[1].includes("collision animName=walk")
      && call[1].includes("borders=floor")
    ))).toBe(true);

    infoSpy.mockRestore();
    process.env.VERBOSE = originalEnv;
  });

  test("removePet should call backend removePet and cleanup when entry exists", async () => {
    const mockWin = { id: 1 };
    mockStore.setPet("pet_1", {
      id: "pet_1",
      path: "../pets/sheep",
      backendPetId: "pet_1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 0, y: 0, flipH: false },
      loaded: true,
      stopped: false,
    });
    mockWindowManager.windows.set("pet_1", { win: mockWin, opts: {} });
    manager.petTimers.set("pet_1", setInterval(() => {}, 1000));

    const mockBackendRemove = jest.fn().mockResolvedValue(true);
    mockBackendClient.removePet = mockBackendRemove;

    const result = await manager.removePet("pet_1");

    expect(mockBackendRemove).toHaveBeenCalledWith("pet_1");
    expect(result).toBe(true);
    expect(mockStore.getState().pets.pet_1).toBeUndefined();
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
    mockBackendClient.addPet.mockResolvedValue({
      ok: true,
      payload: { pet_id: "pet_1", x: 321, y: 654, flip_h: false },
    });

    const mockWin = {
      loadURL: jest.fn().mockResolvedValue(undefined),
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
    expect(mockStore.getState().pets.pet_1).toBeUndefined();
  });

  test("should apply foreground priority from settings on init", async () => {
    mockBackendClient.getSettings.mockResolvedValue({
      payload: { Scale: 1.0, Volume: 0.3, WinForeGround: true },
    });

    await manager.init();

    expect(mockWindowManager.setPetWindowsForeground).toHaveBeenCalledWith(true);
  });

  test("shutdown should stop timers and close pet windows without backend cleanup", () => {
    const mockWin1 = { isDestroyed: jest.fn(() => false) };
    const mockWin2 = { isDestroyed: jest.fn(() => false) };
    const interval1 = setInterval(() => {}, 1000);
    const interval2 = setInterval(() => {}, 1000);

    mockStore.setPet("pet1", {
      id: "pet1",
      path: "../pets/one",
      backendPetId: "pet1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 0, y: 0, flipH: false },
      loaded: true,
      stopped: false,
    });
    mockStore.setPet("pet2", {
      id: "pet2",
      path: "../pets/two",
      backendPetId: "pet2",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 0, y: 0, flipH: false },
      loaded: true,
      stopped: false,
    });
    mockWindowManager.windows.set("pet1", { win: mockWin1, opts: {} });
    mockWindowManager.windows.set("pet2", { win: mockWin2, opts: {} });
    manager.petTimers.set("pet1", interval1);
    manager.petTimers.set("pet2", interval2);

    manager.shutdown();

    expect(mockWindowManager.removePetWindow).toHaveBeenCalledWith("pet1");
    expect(mockWindowManager.removePetWindow).toHaveBeenCalledWith("pet2");
    expect(mockBackendClient.removePet).not.toHaveBeenCalled();
    expect(Object.keys(mockStore.getState().pets)).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("_safeWindowPosition should return window position", () => {
    const mockWin = { getPosition: jest.fn().mockReturnValue([100, 200]) };
    const result = manager["_safeWindowPosition"](mockWin as any);
    expect(result).toEqual([100, 200]);
  });

  test("_safeWindowPosition should handle errors gracefully", () => {
    const mockWin = { getPosition: jest.fn().mockImplementation(() => { throw new Error("test"); }) };
    const result = manager["_safeWindowPosition"](mockWin as any);
    expect(result).toEqual([0, 0]);
  });

  test("_getPetIdByWindow should return pet id for window", () => {
    const mockWin = {};
    manager["windowToPetId"] = new WeakMap([[mockWin, "pet_123"]]);
    const result = manager["_getPetIdByWindow"](mockWin as any);
    expect(result).toBe("pet_123");
  });

  test("_getPetIdByWindow should return null for unknown window", () => {
    const mockWin = {};
    manager["windowToPetId"] = new WeakMap();
    const result = manager["_getPetIdByWindow"](mockWin as any);
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
    mockStore.setPet("pet1", {
      id: "pet1",
      path: "../pets/one",
      backendPetId: "pet1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 0, y: 0, flipH: false },
      loaded: true,
      stopped: false,
    });
    mockStore.setPet("pet2", {
      id: "pet2",
      path: "../pets/two",
      backendPetId: "pet2",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: { frameIndex: 0, x: 0, y: 0, flipH: false },
      loaded: true,
      stopped: false,
    });
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
