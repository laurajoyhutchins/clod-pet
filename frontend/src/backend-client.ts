import http = require("http");

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

  async request(command: string, payload: Record<string, unknown> = {}) {
    const result = await this._requestJson("/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, payload }),
      requireOk: true,
    });
    return result;
  }

  async requestRaw(path: string, method = "GET") {
    return this._requestJson(path, { method, requireHttpOk: true });
  }

  _requestJson(path: string, opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    requireOk?: boolean;
    requireHttpOk?: boolean;
  } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const finish = (fn: (value?: any) => void, value?: any) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        fn(value);
      };

      const req = http.request(`${this.baseUrl}${path}`, {
        method: opts.method || "GET",
        headers: opts.headers,
      }, (res) => {
        let body = "";
        res.on("data", (chunk) => body += chunk);
        res.on("end", () => {
          if (opts.requireHttpOk && res.statusCode !== 200) {
            this.connected = false;
            finish(reject, new Error(`backend returned HTTP ${res.statusCode}`));
            return;
          }

          try {
            const result = JSON.parse(body);
            if (opts.requireOk && !result.ok) {
              this.connected = false;
              finish(reject, new Error(result.error || "unknown error"));
              return;
            }
            this.connected = true;
            finish(resolve, result);
          } catch {
            finish(reject, new Error("invalid response"));
          }
        });
      });

      timer = setTimeout(() => {
        this.connected = false;
        req.destroy(new Error(`backend request timed out after ${this.timeoutMs}ms`));
        finish(reject, new Error(`backend request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      req.on("error", (err) => {
        this.connected = false;
        finish(reject, err);
      });

      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  async health() {
    return this.requestRaw("/api/health", "GET");
  }

  async version() {
    return this.requestRaw("/api/version", "GET");
  }

  async loadPet(petPath: string) {
    return this._requestJson("/api/pet/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pet_path: petPath }),
      requireOk: true,
    });
  }

  async removePet(petId: string) {
    return this.request("remove_pet", { pet_id: petId });
  }

  async dragPet(petId: string, x: number, y: number) {
    return this.request("drag_pet", { pet_id: petId, x, y });
  }

  async dropPet(petId: string) {
    return this.request("drop_pet", { pet_id: petId });
  }

  async setVolume(volume: number) {
    return this.request("set_volume", { volume });
  }

  async setScale(scale: number) {
    return this.request("set_scale", { scale });
  }

  async getStatus() {
    return this.request("get_status");
  }

  async getSettings() {
    return this.request("get_settings");
  }

  async setSettings(settings: Record<string, unknown>) {
    return this.request("set_settings", settings);
  }

  async listPets() {
    return this.request("list_pets");
  }

  async listActive() {
    return this.request("list_active");
  }

  async addPet(petPath: string, spawnId = 0) {
    return this.request("add_pet", { pet_path: petPath, spawn_id: spawnId });
  }
}

export = BackendClient;
