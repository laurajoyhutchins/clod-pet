import http = require("http");
import crypto = require("crypto");
import type { ChatMessage, ChatStreamEvent, BackendResponse, AppSettings, PetData, BackendWorldContext } from "../shared/store";

const REQUEST_ID_HEADER = "X-Request-Id";

class BackendClient {
  baseUrl: string;
  connected: boolean;
  timeoutMs: number;

  constructor(baseUrl = "http://localhost:8080", opts: { timeoutMs?: number } = {}) {
    this.baseUrl = baseUrl;
    this.connected = false;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  get isConnected() {
    return this.connected;
  }

  async request<T = unknown>(command: string, payload: Record<string, unknown> = {}): Promise<BackendResponse<T>> {
    const requestId = this._nextRequestId();
    const result = await this._requestJson<BackendResponse<T>>("/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [REQUEST_ID_HEADER]: requestId,
      },
      body: JSON.stringify({ command, payload }),
      requireOk: true,
      requestId,
    });
    return result;
  }

  async requestRaw(path: string, method = "GET"): Promise<unknown> {
    const requestId = this._nextRequestId();
    return this._requestJson(path, { method, requireHttpOk: true, requestId, headers: { [REQUEST_ID_HEADER]: requestId } });
  }

  _requestJson<T = unknown>(path: string, opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    requireOk?: boolean;
    requireHttpOk?: boolean;
    requestId?: string;
  } = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      let req: http.ClientRequest;
      const requestId = opts.requestId || this._nextRequestId();
      const finish = (fn: (value?: any) => void, value?: any) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn(value);
      };

      timer = setTimeout(() => {
        this.connected = false;
        const timeoutErr = this._decorateError(`backend request timed out after ${this.timeoutMs}ms`, requestId);
        req.destroy(timeoutErr);
        finish(reject, timeoutErr);
      }, this.timeoutMs);

      req = http.request(`${this.baseUrl}${path}`, {
        method: opts.method || "GET",
        headers: {
          ...(opts.headers || {}),
          [REQUEST_ID_HEADER]: requestId,
        },
      }, (res) => {
        const responseRequestId = this._readResponseRequestId(res) || requestId;
        let body = "";
        res.on("data", (chunk) => body += chunk);
        res.on("end", () => {
          if (opts.requireHttpOk && res.statusCode !== 200) {
            this.connected = false;
            finish(reject, this._decorateError(`backend returned HTTP ${res.statusCode}`, responseRequestId));
            return;
          }

          try {
            const result = JSON.parse(body) as any;
            if (opts.requireOk && !result.ok) {
              this.connected = false;
              finish(reject, this._decorateError(result.error || "unknown error", result.request_id || responseRequestId));
              return;
            }
            if (result && typeof result === "object" && !result.request_id) {
              result.request_id = responseRequestId;
            }
            this.connected = true;
            finish(resolve, result as T);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            finish(reject, this._decorateError(`invalid response: ${error.message}`, responseRequestId));
          }
        });
      });

      req.on("error", (err) => {
        this.connected = false;
        finish(reject, this._decorateError(err instanceof Error ? err.message : String(err), requestId));
      });

      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  async health(): Promise<unknown> {
    return this.requestRaw("/api/health", "GET");
  }

  async version(): Promise<unknown> {
    return this.requestRaw("/api/version", "GET");
  }

  async loadPet(petPath: string): Promise<PetData> {
    const requestId = this._nextRequestId();
    const response = await this._requestJson<BackendResponse<PetData>>("/api/pet/load", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [REQUEST_ID_HEADER]: requestId,
      },
      body: JSON.stringify({ pet_path: petPath }),
      requireOk: true,
      requestId,
    });

    if (!response.payload) {
      throw new Error("invalid pet response: missing payload");
    }

    return response.payload;
  }

  async removePet(petId: string): Promise<BackendResponse> {
    return this.request("remove_pet", { pet_id: petId });
  }

  async dragPet(petId: string, x: number, y: number): Promise<BackendResponse> {
    return this.request("drag_pet", { pet_id: petId, x, y });
  }

  async dropPet(petId: string): Promise<BackendResponse> {
    return this.request("drop_pet", { pet_id: petId });
  }

  async setVolume(volume: number): Promise<BackendResponse> {
    return this.request("set_volume", { volume });
  }

  async setScale(scale: number): Promise<BackendResponse> {
    return this.request("set_scale", { scale });
  }

  async setGravityFactor(gravity: number): Promise<BackendResponse> {
    return this.setSettings({ GravityFactor: gravity });
  }

  async getStatus(): Promise<BackendResponse> {
    return this.request("get_status");
  }

  async getSettings(): Promise<BackendResponse<AppSettings>> {
    return this.request<AppSettings>("get_settings");
  }

  async setSettings(settings: Record<string, unknown>): Promise<BackendResponse> {
    return this.request("set_settings", settings);
  }

  async listPets(): Promise<BackendResponse> {
    return this.request("list_pets");
  }

  async listActive(): Promise<BackendResponse> {
    return this.request("list_active");
  }

  async addPet(petPath: string, spawnId = 0, world?: BackendWorldContext): Promise<BackendResponse> {
    return this.request("add_pet", {
      pet_path: petPath,
      spawn_id: spawnId,
      ...(world ? { world } : {}),
    });
  }

  async setPosition(petId: string, x: number, y: number): Promise<BackendResponse> {
    return this.request("set_position", { pet_id: petId, x, y });
  }

  async stepPet(petId: string, world: BackendWorldContext): Promise<BackendResponse> {
    return this.request("step_pet", { pet_id: petId, world });
  }

  async chat(messages: ChatMessage[], stream = false): Promise<BackendResponse> {
    return this.request("llm_chat", { messages, stream });
  }

  async streamChat(messages: ChatMessage[], onEvent: (event: ChatStreamEvent) => void) {
    const requestId = this._nextRequestId();
    const response = await fetch(`${this.baseUrl}/api/llm/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [REQUEST_ID_HEADER]: requestId,
      },
      body: JSON.stringify({ messages, stream: true }),
    });

    if (!response.ok) {
      const responseRequestId = this._headerValue(response.headers.get(REQUEST_ID_HEADER)) || requestId;
      throw this._decorateError(`stream request failed: ${response.statusText}`, responseRequestId);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("no reader");

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          currentEvent = "";
          continue;
        }

        if (trimmed.startsWith("event: ")) {
          currentEvent = trimmed.slice(7);
          if (currentEvent === "done") {
            onEvent({ done: true });
          }
        } else if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (currentEvent === "error") {
            onEvent({ error: data });
          } else if (currentEvent !== "done") {
            const content = data.replace(/\\n/g, "\n");
            onEvent({ content });
          }
        }
      }
    }
  }

  private _nextRequestId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
    }
  }

  private _decorateError(message: string, requestId?: string): Error {
    if (!requestId) return new Error(message);
    return new Error(`${message} [request_id=${requestId}]`);
  }

  private _readResponseRequestId(res: http.IncomingMessage): string | undefined {
    const header = this._headerValue(res.headers?.[REQUEST_ID_HEADER.toLowerCase()]);
    return header || undefined;
  }

  private _headerValue(value: string | string[] | null | undefined): string | undefined {
    if (Array.isArray(value)) return value[0];
    if (typeof value === "string" && value.trim()) return value;
    return undefined;
  }
}

export = BackendClient;
