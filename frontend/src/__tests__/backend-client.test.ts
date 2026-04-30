import http from "http";
import { IncomingMessage } from "http";

// Mock http module
jest.mock("http", () => ({
  request: jest.fn(),
  get: jest.fn(),
}));

import BackendClient from "../backend-client";

describe("BackendClient", () => {
  let client: InstanceType<typeof BackendClient>;
  let mockReq: { write: jest.Mock; end: jest.Mock; on: jest.Mock; destroy: jest.Mock };
  let mockRes: { statusCode: number; on: jest.Mock };
  let dataCallback: ((chunk: Buffer) => void) | null;
  let endCallback: (() => void) | null;
  let mockRequest: jest.Mock;

  beforeEach(() => {
    client = new BackendClient("http://localhost:8080");
    mockRequest = http.request as jest.Mock;
    
    dataCallback = null;
    endCallback = null;
    
    mockReq = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      destroy: jest.fn(),
    };
    
    mockRes = {
      statusCode: 200,
      on: jest.fn((event: string, cb: Function) => {
        if (event === "data") dataCallback = cb as (chunk: Buffer) => void;
        if (event === "end") endCallback = cb as () => void;
      }),
    };
    
    mockRequest.mockImplementation((url: any, opts: any, callback: any) => {
      if (callback) callback(mockRes);
      return mockReq;
    });
    
    jest.clearAllMocks();
  });

  test("should initialize with default URL", () => {
    const c = new BackendClient();
    expect(c.baseUrl).toBe("http://localhost:8080");
    expect(c.connected).toBe(false);
  });

  test("should initialize with custom URL", () => {
    const c = new BackendClient("http://localhost:9000");
    expect(c.baseUrl).toBe("http://localhost:9000");
  });

  test("should make request and return result on success", async () => {
    const mockBody = JSON.stringify({ ok: true, payload: { data: "test" } });

    const promise = client.request("test_cmd", { key: "val" });
    dataCallback!(Buffer.from(mockBody));
    endCallback!();

    const result: any = await promise;
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({ data: "test" });
    expect(client.connected).toBe(true);
  });

  test("should throw error on failed request", async () => {
    const mockBody = JSON.stringify({ ok: false, error: "something went wrong" });

    const promise = client.request("test_cmd", {});
    dataCallback!(Buffer.from(mockBody));
    endCallback!();

    await expect(promise).rejects.toThrow("something went wrong");
  });

  test("should throw unknown error on failed request without error message", async () => {
    const mockBody = JSON.stringify({ ok: false });

    const promise = client.request("test_cmd", {});
    dataCallback!(Buffer.from(mockBody));
    endCallback!();

    await expect(promise).rejects.toThrow("unknown error");
  });

  test("should throw error on invalid JSON response", async () => {
    const promise = client.request("test_cmd", {});
    dataCallback!(Buffer.from("invalid json"));
    endCallback!();

    await expect(promise).rejects.toThrow("invalid response");
  });

  test("request should send correct HTTP request", async () => {
    const mockBody = JSON.stringify({ ok: true, payload: {} });

    const promise = client.request("step_pet", { pet_id: "test" });
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    
    await promise;

    expect(mockRequest).toHaveBeenCalledWith(
      "http://localhost:8080/api",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
      expect.any(Function)
    );
    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "step_pet", payload: { pet_id: "test" } })
    );
    expect(mockReq.end).toHaveBeenCalled();
  });

  test("request should handle http errors", async () => {
    const error = new Error("connection refused");
    mockReq.on.mockImplementation((event: string, cb: Function) => {
      if (event === "error") cb(error);
    });

    await expect(client.request("test", {})).rejects.toThrow("connection refused");
    expect(client.connected).toBe(false);
  });

  test("request should handle HTTP error responses", async () => {
    const mockRes = {
      statusCode: 500,
      on: jest.fn((event: string, cb: Function) => {
        if (event === "data") cb("");
        if (event === "end") cb();
      }),
    };
    mockRequest.mockImplementation((url: any, opts: any, callback: any) => {
      if (callback) callback(mockRes);
      return mockReq;
    });

    await expect(client.request("test", {})).rejects.toThrow("invalid response");
    expect(client.connected).toBe(false);
  });

  test("requestRaw should handle non-200 status code with requireHttpOk", async () => {
    const mockRes = {
      statusCode: 404,
      on: jest.fn((event: string, cb: Function) => {
        if (event === "data") cb(Buffer.from("not found"));
        if (event === "end") cb();
      }),
    };
    mockRequest.mockImplementation((url: any, opts: any, callback: any) => {
      if (callback) callback(mockRes);
      return mockReq;
    });

    await expect(client.requestRaw("/any")).rejects.toThrow("backend returned HTTP 404");
    expect(client.connected).toBe(false);
  });

  test("loadPet should call correct endpoint", async () => {
    const mockBody = JSON.stringify({ ok: true, pet: { pngBase64: "abc" } });

    const promise = client.loadPet("../pets/sheep");
    dataCallback!(Buffer.from(mockBody));
    endCallback!();

    await promise;

    expect(mockRequest).toHaveBeenCalledWith(
      "http://localhost:8080/api/pet/load",
      expect.objectContaining({ method: "POST" }),
      expect.any(Function)
    );
  });

  test("health should call /api/health with GET", async () => {
    const mockBody = JSON.stringify({ ok: true, status: "ok" });
    const promise = client.health();
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockRequest).toHaveBeenCalledWith(
      "http://localhost:8080/api/health",
      expect.objectContaining({ method: "GET" }),
      expect.any(Function)
    );
  });

  test("version should call /api/version with GET", async () => {
    const mockBody = JSON.stringify({ ok: true, version: "1.0.0" });
    const promise = client.version();
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockRequest).toHaveBeenCalledWith(
      "http://localhost:8080/api/version",
      expect.objectContaining({ method: "GET" }),
      expect.any(Function)
    );
  });

  test("removePet should call remove_pet command", async () => {
    const mockBody = JSON.stringify({ ok: true });
    const promise = client.removePet("pet_1");
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "remove_pet", payload: { pet_id: "pet_1" } })
    );
  });

  test("dragPet should call drag_pet command", async () => {
    const mockBody = JSON.stringify({ ok: true });
    const promise = client.dragPet("pet_1", 100, 200);
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "drag_pet", payload: { pet_id: "pet_1", x: 100, y: 200 } })
    );
  });

  test("dropPet should call drop_pet command", async () => {
    const mockBody = JSON.stringify({ ok: true });
    const promise = client.dropPet("pet_1");
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "drop_pet", payload: { pet_id: "pet_1" } })
    );
  });

  test("setVolume should call set_volume command", async () => {
    const mockBody = JSON.stringify({ ok: true });
    const promise = client.setVolume(0.5);
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "set_volume", payload: { volume: 0.5 } })
    );
  });

  test("setScale should call set_scale command", async () => {
    const mockBody = JSON.stringify({ ok: true });
    const promise = client.setScale(2.0);
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "set_scale", payload: { scale: 2.0 } })
    );
  });

  test("getStatus should call get_status command", async () => {
    const mockBody = JSON.stringify({ ok: true, payload: { pet_count: 1 } });
    const promise = client.getStatus();
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    const result: any = await promise;

    expect(result.payload.pet_count).toBe(1);
    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "get_status", payload: {} })
    );
  });

  test("getSettings should call get_settings command", async () => {
    const mockBody = JSON.stringify({ ok: true, payload: { volume: 0.5 } });
    const promise = client.getSettings();
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "get_settings", payload: {} })
    );
  });

  test("setSettings should call set_settings command", async () => {
    const mockBody = JSON.stringify({ ok: true });
    const promise = client.setSettings({ volume: 0.8 });
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "set_settings", payload: { volume: 0.8 } })
    );
  });

  test("listPets should call list_pets command", async () => {
    const mockBody = JSON.stringify({ ok: true, payload: { pets: [] } });
    const promise = client.listPets();
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "list_pets", payload: {} })
    );
  });

  test("listActive should call list_active command", async () => {
    const mockBody = JSON.stringify({ ok: true, payload: { active: [] } });
    const promise = client.listActive();
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "list_active", payload: {} })
    );
  });

  test("addPet should call add_pet command", async () => {
    const mockBody = JSON.stringify({ ok: true, pet_id: "pet_1" });
    const promise = client.addPet("../pets/sheep", 1);
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "add_pet", payload: { pet_path: "../pets/sheep", spawn_id: 1 } })
    );
  });

  test("addPet should use default spawnId", async () => {
    const mockBody = JSON.stringify({ ok: true, pet_id: "pet_1" });
    const promise = client.addPet("../pets/sheep");
    dataCallback!(Buffer.from(mockBody));
    endCallback!();
    await promise;

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ command: "add_pet", payload: { pet_path: "../pets/sheep", spawn_id: 0 } })
    );
  });

  test("isConnected getter should return connected state", () => {
    expect(client.isConnected).toBe(false);
    client.connected = true;
    expect(client.isConnected).toBe(true);
  });

  test("should handle timeout", async () => {
    client = new BackendClient("http://localhost:8080", { timeoutMs: 100 });
    mockRequest.mockImplementation((url: any, opts: any, callback: any) => {
      // Don't call callback to simulate timeout
      return mockReq;
    });

    const promise = client.request("test", {});
    
    await expect(promise).rejects.toThrow("timed out");
    expect(client.connected).toBe(false);
  });
});
