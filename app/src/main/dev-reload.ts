import { app } from "electron";
import fs = require("fs");
import logger = require("./logger");

const log = logger.createLogger("dev-reload");

let watchedPath: string | null = null;
let restartRequested = false;

function handleReloadSignal(curr: fs.Stats, prev: fs.Stats): void {
  if (restartRequested) return;
  if (curr.mtimeMs <= prev.mtimeMs) return;

  restartRequested = true;
  log.info("development reload signal detected; quitting app");
  app.quit();
}

export function setupDevReloadWatcher(signalPath?: string | null): void {
  if (process.env.NODE_ENV !== "development") return;
  if (!signalPath) return;
  if (watchedPath === signalPath) return;

  if (watchedPath) {
    fs.unwatchFile(watchedPath, handleReloadSignal);
  }

  watchedPath = signalPath;
  fs.watchFile(watchedPath, { interval: 250 }, handleReloadSignal);

  app.once("will-quit", () => {
    if (watchedPath) {
      fs.unwatchFile(watchedPath, handleReloadSignal);
      watchedPath = null;
    }
  });
}
