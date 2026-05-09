import fs = require("fs");
import os = require("os");
import path = require("path");

const originalEnv = {
  CLOD_PET_LOG_DIR: process.env.CLOD_PET_LOG_DIR,
  CLOD_PET_LOG_MAX_BYTES: process.env.CLOD_PET_LOG_MAX_BYTES,
  CLOD_PET_LOG_MAX_FILES: process.env.CLOD_PET_LOG_MAX_FILES,
  NODE_ENV: process.env.NODE_ENV,
  VERBOSE: process.env.VERBOSE,
};

describe("logger rotation", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clod-pet-logs-"));
    process.env.CLOD_PET_LOG_DIR = tempDir;
    process.env.CLOD_PET_LOG_MAX_BYTES = "180";
    process.env.CLOD_PET_LOG_MAX_FILES = "2";
    process.env.NODE_ENV = "production";
    delete process.env.VERBOSE;
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    restoreEnv();
  });

  it("rotates module and app logs when they exceed the size limit", () => {
    const logger = require("./logger");
    jest.spyOn(console, "info").mockImplementation(() => undefined);

    const log = logger.createLogger("alpha");
    log.info("first", "x".repeat(90));
    log.info("second", "y".repeat(90));
    log.info("third", "z".repeat(90));

    const alphaCurrent = fs.readFileSync(path.join(tempDir, "alpha.log"), "utf8");
    const alphaRotated = fs.readFileSync(path.join(tempDir, "alpha.log.1"), "utf8");
    const alphaArchived = fs.readFileSync(path.join(tempDir, "alpha.log.2"), "utf8");
    const appCurrent = fs.readFileSync(path.join(tempDir, "app.log"), "utf8");
    const appRotated = fs.readFileSync(path.join(tempDir, "app.log.1"), "utf8");
    const appArchived = fs.readFileSync(path.join(tempDir, "app.log.2"), "utf8");

    expect(alphaArchived).toContain("first");
    expect(appArchived).toContain("first");
    expect(alphaRotated).toContain("second");
    expect(appRotated).toContain("second");
    expect(alphaCurrent).toContain("third");
    expect(appCurrent).toContain("third");
    expect(fs.existsSync(path.join(tempDir, "alpha.log.3"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "app.log.3"))).toBe(false);
  });

  it("removes stale backups above the retention limit", () => {
    fs.writeFileSync(path.join(tempDir, "app.log.3"), "stale");
    fs.writeFileSync(path.join(tempDir, "beta.log.3"), "stale");

    const logger = require("./logger");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const log = logger.createLogger("beta");
    log.warn("cleanup");

    expect(fs.existsSync(path.join(tempDir, "app.log.3"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "beta.log.3"))).toBe(false);
    expect(fs.readFileSync(path.join(tempDir, "beta.log"), "utf8")).toContain("cleanup");
  });
});

function restoreEnv() {
  restoreEnvVar("CLOD_PET_LOG_DIR", originalEnv.CLOD_PET_LOG_DIR);
  restoreEnvVar("CLOD_PET_LOG_MAX_BYTES", originalEnv.CLOD_PET_LOG_MAX_BYTES);
  restoreEnvVar("CLOD_PET_LOG_MAX_FILES", originalEnv.CLOD_PET_LOG_MAX_FILES);
  restoreEnvVar("NODE_ENV", originalEnv.NODE_ENV);
  restoreEnvVar("VERBOSE", originalEnv.VERBOSE);
}

function restoreEnvVar(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
