import { spawn, spawnSync } from "child_process";
import http = require("http");
import path = require("path");
import fs = require("fs");
import logger = require("./logger");
import { getBackendDir, getPetsDir } from "./project-paths";
import { WorldStore } from "./store";

const log = logger.createLogger("backend-manager");
const DEFAULT_READY_RETRIES_SOURCE = 60;
const DEFAULT_READY_RETRIES_EXE = 20;
const DEFAULT_READY_INTERVAL_MS = 500;
const DEFAULT_RESTART_BASE_DELAY_MS = 1000;
const DEFAULT_RESTART_MAX_DELAY_MS = 15000;
const DEFAULT_RESTART_MAX_ATTEMPTS = 3;

class BackendManager {
  process: any;
  url: string | null;
  port: number | null;
  petsDir: string;
  preferSource: boolean;
  lastStdout: string;
  lastStderr: string;
  lastError: string | null;
  exitCode: number | null;
  launch: any;
  readyTimer: any;
  restartTimer: any;
  state: string;
  ready: boolean;
  available: boolean;
  restartEnabled: boolean;
  restartAttempt: number;
  restartBaseDelayMs: number;
  restartMaxDelayMs: number;
  restartMaxAttempts: number;
  shuttingDown: boolean;
  fatalError: string | null;
  nextRestartAt: string | null;
  shutdownReason: string | null;
  exitReason: string | null;
  store: WorldStore | null;

  constructor(opts: { preferSource?: boolean; store?: WorldStore } = {}) {
    this.process = null;
    this.url = null;
    this.port = null;
    this.petsDir = process.env.PETS_DIR || getPetsDir();
    this.preferSource = opts.preferSource !== false;
    this.lastStdout = "";
    this.lastStderr = "";
    this.lastError = null;
    this.exitCode = null;
    this.launch = null;
    this.readyTimer = null;
    this.restartTimer = null;
    this.state = "idle";
    this.ready = false;
    this.available = false;
    this.restartEnabled = process.env.CLOD_PET_BACKEND_AUTO_RESTART === "1";
    this.restartAttempt = 0;
    this.restartBaseDelayMs = readPositiveIntEnv("CLOD_PET_BACKEND_RESTART_BASE_DELAY_MS") ?? DEFAULT_RESTART_BASE_DELAY_MS;
    this.restartMaxDelayMs = readPositiveIntEnv("CLOD_PET_BACKEND_RESTART_MAX_DELAY_MS") ?? DEFAULT_RESTART_MAX_DELAY_MS;
    this.restartMaxAttempts = readPositiveIntEnv("CLOD_PET_BACKEND_RESTART_MAX_ATTEMPTS") ?? DEFAULT_RESTART_MAX_ATTEMPTS;
    this.shuttingDown = false;
    this.fatalError = null;
    this.nextRestartAt = null;
    this.shutdownReason = null;
    this.exitReason = null;
    this.store = opts.store || null;

    this._syncStore();
  }

  _syncStore() {
    if (!this.store) return;
    this.store.setState({
      backend: {
        status: this.state as any,
        url: this.url,
        port: this.port,
        version: this.store.getState().backend.version,
        lastError: this.lastError,
        pid: this.process?.pid ?? this.launch?.pid ?? null,
        exitCode: this.exitCode,
        available: this.available,
        ready: this.ready,
        restartAttempt: this.restartAttempt,
        nextRestartAt: this.nextRestartAt,
      }
    });
  }

