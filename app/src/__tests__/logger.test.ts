import logger = require("../logger");
import fs = require("fs");
import path = require("path");

jest.mock("fs");

describe("Logger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should create a logger with default level", () => {
    const l = new logger.Logger("test");
    expect(l.name).toBe("test");
    expect(l.level).toBe(logger.LOG_LEVELS.info);
  });

  test("should respect log level", () => {
    const l = new logger.Logger("test", "warn");
    const consoleSpy = jest.spyOn(console, "info").mockImplementation();
    l.info("this should not be logged");
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("should log info messages", () => {
    const l = new logger.Logger("test", "info");
    const consoleSpy = jest.spyOn(console, "info").mockImplementation();
    l.info("hello");
    expect(consoleSpy).toHaveBeenCalledWith("[test]", "hello");
    consoleSpy.mockRestore();
  });

  test("should log debug messages when level is debug", () => {
    const l = new logger.Logger("test", "debug");
    const consoleSpy = jest.spyOn(console, "debug").mockImplementation();
    l.debug("debug message");
    expect(consoleSpy).toHaveBeenCalledWith("[test]", "debug message");
    consoleSpy.mockRestore();
  });

  test("should log warn messages", () => {
    const l = new logger.Logger("test", "info");
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
    l.warn("warning");
    expect(consoleSpy).toHaveBeenCalledWith("[test]", "warning");
    consoleSpy.mockRestore();
  });

  test("should log error messages", () => {
    const l = new logger.Logger("test", "info");
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    l.error("error message");
    expect(consoleSpy).toHaveBeenCalledWith("[test]", "error message");
    consoleSpy.mockRestore();
  });

  test("should handle Error objects in formatArg", () => {
    const l = new logger.Logger("test", "info");
    const err = new Error("boom");
    err.stack = "stack trace";
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    l.error(err);
    // The internal line formatting is checked by side effect of console call
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("should handle circular structures in formatArg", () => {
    const l = new logger.Logger("test", "info");
    const circular: any = {};
    circular.self = circular;
    const consoleSpy = jest.spyOn(console, "info").mockImplementation();
    l.info(circular);
    expect(consoleSpy).toHaveBeenCalledWith("[test]", circular);
    consoleSpy.mockRestore();
  });

  test("formatArg should handle non-serializable objects", () => {
    const l = new logger.Logger("test", "info");
    const bigInt = BigInt(123);
    const consoleSpy = jest.spyOn(console, "info").mockImplementation();
    l.info(bigInt);
    expect(consoleSpy).toHaveBeenCalledWith("[test]", bigInt);
    consoleSpy.mockRestore();
  });

  test("Logger should use info as default for unknown level", () => {
    const l = new logger.Logger("test", "unknown" as any);
    expect(l.level).toBe(logger.LOG_LEVELS.info);
  });

  test("createLogger should use debug level in development", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const l = logger.createLogger("dev");
    expect(l.level).toBe(logger.LOG_LEVELS.debug);
    process.env.NODE_ENV = originalEnv;
  });

  test("createLogger should use info level in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const l = logger.createLogger("prod");
    expect(l.level).toBe(logger.LOG_LEVELS.info);
    process.env.NODE_ENV = originalEnv;
  });

  test("createLogger should return a Logger", () => {
    const l = logger.createLogger("factory");
    expect(l instanceof logger.Logger).toBe(true);
    expect(l.name).toBe("factory");
  });

  test("getLogDir should return log directory", () => {
    const dir = logger.getLogDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  test("should handle fs errors gracefully", () => {
    (fs.mkdirSync as jest.Mock).mockImplementation(() => { throw new Error("fs error"); });
    const l = new logger.Logger("test", "info");
    const consoleSpy = jest.spyOn(console, "info").mockImplementation();
    
    // Should not throw
    expect(() => l.info("test message")).not.toThrow();
    
    consoleSpy.mockRestore();
  });
});
