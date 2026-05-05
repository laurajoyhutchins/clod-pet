#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appDir = path.join(repoRoot, "app");

function parseArgs(argv) {
  const args = {
    out: path.join(__dirname, "control-panel-live.png"),
    delayMs: 750,
    postResizeDelayMs: 500,
    showAdvanced: false,
    showDiagnostics: false,
    activePets: 0,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      args.out = argv[++i];
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else if (arg === "--delay" && argv[i + 1]) {
      args.delayMs = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--delay=")) {
      args.delayMs = parseInt(arg.slice("--delay=".length), 10);
    } else if (arg === "--after-resize-delay" && argv[i + 1]) {
      args.postResizeDelayMs = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--after-resize-delay=")) {
      args.postResizeDelayMs = parseInt(arg.slice("--after-resize-delay=".length), 10);
    } else if (arg === "--advanced") {
      args.showAdvanced = true;
    } else if (arg === "--diagnostics") {
      args.showDiagnostics = true;
    } else if (arg === "--active-pets" && argv[i + 1]) {
      args.activePets = parseInt(argv[++i], 10);
    } else if (arg.startsWith("--active-pets=")) {
      args.activePets = parseInt(arg.slice("--active-pets=".length), 10);
    }
  }

  if (!Number.isFinite(args.delayMs) || args.delayMs < 0) args.delayMs = 750;
  if (!Number.isFinite(args.postResizeDelayMs) || args.postResizeDelayMs < 0) args.postResizeDelayMs = 500;
  if (!Number.isFinite(args.activePets) || args.activePets < 0) args.activePets = 0;

  return args;
}

function resolveElectronLauncher() {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", path.join(appDir, "node_modules", ".bin", "electron.cmd")],
    };
  }

  return {
    command: path.join(appDir, "node_modules", ".bin", "electron"),
    args: [],
  };
}

if (!process.versions.electron) {
  const args = parseArgs(process.argv.slice(2));
  const launcher = resolveElectronLauncher();
  const env = {
    ...process.env,
    CAPTURE_CONTROL_PANEL_MOCK: JSON.stringify({
      showAdvanced: args.showAdvanced,
      showDiagnostics: args.showDiagnostics,
      activePets: args.activePets,
    }),
  };

  const result = spawnSync(
    launcher.command,
    [...launcher.args, "--no-sandbox", __filename, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env,
    },
  );

  process.exit(result.status == null ? 1 : result.status);
}

const { app, BrowserWindow } = require("electron");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePanelHtml() {
  const distPath = path.join(appDir, "dist", "control-panel.html");
  if (fs.existsSync(distPath)) return distPath;
  throw new Error("Missing app/dist/control-panel.html. Run `npm run build:ts` in app first.");
}

function resolveOutputPath(out) {
  return path.isAbsolute(out) ? out : path.join(repoRoot, out);
}

function measureScript() {
  return `(() => {
    const panel = document.querySelector(".window");
    if (!panel) return null;
    const clone = panel.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.left = "-10000px";
    clone.style.top = "0";
    clone.style.visibility = "hidden";
    clone.style.width = "max-content";
    clone.style.height = "max-content";
    clone.style.pointerEvents = "none";
    document.body.appendChild(clone);
    const rect = clone.getBoundingClientRect();
    clone.remove();
    return {
      width: Math.max(190, Math.ceil(rect.width + 8)),
      height: Math.max(180, Math.ceil(rect.height + 8)),
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      panelWidth: Math.ceil(rect.width),
      panelHeight: Math.ceil(rect.height),
    };
  })();`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = resolveOutputPath(args.out);
  const preloadPath = path.join(__dirname, "capture-control-panel-preload.js");
  const htmlPath = resolvePanelHtml();

  await app.whenReady();

  const win = new BrowserWindow({
    width: 900,
    height: 900,
    show: false,
    frame: false,
    roundedCorners: false,
    hasShadow: false,
    backgroundColor: "#008080",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(htmlPath);
  await sleep(args.delayMs);

  const size = await win.webContents.executeJavaScript(measureScript());
  if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
    win.setContentSize(size.width, size.height);
    await sleep(args.postResizeDelayMs);
  }

  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, image.toPNG());

  console.log(JSON.stringify({
    outPath,
    contentSize: size ? { width: size.width, height: size.height } : null,
    bodySize: size ? { width: size.bodyWidth, height: size.bodyHeight } : null,
  }, null, 2));

  win.destroy();
  app.quit();
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
  app.quit();
});
