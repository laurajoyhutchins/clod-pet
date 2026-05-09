import fs = require("fs");
import os = require("os");
import path = require("path");

const LOG_LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const logDir = process.env.CLOD_PET_LOG_DIR
  || defaultLogDir();
const logConfig = {
  maxBytes: parsePositiveInt(process.env.CLOD_PET_LOG_MAX_BYTES, 5 * 1024 * 1024),
  maxFiles: parsePositiveInt(process.env.CLOD_PET_LOG_MAX_FILES, 5),
};
const preparedFamilies = new Set<string>();

function defaultLogDir() {
  if (process.env.APPDATA) return path.join(process.env.APPDATA, "clod-pet", "logs");
  if (process.env.XDG_STATE_HOME) return path.join(process.env.XDG_STATE_HOME, "clod-pet", "logs");
  return path.join(os.homedir(), ".local", "state", "clod-pet", "logs");
}

class Logger {
  name: string;
  level: number;

  constructor(name: string, level = "info") {
    this.name = name;
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  }

  debug(...args: unknown[]) {
    this._write("debug", args);
  }

  info(...args: unknown[]) {
    this._write("info", args);
  }

  warn(...args: unknown[]) {
    this._write("warn", args);
  }

  error(...args: unknown[]) {
    this._write("error", args);
  }

  _write(level: string, args: unknown[]) {
    if (this.level > LOG_LEVELS[level]) return;

    const line = `[${new Date().toISOString()}] [${level}] [${this.name}] ${args.map(formatArg).join(" ")}`;
    const consoleMethod = (console as any)[level] || console.log;
    consoleMethod(`[${this.name}]`, ...args);

    try {
      writeLogEntry(path.join(logDir, `${this.name}.log`), line);
      writeLogEntry(path.join(logDir, "app.log"), line);
    } catch {
      // Logging must never break app startup.
    }
  }
}

function createLogger(name: string) {
  const isDebug = process.env.NODE_ENV === "development" || process.env.VERBOSE === "true";
  const envLevel = isDebug ? "debug" : "info";
  return new Logger(name, envLevel);
}

function formatArg(arg: unknown) {
  if (arg instanceof Error) return `${arg.message}\n${arg.stack || ""}`.trim();
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function getLogDir() {
  return logDir;
}

function writeLogEntry(filePath: string, line: string) {
  ensureLogDir();
  prepareLogFamily(filePath);

  const entry = `${line}\n`;
  const entrySize = Buffer.byteLength(entry);
  const currentSize = getFileSize(filePath);

  if (currentSize > 0 && currentSize + entrySize > logConfig.maxBytes) {
    rotateLogFile(filePath);
  }

  fs.appendFileSync(filePath, entry, "utf8");
}

function ensureLogDir() {
  fs.mkdirSync(logDir, { recursive: true });
}

function prepareLogFamily(filePath: string) {
  if (preparedFamilies.has(filePath)) return;
  cleanupRotatedLogs(filePath);
  preparedFamilies.add(filePath);
}

function cleanupRotatedLogs(filePath: string) {
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const pattern = new RegExp(`^${escapeRegExp(baseName)}\\.(\\d+)$`);

  for (const entry of fs.readdirSync(dir)) {
    const match = entry.match(pattern);
    if (!match) continue;

    const index = Number.parseInt(match[1] || "", 10);
    if (Number.isNaN(index) || index <= logConfig.maxFiles) continue;

    try {
      fs.unlinkSync(path.join(dir, entry));
    } catch {
      // Best-effort cleanup only.
    }
  }
}

function rotateLogFile(filePath: string) {
  if (logConfig.maxFiles < 1) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore rotation cleanup errors.
    }
    return;
  }

  const oldest = `${filePath}.${logConfig.maxFiles}`;
  try {
    fs.unlinkSync(oldest);
  } catch {
    // Ignore missing files.
  }

  for (let index = logConfig.maxFiles - 1; index >= 1; index--) {
    const source = `${filePath}.${index}`;
    const target = `${filePath}.${index + 1}`;
    if (!fs.existsSync(source)) continue;

    try {
      fs.unlinkSync(target);
    } catch {
      // Ignore missing files.
    }

    fs.renameSync(source, target);
  }

  try {
    fs.unlinkSync(`${filePath}.1`);
  } catch {
    // Ignore missing files.
  }

  if (fs.existsSync(filePath)) {
    fs.renameSync(filePath, `${filePath}.1`);
  }
}

function getFileSize(filePath: string) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export = { Logger, createLogger, getLogDir, LOG_LEVELS };
