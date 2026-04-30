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

jest.mock("net", () => {
  const EventEmitter = require("events");
  return {
    createServer: jest.fn(() => {
      const server = new EventEmitter();
      (server as any).listen = jest.fn((port: any, host: any, cb: any) => {
        const callback = typeof host === "function" ? host : cb;
        setImmediate(() => {
          if (callback) callback();
          server.emit("listening");
        });
      });
      (server as any).close = jest.fn((cb: any) => {
        if (cb) cb();
      });
      return server;
    }),
  };
});

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

  test("should respect preferSource option", () => {
    const m = new BackendManager({ preferSource: false });
    expect(m.preferSource).toBe(false);
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

  test("should start backend using exe if requested", async () => {
    const fs = require("fs");
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const originalEnv = process.env.CLOD_PET_BACKEND_MODE;
    process.env.CLOD_PET_BACKEND_MODE = "exe";
    
    await manager.start();
    
    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining("clod-pet.exe"),
      [],
      expect.any(Object)
    );
    
    process.env.CLOD_PET_BACKEND_MODE = originalEnv;
  });

  test("should stop backend process", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });
    
    manager.process = mockProcess;
    manager.stop();
    
    expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    expect(manager.process).toBeNull();
    
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  test("should use taskkill on windows", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    
    manager.process = { ...mockProcess, pid: 1234 };
    manager.stop();
    
    expect(spawn).toHaveBeenCalledWith("taskkill", ["/F", "/T", "/PID", "1234"]);
    expect(manager.process).toBeNull();
    
    Object.defineProperty(process, "platform", { value: originalPlatform });
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

  test("appendRecent should truncate long output", async () => {
    let stdoutCallback: ((chunk: Buffer) => void) | undefined;
    mockProcess.stdout.on.mockImplementation((event, cb) => {
      if (event === "data") stdoutCallback = cb;
    });
    
    await manager.start();
    if (stdoutCallback) {
        stdoutCallback(Buffer.from("a".repeat(5000)));
        stdoutCallback(Buffer.from("b".repeat(5000)));
    }
    expect(manager.lastStdout.length).toBe(8000);
    expect(manager.lastStdout.startsWith("a")).toBe(true);
    expect(manager.lastStdout.endsWith("b")).toBe(true);
  });

  test("getDiagnostics should return correct info", () => {
    manager.url = "http://localhost:8080";
    manager.launch = { cmd: "go", args: ["run", "."] };
    manager.lastStdout = "test output";
    manager.lastStderr = "test error";
    manager.lastError = "test error msg";
    manager.exitCode = 0;

    const diag = manager.getDiagnostics();
    expect(diag.url).toBe("http://localhost:8080");
    expect(diag.launch).toBeDefined();
    expect(diag.lastStdout).toBe("test output");
    expect(diag.lastStderr).toBe("test error");
    expect(diag.lastError).toBe("test error msg");
    expect(diag.exitCode).toBe(0);
    expect(diag.running).toBe(false);
  });

  test("getDiagnostics should report running when process active", () => {
    manager.process = mockProcess;
    (manager.process as any).exitCode = null;
    const diag = manager.getDiagnostics();
    expect(diag.running).toBe(true);
  });

  test("should handle spawn error", async () => {
    let errorCallback: ((err: Error) => void) | undefined;
    mockProcess.on.mockImplementation((event, cb) => {
      if (event === "error") errorCallback = cb;
    });

    await manager.start();
    expect(() => {
      if (errorCallback) errorCallback(new Error("spawn failed"));
    }).not.toThrow();
    expect(manager.lastError).toBe("spawn failed");
  });

  test("should handle process exit", async () => {
    let exitCallback: ((code: number) => void) | undefined;
    mockProcess.on.mockImplementation((event, cb) => {
      if (event === "close") exitCallback = cb;
    });

    await manager.start();
    if (exitCallback) exitCallback(1);
    expect(manager.exitCode).toBe(1);
  });

  test("_findFreePort should return a port", async () => {
    const net = require("net");
    const mockServer = {
      listen: jest.fn((port, cb) => cb()),
      close: jest.fn((cb) => cb()),
    };
    (net.createServer as jest.Mock).mockReturnValue(mockServer);

    const port = await (manager as any)._findFreePort(8080);
    expect(port).toBeDefined();
    expect(mockServer.listen).toHaveBeenCalledWith(8080, expect.any(Function));
  });

  test("_waitForReady should timeout after max retries", async () => {
    let callCount = 0;
    mockGet.mockImplementation((url: any, cb?: any) => {
      callCount++;
      const mockRes = {
        statusCode: 500,
        on: jest.fn((event: string, cb: Function) => {
          if (event === "end") {
            // Simulate async end event
            setTimeout(() => cb(), 0);
          }
        }),
      };
      if (typeof cb === "function") cb(mockRes);
      return { on: jest.fn() } as any;
    });

    await expect((manager as any)._waitForReady(3, 10)).rejects.toThrow("backend failed to start");
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  test("_findFreePort should throw error if no port found", async () => {
    const net = require("net");
    const mockServer: any = {
      listen: jest.fn(),
      on: jest.fn(),
      close: jest.fn().mockImplementation(cb => cb()),
    };
    (net.createServer as jest.Mock).mockReturnValue(mockServer);

    mockServer.listen.mockImplementation((port, cb) => {
        // Trigger error after the current execution block so .on('error') is registered
        setImmediate(() => {
            const errorCall = mockServer.on.mock.calls.find(c => c[0] === "error");
            if (errorCall) errorCall[1](new Error("EADDRINUSE"));
        });
    });

    await expect(manager["_findFreePort"](8080, 2)).rejects.toThrow("no free port found");
  });

  test("_waitForReady should handle network errors", async () => {
    let callCount = 0;
    mockGet.mockImplementation((url: any, cb?: any) => {
      callCount++;
      const mockReq = {
        on: jest.fn((event, cb) => {
          if (event === "error") setTimeout(() => cb(new Error("conn refused")), 0);
          return mockReq;
        })
      };
      return mockReq as any;
    });

    await expect((manager as any)._waitForReady(3, 10)).rejects.toThrow("failed to start");
    expect(callCount).toBeGreaterThanOrEqual(3);
  });
});