  async start(portOverride?: number) {
    this.shuttingDown = false;
    this.shutdownReason = null;
    this.exitReason = null;
    this.lastError = null;
    this.fatalError = null;
    this.available = false;
    this.ready = false;
    this.state = this.state === "restarting" ? "restarting" : "starting";
    this._syncStore();

    this._clearRestartTimer();

    let port = typeof portOverride === "number"
      ? portOverride
      : this.port ?? await this._findFreePort(8080);

    if (!port) throw new Error("unable to find a free backend port");
    this.port = port;

    // Double check if port is actually free (sometimes _findFreePort races)
    let isTaken = await this._isPortTaken(port);
    if (isTaken) {
      log.warn(`Port ${port} still appears taken, trying next...`);
      if (typeof portOverride === "number") {
        throw new Error(`backend port ${port} is still in use`);
      }
      port = await this._findFreePort(port + 1);
      this.port = port;
    }
    const backendPath = getBackendDir();
    const backendExe = this._resolveBackendBinary(backendPath);

    const backendMode = (process.env.CLOD_PET_BACKEND_MODE || "auto").toLowerCase();
    const exeExists = Boolean(backendExe);
    const useSource = backendMode === "source" || (backendMode !== "exe" && !exeExists && this.preferSource);
    const useExe = !useSource && exeExists;
    const cmd = useExe && backendExe ? backendExe : "go";
    const args = useExe ? [] : ["run", "."];

    this.launch = {
      cmd,
      args,
      cwd: backendPath,
      port,
      petsDir: this.petsDir,
      useExe,
      exeExists,
      backendMode,
      executionMode: useExe ? "binary" : "go-run",
      restartEnabled: this.restartEnabled,
    };

    this.process = spawn(cmd, args, {
      cwd: backendPath,
      env: { ...process.env, PORT: String(port), PETS_DIR: this.petsDir, VERBOSE: process.env.VERBOSE || "false" },
    });

    const pid = this.process.pid;
    this.url = `http://localhost:${port}`;
    this.launch.pid = pid;
    this._syncStore();
    log.info("starting backend", {
      ...this.launch,
      pid,
    });
    log.info("backend process spawned", {
      pid,
      executionMode: this.launch.executionMode,
      command: cmd,
      args,
      url: this.url,
    });

    this.process.stdout.on("data", (d: Buffer) => {
      this.lastStdout = appendRecent(this.lastStdout, d.toString());
      log.debug("backend stdout:", d.toString().trim());
    });
    this.process.stderr.on("data", (d: Buffer) => {
      const stderr = d.toString();
      this.lastStderr = appendRecent(this.lastStderr, stderr);

      for (const line of stderr.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || shouldSuppressBackendStderr(trimmed)) continue;
        log.warn("backend stderr:", trimmed);
      }
    });
    this.process.on("error", (err: Error) => {
      this.lastError = err.message;
      this.available = false;
      this.state = "spawn_error";
      this.exitReason = `spawn error: ${err.message}`;
      this._syncStore();
      log.error("spawn error:", { pid, err });
    });
    this.process.on("close", (code: number) => {
      this.exitCode = code;
      if (this.readyTimer) {
        clearTimeout(this.readyTimer);
        this.readyTimer = null;
      }
      this.process = null;
      if (this.ready && !this.shuttingDown) {
        const message = code === null || code === undefined
          ? "backend exited unexpectedly"
          : `backend exited unexpectedly with code ${code}`;
        this.lastError = message;
        this.fatalError = message;
        this.exitReason = message;
        this.available = false;
        this.ready = false;
        this.state = this.restartEnabled ? "restarting" : "fatal";
        this._syncStore();
        log.error("backend exited after readiness", {
          pid,
          code,
          reason: message,
          restartEnabled: this.restartEnabled,
        });
        if (this.restartEnabled) {
          this._scheduleRestart(code);
        }
        return;
      }

      if (!this.shuttingDown) {
        const message = code === null || code === undefined
          ? "backend exited before readiness"
          : `backend exited before readiness with code ${code}`;
        this.lastError = message;
        this.fatalError = message;
        this.exitReason = message;
        this.available = false;
        this.ready = false;
        this.state = "failed";
        this._syncStore();
        log.error("backend exited before readiness", {
          pid,
          code,
          reason: message,
        });
      } else {
        this.state = "stopped";
        this._syncStore();
      }
    });

