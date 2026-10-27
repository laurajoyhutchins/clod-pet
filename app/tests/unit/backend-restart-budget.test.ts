import BackendManager from "../../src/main/backend-manager";

describe("backend restart budget after failed startup", () => {
  let manager: InstanceType<typeof BackendManager>;

  beforeEach(() => {
    jest.useFakeTimers();
    manager = new BackendManager();
    manager.restartEnabled = true;
    manager.restartBaseDelayMs = 10;
    manager.restartMaxDelayMs = 40;
    manager.restartMaxAttempts = 3;
  });

  afterEach(() => {
    manager.stopWithReason("test cleanup");
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("retries two failed pre-readiness startups and then succeeds with bounded backoff", async () => {
    const start = jest.spyOn(manager, "start")
      .mockRejectedValueOnce(new Error("first readiness failure"))
      .mockRejectedValueOnce(new Error("second readiness failure"))
      .mockResolvedValue("http://localhost:8080");

    manager._scheduleRestart(null);
    expect(manager.restartAttempt).toBe(1);
    await jest.advanceTimersByTimeAsync(10);
    expect(start).toHaveBeenCalledTimes(1);
    expect(manager.restartAttempt).toBe(2);
    expect(manager.state).toBe("restarting");
    expect(manager.fatalError).toBeNull();

    await jest.advanceTimersByTimeAsync(19);
    expect(start).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(start).toHaveBeenCalledTimes(2);
    expect(manager.restartAttempt).toBe(3);

    await jest.advanceTimersByTimeAsync(40);
    expect(start).toHaveBeenCalledTimes(3);
    expect(manager.restartAttempt).toBe(0);
    expect(manager.fatalError).toBeNull();
    expect(manager.nextRestartAt).toBeNull();
  });

  test("becomes fatal only after the configured number of startup attempts is exhausted", async () => {
    manager.restartMaxAttempts = 2;
    const start = jest.spyOn(manager, "start").mockRejectedValue(new Error("not ready"));

    manager._scheduleRestart(137);
    await jest.advanceTimersByTimeAsync(10);
    expect(manager.state).toBe("restarting");
    expect(manager.restartAttempt).toBe(2);
    expect(manager.fatalError).toBeNull();

    await jest.advanceTimersByTimeAsync(20);
    expect(start).toHaveBeenCalledTimes(2);
    expect(manager.state).toBe("fatal");
    expect(manager.restartAttempt).toBe(2);
    expect(manager.fatalError).toBe("not ready");
    expect(manager.nextRestartAt).toBeNull();

    await jest.advanceTimersByTimeAsync(100);
    expect(start).toHaveBeenCalledTimes(2);
  });

  test("shutdown cancels a waiting retry before any new child is started", async () => {
    const start = jest.spyOn(manager, "start").mockResolvedValue("http://localhost:8080");
    manager._scheduleRestart(null);
    manager.stopWithReason("user shutdown");

    await jest.advanceTimersByTimeAsync(100);
    expect(start).not.toHaveBeenCalled();
    expect(manager.state).toBe("stopped");
    expect(manager.restartAttempt).toBe(0);
  });

  test("shutdown during an in-flight failed startup prevents rescheduling", async () => {
    let rejectStart: ((err: Error) => void) | undefined;
    const start = jest.spyOn(manager, "start").mockImplementation(
      () => new Promise<string>((_resolve, reject) => { rejectStart = reject; })
    );
    manager._scheduleRestart(null);
    await jest.advanceTimersByTimeAsync(10);
    expect(start).toHaveBeenCalledTimes(1);

    manager.stopWithReason("user shutdown during startup");
    expect(rejectStart).toBeDefined();
    rejectStart!(new Error("shutdown raced with readiness failure"));
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(100);
    expect(start).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe("stopped");
    expect(manager.nextRestartAt).toBeNull();
  });

  test("does not launch another backend while failed startup may still own the port", async () => {
    manager.process = { pid: 4321 } as typeof manager.process;
    const start = jest.spyOn(manager, "start").mockRejectedValue(new Error("health check timed out"));

    manager._scheduleRestart(null);
    await jest.advanceTimersByTimeAsync(10);
    expect(manager.state).toBe("fatal");
    expect(manager.fatalError).toContain("may still be running");
    await jest.advanceTimersByTimeAsync(100);
    expect(start).toHaveBeenCalledTimes(1);
    // Prevent test cleanup from trying to signal our lightweight process mock.
    manager.process = null;
  });
});
