import { hardenLocalWindow, localWindowWebPreferences } from "../../src/main/window-security";

describe("local Electron window security", () => {
  test("uses one explicit sandboxed preload policy", () => {
    expect(localWindowWebPreferences("C:\\clod-pet\\preload.js")).toEqual({
      preload: "C:\\clod-pet\\preload.js",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    });
  });

  test("denies popups, navigation, and webview attachment", () => {
    const handlers = new Map<string, (...args: any[]) => void>();
    const webContents = {
      setWindowOpenHandler: jest.fn(),
      on: jest.fn((name: string, handler: (...args: any[]) => void) => handlers.set(name, handler)),
    };
    const win = { webContents } as any;

    hardenLocalWindow(win);

    expect(webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const openHandler = webContents.setWindowOpenHandler.mock.calls[0][0];
    expect(openHandler({ url: "https://example.com" })).toEqual({ action: "deny" });

    const navigationEvent = { preventDefault: jest.fn() };
    handlers.get("will-navigate")?.(navigationEvent, "https://example.com");
    expect(navigationEvent.preventDefault).toHaveBeenCalledTimes(1);

    const webviewEvent = { preventDefault: jest.fn() };
    handlers.get("will-attach-webview")?.(webviewEvent, {}, {});
    expect(webviewEvent.preventDefault).toHaveBeenCalledTimes(1);
  });
});
