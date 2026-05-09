#!/usr/bin/env node
"use strict";

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const appDir = path.join(__dirname, "..");
const repoRoot = path.join(appDir, "..");
const buildScript = path.join(appDir, "scripts", "build.js");
const electronLauncher = path.join(appDir, "scripts", "start-electron.js");
const reloadSignalPath = path.join(appDir, ".clod-pet-dev-reload");
const launcherArgs = process.argv.slice(2);

const appWatchRoots = [
  path.join(appDir, "src"),
  path.join(appDir, "public"),
  path.join(appDir, "assets"),
  path.join(appDir, "scripts"),
];
const appConfigFiles = [
  path.join(appDir, "package.json"),
  path.join(appDir, "tsconfig.json"),
  path.join(appDir, "tsconfig.browser.json"),
  path.join(appDir, "tsconfig.editor.json"),
  path.join(appDir, "vite.editor.config.ts"),
];
const backendWatchRoot = path.join(repoRoot, "backend");
const backendIgnoredDirs = new Set([
  "bin",
  "coverage",
  "service_coverage",
  "ipc_coverage",
  "llm_coverage",
  ".git",
]);

const state = {
  appDirty: false,
  backendDirty: false,
  processing: false,
  relaunchRequested: false,
  shuttingDown: false,
  launcher: null,
  watchers: [],
  processTimer: null,
  shutdownTimer: null,
};

function log(message, details) {
  if (typeof details === "undefined") {
    console.log(`[clod-pet-dev] ${message}`);
    return;
  }
  console.log(`[clod-pet-dev] ${message}`, details);
}

function ensureReloadSignalFile() {
  fs.writeFileSync(reloadSignalPath, `${Date.now()}\n`, "utf8");
}

function touchReloadSignalFile() {
  fs.writeFileSync(reloadSignalPath, `${Date.now()}\n`, "utf8");
}

function runBuild() {
  log("building TypeScript app");
  execFileSync(process.execPath, [buildScript], {
    cwd: appDir,
    stdio: "inherit",
    env: { ...process.env },
  });
}

function scheduleProcessQueue() {
  if (state.shuttingDown || state.processTimer) return;
  state.processTimer = setTimeout(() => {
    state.processTimer = null;
    void processQueue();
  }, 150);
}

async function processQueue() {
  if (state.shuttingDown || state.processing) return;
  if (!state.appDirty && !state.backendDirty) return;
  state.processing = true;

  try {
    const shouldBuild = state.appDirty;
    const hadBackendChange = state.backendDirty;
    state.appDirty = false;
    state.backendDirty = false;
    let buildSucceeded = false;

    if (shouldBuild) {
      try {
        runBuild();
        buildSucceeded = true;
      } catch (err) {
        log("build failed", err instanceof Error ? err.message : String(err));
      }
    }

    if (hadBackendChange || buildSucceeded) {
      state.relaunchRequested = true;
      log("requesting Electron restart");
      touchReloadSignalFile();
    }
  } finally {
    state.processing = false;
    if ((state.appDirty || state.backendDirty) && !state.shuttingDown) {
      scheduleProcessQueue();
    }
  }
}

function startLauncher() {
  if (state.shuttingDown) return;

  const env = {
    ...process.env,
    NODE_ENV: "development",
    CLOD_PET_INSTALL_ROOT: repoRoot,
    CLOD_PET_BACKEND_MODE: "source",
    CLOD_PET_DEV_RELOAD_FILE: reloadSignalPath,
  };

  const launcher = spawn(process.execPath, [electronLauncher, ...launcherArgs], {
    cwd: appDir,
    env,
    stdio: "inherit",
  });

  state.launcher = launcher;
  log(`Electron launcher started (pid ${launcher.pid ?? "unknown"})`);

  launcher.on("error", (err) => {
    log("Electron launcher failed", err instanceof Error ? err.message : String(err));
    cleanupAndExit(1);
  });

  launcher.on("exit", (code, signal) => {
    state.launcher = null;

    if (state.shuttingDown) {
      if (state.shutdownTimer) {
        clearTimeout(state.shutdownTimer);
        state.shutdownTimer = null;
      }
      cleanupAndExit(code ?? 0);
      return;
    }

    if (state.relaunchRequested) {
      state.relaunchRequested = false;
      log("Electron exited for a reload; relaunching");
      setTimeout(() => {
        if (!state.shuttingDown) startLauncher();
      }, 250);
      return;
    }

    log(`Electron exited (code ${code ?? "null"}${signal ? `, signal ${signal}` : ""})`);
    stopWatching();
    process.exit(code ?? 0);
  });
}

