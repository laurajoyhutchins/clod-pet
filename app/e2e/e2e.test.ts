import { spawn, execFileSync } from "child_process";
import http from "http";
import net from "net";
import path from "path";

const BACKEND_DIR = path.join(__dirname, "../../backend");
const PET_PATH = path.join(__dirname, "../../pets/esheep64");

interface ApiResponse {
  status: number;
  body: any;
}

interface BackendOutput {
  stdout: string;
  stderr: string;
  exit: { code: number | null; signal: string | null } | null;
}

interface BackendContext {
  backend: ReturnType<typeof spawn>;
  url: string;
  output: BackendOutput;
}

function apiRequest(baseUrl: string, endpoint: string, method: string, data?: any): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const req = http.request(`${baseUrl}${endpoint}`, {
      method,
      headers: body ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      } : {},
    }, (res) => {
      let responseData = "";
      res.on("data", (chunk) => { responseData += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(responseData) });
        } catch (err) {
          reject(new Error(`invalid JSON from ${endpoint}: ${responseData}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function startBackend(): Promise<BackendContext> {
  const port = await findFreePort();
  const url = `http://localhost:${port}`;
  const output: BackendOutput = { stdout: "", stderr: "", exit: null };
  const backend = spawn("go", ["run", "."], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(port), PETS_DIR: path.dirname(PET_PATH), VERBOSE: "true" },
    stdio: "pipe",
  });

  backend.stdout.on("data", (d) => { output.stdout += d.toString(); });
  backend.stderr.on("data", (d) => { output.stderr += d.toString(); });
  backend.on("exit", (code, signal) => { output.exit = { code, signal: signal || null }; });

  try {
    await waitForBackend(url, output);
  } catch (err: any) {
    stopBackend(backend);
    err.message += `\nbackend stdout:\n${output.stdout}\nbackend stderr:\n${output.stderr}`;
    throw err;
  }

  return { backend, url, output };
}

function waitForBackend(url: string, output: BackendOutput, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (output.exit) {
        reject(new Error(`backend exited before ready: ${JSON.stringify(output.exit)}`));
        return;
      }

      http.get(`${url}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error(`backend health check timeout, last status ${res.statusCode}`));
        } else {
          setTimeout(check, 250);
        }
      }).on("error", () => {
        if (Date.now() - start > timeout) {
          reject(new Error("backend health check timeout"));
        } else {
          setTimeout(check, 250);
        }
      });
    };
    check();
  });
}

function stopBackend(backend: ReturnType<typeof spawn>): void {
  if (!backend || backend.killed) return;
  if (process.platform === "win32" && backend.pid) {
    try {
      execFileSync("taskkill.exe", ["/pid", String(backend.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to regular kill.
    }
  }
  backend.kill();
}

describe("E2E Tests - Backend API", () => {
  let ctx: BackendContext | undefined;
  let petId: string;

  beforeAll(async () => {
    ctx = await startBackend();
  }, 20000);

  afterAll(() => {
    stopBackend(ctx?.backend);
  });

  test("health endpoint returns ok envelope", async () => {
    const res = await apiRequest(ctx!.url, "/api/health", "GET");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(["ok", "degraded"]).toContain(res.body.status);
  });

  test("version endpoint exposes debug paths", async () => {
    const res = await apiRequest(ctx!.url, "/api/version", "GET");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.pets_dir).toBe(path.dirname(PET_PATH));
  });

  test("load pet from esheep64", async () => {
    const res = await apiRequest(ctx!.url, "/api/pet/load", "POST", { pet_path: PET_PATH });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.payload.title).toBeDefined();
    expect(res.body.payload.tiles_x).toBeGreaterThan(0);
    expect(res.body.payload.tiles_y).toBeGreaterThan(0);
    expect(res.body.payload.png_base64.length).toBeGreaterThan(100);
  });

  test("add pet and get status", async () => {
    const addRes = await apiRequest(ctx!.url, "/api", "POST", {
      command: "add_pet",
      payload: { pet_path: PET_PATH, spawn_id: 1 },
    });
    expect(addRes.status).toBe(200);
    expect(addRes.body.ok).toBe(true);
    expect(addRes.body.payload.pet_id).toBeDefined();
    petId = addRes.body.payload.pet_id;

    const statusRes = await apiRequest(ctx!.url, "/api", "POST", { command: "get_status" });
    expect(statusRes.body.ok).toBe(true);
    expect(statusRes.body.payload.pet_count).toBeGreaterThan(0);
  });

  test("step pet returns valid state", async () => {
    const stepRes = await apiRequest(ctx!.url, "/api", "POST", {
      command: "step_pet",
      payload: { pet_id: petId, border_ctx: 0 },
    });
    expect(stepRes.status).toBe(200);
    expect(stepRes.body.ok).toBe(true);
    expect(stepRes.body.payload.pet_id).toBe(petId);
    expect(stepRes.body.payload.frame_index).toBeDefined();
    expect(stepRes.body.payload.x).toBeDefined();
    expect(stepRes.body.payload.y).toBeDefined();
  });

  test("drag and drop pet", async () => {
    const dragRes = await apiRequest(ctx!.url, "/api", "POST", {
      command: "drag_pet",
      payload: { pet_id: petId, x: 500, y: 300 },
    });
    expect(dragRes.status).toBe(200);
    expect(dragRes.body.ok).toBe(true);

    const dropRes = await apiRequest(ctx!.url, "/api", "POST", {
      command: "drop_pet",
      payload: { pet_id: petId },
    });
    expect(dropRes.status).toBe(200);
    expect(dropRes.body.ok).toBe(true);
  });

  test("border pet detection", async () => {
    const borderRes = await apiRequest(ctx!.url, "/api", "POST", {
      command: "border_pet",
      payload: { pet_id: petId, direction: 1 },
    });
    expect(borderRes.status).toBe(200);
    expect(borderRes.body.ok).toBe(true);
  });

  test("remove pet", async () => {
    const removeRes = await apiRequest(ctx!.url, "/api", "POST", {
      command: "remove_pet",
      payload: { pet_id: petId },
    });
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.ok).toBe(true);

    const statusRes = await apiRequest(ctx!.url, "/api", "POST", { command: "get_status" });
    expect(statusRes.body.payload.pet_count).toBe(0);
  });

  test("invalid command returns error", async () => {
    const res = await apiRequest(ctx!.url, "/api", "POST", { command: "invalid_command" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});

describe("E2E Tests - Multiple Pets", () => {
  let ctx: BackendContext | undefined;

  beforeAll(async () => {
    ctx = await startBackend();
  }, 20000);

  afterAll(() => {
    stopBackend(ctx?.backend);
  });

  test("add multiple pets and verify count", async () => {
    await apiRequest(ctx!.url, "/api", "POST", {
      command: "add_pet",
      payload: { pet_path: PET_PATH, spawn_id: 1 },
    });

    await apiRequest(ctx!.url, "/api", "POST", {
      command: "add_pet",
      payload: { pet_path: PET_PATH, spawn_id: 2 },
    });

    const statusRes = await apiRequest(ctx!.url, "/api", "POST", { command: "get_status" });
    expect(statusRes.body.payload.pet_count).toBe(2);
  });
});
