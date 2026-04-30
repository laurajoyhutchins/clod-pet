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
});