    const readyTimeout = this._getReadyTimeout(cmd);
    await this._waitForReady(readyTimeout.maxRetries, readyTimeout.interval);
    this.ready = true;
    this.available = true;
    this.state = "ready";
    this.restartAttempt = 0;
    this.nextRestartAt = null;
    this._syncStore();
    log.info("backend ready", {
      pid,
      url: this.url,
      executionMode: this.launch?.executionMode,
    });
    return this.url;
  }

  _getReadyTimeout(cmd: string) {
    const maxRetriesEnv = readPositiveIntEnv("CLOD_PET_BACKEND_READY_MAX_RETRIES");
    const intervalEnv = readPositiveIntEnv("CLOD_PET_BACKEND_READY_INTERVAL_MS");

    return {
      maxRetries: maxRetriesEnv ?? (cmd === "go" ? DEFAULT_READY_RETRIES_SOURCE : DEFAULT_READY_RETRIES_EXE),
      interval: intervalEnv ?? DEFAULT_READY_INTERVAL_MS,
    };
  }

  _resolveBackendBinary(backendPath: string) {
    const explicitPath = process.env.CLOD_PET_BACKEND_PATH;
    if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;

    const binPath = path.join(backendPath, "bin");
    const names = process.platform === "win32"
      ? ["clod-pet-backend.exe", "clod-pet.exe"]
      : ["clod-pet-backend", "clod-pet"];

    for (const name of names) {
      const candidate = path.join(binPath, name);
      if (fs.existsSync(candidate)) return candidate;
    }

    for (const name of names) {
      const candidate = path.join(backendPath, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  stop() {
    this.stopWithReason("manual stop");
  }

  stopWithReason(reason: string) {
    this.shuttingDown = true;
    this.shutdownReason = reason;
    this.ready = false;
    this.available = false;
    this.state = "stopped";
    this._syncStore();
    this._clearRestartTimer();
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    const pid = this.process?.pid ?? this.launch?.pid ?? null;
    log.info("stopping backend", {
      pid,
      reason,
      url: this.url,
      executionMode: this.launch?.executionMode,
    });
    if (this.process) {
      this.process.removeAllListeners();
      this.process.stdout.removeAllListeners();
      this.process.stderr.removeAllListeners();

      if (process.platform === "win32") {
        // Use taskkill to ensure child processes (like the actual backend binary) are killed
        try {
          const result = spawnSync("taskkill", ["/F", "/T", "/PID", this.process.pid.toString()], { stdio: "pipe" });
          if (result.error) {
            log.error("taskkill failed", { pid, reason, error: result.error.message });
          } else if (typeof result.status === "number" && result.status !== 0) {
            log.error("taskkill exited nonzero", {
              pid,
              reason,
              status: result.status,
              signal: result.signal,
              stderr: result.stderr ? result.stderr.toString().trim() : "",
            });
          } else {
            log.info("taskkill completed", { pid, reason });
          }
        } catch (err) {
          log.error("taskkill error:", err);
        }
      } else {
        this.process.kill("SIGTERM");
      }
      this.process = null;
    }

    this.url = null;
    this.port = null;
    this.launch = null;
    this.lastStdout = "";
    this.lastStderr = "";
    this.lastError = null;
    this.exitCode = null;
    this.fatalError = null;
    this.nextRestartAt = null;
    this.restartAttempt = 0;
    this.exitReason = null;
    this._syncStore();
  }

  getDiagnostics() {
    return {
      url: this.url,
      port: this.port,
      pid: this.process?.pid ?? this.launch?.pid ?? null,
      launch: this.launch,
      lastStdout: this.lastStdout,
      lastStderr: this.lastStderr,
      lastError: this.lastError,
      exitCode: this.exitCode,
      running: Boolean(this.process && (this.process.exitCode === null || this.process.exitCode === undefined)),
      state: this.state,
      ready: this.ready,
      available: this.available,
      restartEnabled: this.restartEnabled,
      restartAttempt: this.restartAttempt,
      restartMaxAttempts: this.restartMaxAttempts,
      nextRestartAt: this.nextRestartAt,
      fatalError: this.fatalError,
      shutdownReason: this.shutdownReason,
      exitReason: this.exitReason,
    };
  }

  _findFreePort(startPort: number, maxAttempts = 10): Promise<number> {
    return new Promise((resolve, reject) => {
      let port = startPort;
      let attempts = 0;

      const tryPort = () => {
        const server = require("net").createServer();
        // Don't specify host to check availability on all interfaces
        server.listen(port, () => server.close(() => resolve(port)));
        server.on("error", () => {
          attempts++;
          if (attempts >= maxAttempts) reject(new Error(`no free port found starting at ${startPort}`));
          else { port++; tryPort(); }
        });
      };
      tryPort();
    });
  }

  _isPortTaken(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = require("net").createServer();
      server.once("error", (err: any) => {
        if (err.code === "EADDRINUSE") resolve(true);
        else resolve(false);
      });
      server.once("listening", () => {
        server.close();
        resolve(false);
      });
      // Don't specify host to check availability on all interfaces
      server.listen(port);
    });
  }

  _waitForReady(maxRetries = 20, interval = 500) {
    return new Promise((resolve, reject) => {
      let retries = 0;
      let settled = false;
      const processRef = this.process;

      const cleanup = () => {
        if (this.readyTimer) {
          clearTimeout(this.readyTimer);
          this.readyTimer = null;
        }
        if (processRef) {
          processRef.removeListener("close", onClose);
          processRef.removeListener("error", onError);
        }
      };

      const finishResolve = (value: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const finishReject = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const onClose = (code: number) => {
        finishReject(new Error(code === null || code === undefined
          ? "backend exited before becoming ready"
          : `backend exited before becoming ready with code ${code}`));
      };

      const onError = (err: Error) => {
        finishReject(err);
      };

      if (!processRef) {
        finishReject(new Error("backend exited before becoming ready"));
        return;
      }

      processRef.once("close", onClose);
      processRef.once("error", onError);

      const check = () => {
        if (settled) return;
        if ((this.state === "starting" || this.state === "restarting") && this.exitCode !== null && this.exitCode !== undefined) {
          finishReject(new Error("backend exited before becoming ready"));
          return;
        }
        http.get(`${this.url}/api/health`, (res) => {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => {
            if (settled) return;
            if (res.statusCode === 200) finishResolve(body);
            else retryOrFail();
          });
        }).on("error", () => {
          if (settled) return;
          retryOrFail();
        });
      };
      const retryOrFail = () => {
        if (settled) return;
        retries++;
        if ((this.state === "starting" || this.state === "restarting") && this.exitCode !== null && this.exitCode !== undefined) {
          finishReject(new Error("backend exited before becoming ready"));
        }
        else if (retries >= maxRetries) finishReject(new Error("backend failed to start"));
        else this.readyTimer = setTimeout(check, interval);
      };
      check();
    });
  }

  _scheduleRestart(code: number | null) {
    if (this.shuttingDown || !this.restartEnabled) return;
    if (this.restartAttempt >= this.restartMaxAttempts) {
      this.state = "fatal";
      this.available = false;
      this.fatalError = this.lastError || (code === null || code === undefined
        ? "backend exited unexpectedly"
        : `backend exited unexpectedly with code ${code}`);
      log.error("backend restart limit reached", { attempts: this.restartAttempt, fatalError: this.fatalError });
      return;
    }

    const delay = Math.min(this.restartBaseDelayMs * Math.pow(2, this.restartAttempt), this.restartMaxDelayMs);
    this.restartAttempt += 1;
    this.state = "restarting";
    this.available = false;
    this.nextRestartAt = new Date(Date.now() + delay).toISOString();
    this._syncStore();
      log.warn("scheduling backend restart", {
        pid: this.process?.pid ?? this.launch?.pid ?? null,
        delay,
        attempt: this.restartAttempt,
        maxAttempts: this.restartMaxAttempts,
        reason: code === null || code === undefined
          ? "unexpected exit"
          : `unexpected exit code ${code}`,
      });

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      if (this.shuttingDown) return;

      try {
        await this.start(this.port ?? undefined);
        this.restartAttempt = 0;
        this.fatalError = null;
        this._syncStore();
      } catch (err: any) {
        this.lastError = err.message;
        this.fatalError = err.message;
        this.available = false;
        this.state = "fatal";
        this._syncStore();
        log.error("backend restart failed", { pid: this.process?.pid ?? this.launch?.pid ?? null, err });
      }
    }, delay);
  }

  _clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.nextRestartAt = null;
    this._syncStore();
  }
}

function appendRecent(current: string, chunk: string, maxLength = 8000) {
  const next = current + chunk;
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

function readPositiveIntEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return null;

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return null;

  return value;
}

function shouldSuppressBackendStderr(line: string) {
  if (process.env.VERBOSE === "true") return false;
  if (!line.startsWith("{")) return false;

  try {
    const entry = JSON.parse(line);
    return entry?.level === "DEBUG";
  } catch {
    return false;
  }
}

export = BackendManager;