function createTreeWatcher(rootDir, ignoreDirs, onChange) {
  const watchers = new Map();
  let refreshTimer = null;

  function shouldIgnoreDirectory(dirName) {
    return ignoreDirs.has(dirName);
  }

  function refresh() {
    refreshTimer = null;
    const seen = new Set();

    function scan(dir) {
      let stat;
      try {
        stat = fs.statSync(dir);
      } catch {
        return;
      }
      if (!stat.isDirectory()) return;

      seen.add(dir);

      if (!watchers.has(dir)) {
        try {
          const watcher = fs.watch(dir, (eventType, filename) => {
            const changedPath = filename ? path.join(dir, filename.toString()) : dir;
            onChange(changedPath, eventType);
            if (eventType === "rename") scheduleRefresh();
          });
          watcher.on("error", () => scheduleRefresh());
          watchers.set(dir, watcher);
        } catch {
          return;
        }
      }

      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (!entry.isDirectory() || shouldIgnoreDirectory(entry.name)) continue;
        scan(path.join(dir, entry.name));
      }
    }

    scan(rootDir);

    for (const [dir, watcher] of watchers.entries()) {
      if (seen.has(dir)) continue;
      watcher.close();
      watchers.delete(dir);
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(refresh, 100);
  }

  refresh();

  return {
    close() {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
    },
  };
}

function watchFile(filePath, onChange) {
  const handler = (curr, prev) => {
    if (curr.mtimeMs <= prev.mtimeMs) return;
    onChange(filePath);
  };
  fs.watchFile(filePath, { interval: 250 }, handler);
  return {
    close() {
      fs.unwatchFile(filePath, handler);
    },
  };
}

function markAppDirty(reason, filePath) {
  state.appDirty = true;
  log(`${reason}: ${path.relative(appDir, filePath)}`);
  scheduleProcessQueue();
}

function markBackendDirty(filePath) {
  state.backendDirty = true;
  log(`backend change: ${path.relative(repoRoot, filePath)}`);
  scheduleProcessQueue();
}

function setupWatchers() {
  for (const root of appWatchRoots) {
    state.watchers.push(
      createTreeWatcher(root, new Set(["node_modules", "dist", ".git", "coverage"]), (filePath, eventType) => {
        if (eventType === "rename" || eventType === "change") {
          markAppDirty("app change", filePath);
        }
      })
    );
  }

  for (const configFile of appConfigFiles) {
    if (!fs.existsSync(configFile)) continue;
    state.watchers.push(watchFile(configFile, (filePath) => {
      markAppDirty("app config change", filePath);
    }));
  }

  state.watchers.push(
    createTreeWatcher(backendWatchRoot, backendIgnoredDirs, (filePath, eventType) => {
      if (!filePath.endsWith(".go") && path.basename(filePath) !== "go.mod" && path.basename(filePath) !== "go.sum") {
        return;
      }
      if (eventType === "rename" || eventType === "change") {
        markBackendDirty(filePath);
      }
    })
  );
}

function stopWatching() {
  if (state.processTimer) {
    clearTimeout(state.processTimer);
    state.processTimer = null;
  }
  for (const watcher of state.watchers) {
    watcher.close();
  }
  state.watchers = [];
  fs.unwatchFile(reloadSignalPath);
}

function cleanupAndExit(code) {
  if (state.shutdownTimer) {
    clearTimeout(state.shutdownTimer);
    state.shutdownTimer = null;
  }
  stopWatching();
  if (state.launcher) {
    try {
      state.launcher.kill("SIGTERM");
    } catch {
      // Ignore cleanup failures. The app already exited.
    }
    state.launcher = null;
  }
  process.exit(code);
}

function requestShutdown(signal) {
  if (state.shuttingDown) return;
  state.shuttingDown = true;
  log(`received ${signal}; shutting down`);

  if (!state.launcher) {
    cleanupAndExit(0);
    return;
  }

  try {
    touchReloadSignalFile();
    state.shutdownTimer = setTimeout(() => {
      log("Electron did not exit after shutdown request; forcing shutdown");
      cleanupAndExit(1);
    }, 15000);
  } catch (err) {
    log("failed to request Electron shutdown", err instanceof Error ? err.message : String(err));
    cleanupAndExit(1);
  }
}

async function main() {
  ensureReloadSignalFile();
  setupWatchers();
  runBuild();
  startLauncher();

  if (state.appDirty || state.backendDirty || state.relaunchRequested) {
    await processQueue();
  }
}

process.on("SIGINT", () => requestShutdown("SIGINT"));
process.on("SIGTERM", () => requestShutdown("SIGTERM"));

main().catch((err) => {
  log("dev launcher failed", err instanceof Error ? err.stack || err.message : String(err));
  cleanupAndExit(1);
});
