import logger = require("../../src/main/logger");

describe("security log redaction", () => {
  test("redacts credentials and conversation content recursively", () => {
    const result = logger.sanitizeForLog({
      api_key: "sk-example-secret-value",
      authorization: "Bearer example-token",
      messages: [{ role: "user", content: "private chat" }],
      nested: { token: "token-value", safe: "ok" },
    }) as Record<string, unknown>;

    expect(result.api_key).toBe("[redacted]");
    expect(result.authorization).toBe("[redacted]");
    expect(result.messages).toBe("[redacted]");
    expect(result.nested).toEqual({ token: "[redacted]", safe: "ok" });
  });

  test("removes absolute Windows paths and common key formats from strings", () => {
    const result = logger.sanitizeForLog("C:\\Users\\Laura\\repo\\file.txt Bearer abc.def sk-example-secret-value") as string;

    expect(result).not.toContain("Laura");
    expect(result).not.toContain("Bearer abc.def");
    expect(result).not.toContain("sk-example-secret-value");
    expect(result).toContain("[path]");
  });

  test("sanitizes console output as well as persisted logs", () => {
    const consoleSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const instance = new logger.Logger("security-test");

    instance.info({
      api_key: "sk-example-secret-value",
      messages: [{ content: "private chat" }],
      file: "C:\\Users\\Laura\\repo\\file.txt",
    });

    expect(consoleSpy).toHaveBeenCalledWith("[security-test]", {
      api_key: "[redacted]",
      messages: "[redacted]",
      file: "[path]",
    });
    consoleSpy.mockRestore();
  });
});
