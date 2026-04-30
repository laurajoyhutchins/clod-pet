const { app, BrowserWindow, ipcMain, Tray, Menu, screen, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

let backendProcess = null;
let petWindows = new Map();
let tray = null;

let BACKEND_URL = "http://localhost:8080";
const PETS_DIR = path.join(__dirname, "..", "pets");

function findFreePort(startPort, maxAttempts = 10) {
  return new Promise((resolve) => {
    let port = startPort;
    let attempts = 0;

    const tryPort = () => {
      const server = require("net").createServer();
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(port));
      });
      server.on("error", () => {
        attempts++;
        if (attempts >= maxAttempts) {
          resolve(startPort);
        } else {
          port++;
          tryPort();
        }
      });
    };
    tryPort();
  });
}

async function startBackend() {
  const port = await findFreePort(8080);
  const backendPath = path.join(__dirname, "..", "backend");
  backendProcess = spawn("go", ["run", "."], {
    cwd: backendPath,
    env: {
      ...process.env,
      PORT: String(port),
      PETS_DIR: PETS_DIR,
    },
  });

  BACKEND_URL = `http://localhost:${port}`;

  backendProcess.stdout.on("data", (data) => {
    console.log(`[backend] ${data}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.error(`[backend error] ${data}`);
  });

  backendProcess.on("error", (err) => {
    console.error("[backend] spawn error:", err.message);
  });

  backendProcess.on("close", (code) => {
    console.error(`[backend] exited with code ${code}`);
  });

  await waitForBackend();
}

function waitForBackend(maxRetries = 20, interval = 500) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      http.get(`${BACKEND_URL}/api/health`, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve());
      }).on("error", () => {
        retries++;
        if (retries >= maxRetries) {
          reject(new Error("backend failed to start"));
        } else {
          setTimeout(check, interval);
        }
      });
    };
    check();
  });
}

function backendRequest(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ command, payload });
    const req = http.request(`${BACKEND_URL}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch {
          reject(new Error("invalid response"));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function loadPet(petPath) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ pet_path: petPath });
    const req = http.request(`${BACKEND_URL}/api/pet/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("invalid response"));
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function createPetWindow(petPath, petData, spawnId = 1) {
  const petId = petPath;
  const workArea = screen.getPrimaryDisplay().workArea;
  const x = workArea.x + Math.floor(Math.random() * workArea.width);
  const y = workArea.y + Math.floor(workArea.height * 0.8);

  const win = new BrowserWindow({
    x,
    y,
    width: 64,
    height: 64,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "src", "preload.js"),
    },
  });

  win.loadFile("pet.html");
  win.once("ready-to-show", () => win.show());

  petWindows.set(petId, {
    win,
    petData,
    state: { frameIndex: 0, x, y, flipH: false },
    interval: null,
  });

  win.on("closed", () => {
    backendRequest("remove_pet", { pet_id: petId });
    if (petWindows.get(petId)?.interval) {
      clearInterval(petWindows.get(petId).interval);
    }
    petWindows.delete(petId);
  });

  win.webContents.once("dom-ready", () => {
    win.webContents.send("pet:init", {
      petId,
      pngBase64: `data:image/png;base64,${petData.pngBase64}`,
      tilesX: petData.tiles_x,
      tilesY: petData.tiles_y,
    });
  });

  await backendRequest("add_pet", { pet_path: petPath, spawn_id: spawnId });
  startPetLoop(petId);
}

function startPetLoop(petId) {
  const entry = petWindows.get(petId);
  if (!entry) return;

  const loop = async () => {
    const result = await backendRequest("step_pet", {
      pet_id: petId,
      border_ctx: 0,
    });

    if (result.ok && result.payload) {
      const state = typeof result.payload === "string"
        ? JSON.parse(result.payload)
        : result.payload;

      const winEntry = petWindows.get(petId);
      if (!winEntry) return;

      winEntry.state = {
        frameIndex: state.frame_index,
        x: state.x,
        y: state.y,
        flipH: state.flip_h,
      };

      entry.win.setPosition(Math.round(state.x), Math.round(state.y));
      entry.win.webContents.send("pet:frame", {
        frameIndex: state.frame_index,
        flipH: state.flip_h,
        opacity: state.opacity || 1.0,
      });

      if (state.next_anim_id > 0) {
        // transition handled by backend
      }

      if (state.interval_ms > 0 && winEntry.interval) {
        clearInterval(winEntry.interval);
        winEntry.interval = setInterval(loop, state.interval_ms);
      }
    }
  };

  if (entry.interval) clearInterval(entry.interval);
  entry.interval = setInterval(loop, 200);
}

async function addPet() {
  const petRelPath = "../pets/esheep64";

  try {
    const result = await loadPet(petRelPath);
    if (result.ok && result.pet) {
      await createPetWindow(petRelPath, result.pet);
    }
  } catch (err) {
    console.error("Failed to add pet:", err);
  }
}

function createTray() {
  tray = new Tray(path.join(__dirname, "assets", "icon.png") || path.join(__dirname, "icon.png"));
  tray.setToolTip("Clod Pet");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Add Pet", click: addPet },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]));
}

ipcMain.on("pet:drag", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  for (const [id, entry] of petWindows) {
    if (entry.win === win) {
      backendRequest("drag_pet", { pet_id: id, x: 0, y: 0 });
      break;
    }
  }
});

ipcMain.on("pet:drag:move", (event, data) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  for (const [id, entry] of petWindows) {
    if (entry.win === win) {
      backendRequest("drag_pet", { pet_id: id, x: data.x, y: data.y });
      entry.win.setPosition(Math.round(data.x), Math.round(data.y));
      break;
    }
  }
});

ipcMain.on("pet:drop", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  for (const [id, entry] of petWindows) {
    if (entry.win === win) {
      backendRequest("drop_pet", { pet_id: id });
      break;
    }
  }
});

app.whenReady().then(async () => {
  await startBackend();
  createTray();
  await addPet();

  app.on("activate", () => {
    addPet();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
