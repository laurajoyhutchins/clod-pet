"use strict";
const child_process_1 = require("child_process");
const http = require("http");
const path = require("path");
const logger = require("./logger");
const log = logger.createLogger("backend-manager");
class BackendManager {
    constructor(opts = {}) {
        this.process = null;
        this.url = null;
        this.petsDir = process.env.PETS_DIR || path.join(__dirname, "..", "..", "pets");
        this.preferSource = opts.preferSource !== false;
        this.lastStdout = "";
        this.lastStderr = "";
        this.lastError = null;
        this.exitCode = null;
        this.launch = null;
        this.readyTimer = null;
    }
    async start() {
        const port = await this._findFreePort(8080);
        if (!port)
            throw new Error("unable to find a free backend port");
        const backendPath = path.join(__dirname, "..", "..", "backend");
        const backendExe = path.join(backendPath, "clod-pet.exe");
        const backendMode = process.env.CLOD_PET_BACKEND_MODE || "";
        const exeExists = require("fs").existsSync(backendExe);
        const useExe = backendMode === "exe" || (backendMode !== "source" && !this.preferSource && exeExists);
        const cmd = useExe ? backendExe : "go";
        const args = useExe ? [] : ["run", "."];
        this.launch = { cmd, args, cwd: backendPath, port, petsDir: this.petsDir, useExe, exeExists };
        log.info("starting backend", this.launch);
        this.process = (0, child_process_1.spawn)(cmd, args, {
            cwd: backendPath,
            env: { ...process.env, PORT: String(port), PETS_DIR: this.petsDir, VERBOSE: "true" },
        });
        this.url = `http://localhost:${port}`;
        this.process.stdout.on("data", (d) => {
            this.lastStdout = appendRecent(this.lastStdout, d.toString());
            log.debug("backend stdout:", d.toString().trim());
        });
        this.process.stderr.on("data", (d) => {
            this.lastStderr = appendRecent(this.lastStderr, d.toString());
            log.warn("backend stderr:", d.toString().trim());
        });
        this.process.on("error", (err) => {
            this.lastError = err.message;
            log.error("spawn error:", err);
        });
        this.process.on("close", (code) => {
            this.exitCode = code;
            log.error("backend exited", { code });
        });
        await this._waitForReady();
        log.info("backend ready", { url: this.url });
        return this.url;
    }
    stop() {
        if (this.readyTimer) {
            clearTimeout(this.readyTimer);
            this.readyTimer = null;
        }
        if (this.process) {
            this.process.removeAllListeners();
            this.process.stdout.removeAllListeners();
            this.process.stderr.removeAllListeners();
            this.process.kill("SIGTERM");
            this.process = null;
        }
    }
    getDiagnostics() {
        return {
            url: this.url,
            launch: this.launch,
            lastStdout: this.lastStdout,
            lastStderr: this.lastStderr,
            lastError: this.lastError,
            exitCode: this.exitCode,
            running: Boolean(this.process && this.process.exitCode === null),
        };
    }
    _findFreePort(startPort, maxAttempts = 10) {
        return new Promise((resolve, reject) => {
            let port = startPort;
            let attempts = 0;
            const tryPort = () => {
                const server = require("net").createServer();
                server.listen(port, "127.0.0.1", () => server.close(() => resolve(port)));
                server.on("error", () => {
                    attempts++;
                    if (attempts >= maxAttempts)
                        reject(new Error(`no free port found starting at ${startPort}`));
                    else {
                        port++;
                        tryPort();
                    }
                });
            };
            tryPort();
        });
    }
    _waitForReady(maxRetries = 20, interval = 500) {
        return new Promise((resolve, reject) => {
            let retries = 0;
            const check = () => {
                http.get(`${this.url}/api/health`, (res) => {
                    let body = "";
                    res.on("data", (d) => (body += d));
                    res.on("end", () => {
                        if (res.statusCode === 200)
                            resolve(body);
                        else
                            retryOrFail();
                    });
                }).on("error", () => {
                    retryOrFail();
                });
            };
            const retryOrFail = () => {
                retries++;
                if (retries >= maxRetries)
                    reject(new Error("backend failed to start"));
                else
                    this.readyTimer = setTimeout(check, interval);
            };
            check();
        });
    }
}
function appendRecent(current, chunk, maxLength = 8000) {
    const next = current + chunk;
    return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}
module.exports = BackendManager;
