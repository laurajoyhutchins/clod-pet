const { spawn } = require("child_process");
const http = require("http");

// Mock modules
jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

jest.mock("http", () => ({
  get: jest.fn(),
  request: jest.fn(),
}));

jest.mock("net", () => ({
  createServer: jest.fn(() => ({
    listen: jest.fn((port, host, cb) => cb()),
    close: jest.fn((cb) => cb()),
  })),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
}));

const BackendManager = require("../backend-manager");

describe("BackendManager", () => {
  let manager;
  let mockProcess;

  beforeEach(() => {
    mockProcess = {
      stdout: { on: jest.fn(), removeAllListeners: jest.fn() },
      stderr: { on: jest.fn(), removeAllListeners: jest.fn() },
      on: jest.fn(),
      removeAllListeners: jest.fn(),
      kill: jest.fn(),
    };
    spawn.mockReturnValue(mockProcess);
    
    // Mock http.get for health check
    const mockRes = {
      statusCode: 200,
      on: jest.fn((event, cb) => {
        if (event === "data") cb("");
        if (event === "end") setTimeout(() => cb(), 0);
      }),
    };
    http.get.mockImplementation((url, cb) => {
      if (typeof cb === "function") cb(mockRes);
      return { on: jest.fn() };
    });
    
    manager = new BackendManager();
    jest.clearAllMocks();
  });

  test("should initialize with null process and url", () => {
    expect(manager.process).toBeNull();
    expect(manager.url).toBeNull();
  });

  test("should set pets dir", () => {
    expect(manager.petsDir).toContain("pets");
  });

  test("should start backend and return url", async () => {
    const url = await manager.start();
    
    expect(spawn).toHaveBeenCalledWith(
      "go",
      ["run", "."],
      expect.objectContaining({
        cwd: expect.stringContaining("backend"),
        env: expect.objectContaining({
          PORT: expect.any(String),
          PETS_DIR: expect.any(String),
        }),
      })
    );
    expect(url).toMatch(/http:\/\/localhost:\d+/);
  });

  test("should stop backend process", () => {
    manager.process = mockProcess;
    manager.stop();
    
    expect(mockProcess.kill).toHaveBeenCalled();
    expect(manager.process).toBeNull();
  });

  test("should handle stdout data", async () => {
    let stdoutCallback;
    mockProcess.stdout.on.mockImplementation((event, cb) => {
      if (event === "data") stdoutCallback = cb;
    });
    
    await manager.start();
    if (stdoutCallback) stdoutCallback("test output");
    // Should not throw
  });

  test("should handle stderr data", async () => {
    let stderrCallback;
    mockProcess.stderr.on.mockImplementation((event, cb) => {
      if (event === "data") stderrCallback = cb;
    });
    
    await manager.start();
    if (stderrCallback) stderrCallback("error output");
    // Should not throw
  });
});
