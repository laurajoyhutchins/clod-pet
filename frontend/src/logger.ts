import fs = require("fs");
import path = require("path");

const LOG_LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const logDir = process.env.CLOD_PET_LOG_DIR
  || path.join(process.env.APPDATA || process.cwd(), "clod-pet", "logs");

class Logger {
  name: string;
  level: number;

  constructor(name: string, level = "info") {
    this.name = name;
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  }

  debug(...args) {
    this._write("debug", args);
  }

  info(...args) {
    this._write("info", args);
  }

  warn(...args) {
    this._write("warn", args);
  }

  error(...args) {
    this._write("error", args);
  }

  _write(level: string, args: unknown[]) {
    if (this.level > LOG_LEVELS[level]) return;

    const line = `[${new Date().toISOString()}] [${level}] [${this.name}] ${args.map(formatArg).join(" ")}`;
    const consoleMethod = console[level] || console.log;
    consoleMethod(`[${this.name}]`, ...args);

    try {
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, `${this.name}.log`), line + "\n");
      fs.appendFileSync(path.join(logDir, "app.log"), line + "\n");
    } catch {
      // Logging must never break app startup.
    }
  }
}

function createLogger(name: string) {
  const envLevel = process.env.NODE_ENV === "development" ? "debug" : "info";
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

export = { Logger, createLogger, getLogDir, LOG_LEVELS };
