import { spawn } from "child_process";
import http from "http";

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
    listen: jest.fn((port: any, host: any, cb: any) => cb()),
    close: jest.fn((cb: any) => cb()),
  })),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
}));

import BackendManager from "../backend-manager";

describe("BackendManager", () => {
  let manager: InstanceType<typeof BackendManager>;
  let mockProcess: { stdout: { on: jest.Mock; removeAllListeners: jest.Mock }; stderr: { on: jest.Mock; removeAllListeners: jest.Mock }; on: jest.Mock; removeAllListeners: jest.Mock; kill: jest.Mock };
  let mockGet: jest.MockedFunction<typeof http.get>;

  beforeEach(() => {
    mockProcess = {
      stdout: { on: jest.fn(), removeAllListeners: jest.fn() },
      stderr: { on: jest.fn(), removeAllListeners: jest.fn() },
      on: jest.fn(),
      removeAllListeners: jest.fn(),
      kill: jest.fn(),
    };
    (spawn as jest.Mock).mockReturnValue(mockProcess);
    mockGet = http.get as jest.MockedFunction<typeof http.get>;
    
    // Mock http.get for health check
    const mockRes = {
      statusCode: 200,
      on: jest.fn((event, cb) => {
        if (event === "data") cb("");
        if (event === "end") setTimeout(() => cb(), 0);
      }),
    };
    mockGet.mockImplementation((url: any, cb?: any) => {
      if (typeof cb === "function") cb(mockRes);
      return { on: jest.fn() } as any;
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
    let stdoutCallback: ((chunk: Buffer) => void) | undefined;
    mockProcess.stdout.on.mockImplementation((event, cb) => {
      if (event === "data") stdoutCallback = cb;
    });
    
    await manager.start();
    if (stdoutCallback) stdoutCallback(Buffer.from("test output"));
    // Should not throw
  });

  test("should handle stderr data", async () => {
    let stderrCallback: ((chunk: Buffer) => void) | undefined;
    mockProcess.stderr.on.mockImplementation((event, cb) => {
      if (event === "data") stderrCallback = cb;
    });
    
    await manager.start();
    if (stderrCallback) stderrCallback(Buffer.from("error output"));
    // Should not throw
  });
});
