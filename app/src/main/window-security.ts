import type { BrowserWindow, WebPreferences } from "electron";

export function localWindowWebPreferences(preloadPath?: string): WebPreferences {
  const preferences: WebPreferences = {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
  };
  if (preloadPath) {
    preferences.preload = preloadPath;
  }
  return preferences;
}

export function hardenLocalWindow(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
}
