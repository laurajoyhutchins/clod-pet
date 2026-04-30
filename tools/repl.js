const { spawn } = require("child_process");
const http = require("http");
const readline = require("readline");

let BACKEND_URL = "http://localhost:8080";
let backend = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "clod-pet> ",
});

function api(command, payload = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ command, payload });
    const req = http.request(`${BACKEND_URL}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          console.log("←", JSON.parse(body));
          resolve(JSON.parse(body));
        } catch (e) {
          console.log("←", body);
          reject(new Error("bad response"));
        }
      });
    });
    req.on("error", (e) => {
      console.log("← error:", e.message);
      reject(e);
    });
    req.write(data);
    req.end();
  });
}

function loadPet(petPath) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ pet_path: petPath });
    const req = http.request(`${BACKEND_URL}/api/pet/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(body);
          console.log("←", result.ok ? "loaded:" + result.pet?.title : result.error);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function startBackend() {
  if (backend) {
    console.log("backend already running");
    return;
  }

  const backendPath = require("path").join(__dirname, "backend");
  const petsDir = require("path").join(__dirname, "pets");

  backend = spawn("go", ["run", "."], {
    cwd: backendPath,
    env: { ...process.env, PORT: "8080", PETS_DIR: petsDir },
  });

  backend.stdout.on("data", (d) => console.log("[backend]", d.toString().trim()));
  backend.stderr.on("data", (d) => console.error("[backend err]", d.toString().trim()));
  backend.on("error", (e) => {
    console.error("[backend] spawn error:", e.message);
    backend = null;
  });
  backend.on("close", (code) => {
    console.log(`[backend] exited with code ${code}`);
    backend = null;
  });

  console.log("starting backend...");
  setTimeout(() => rl.prompt(), 500);
}

function stopBackend() {
  if (backend) {
    backend.kill();
    backend = null;
    console.log("backend stopped");
  }
}

async function step(count = 1) {
  for (let i = 0; i < count; i++) {
    await api("step_pet", { pet_id: "../pets/esheep64", border_ctx: 0 });
  }
}

rl.on("line", async (line) => {
  const cmd = line.trim();
  if (!cmd) {
    rl.prompt();
    return;
  }

  const parts = cmd.split(/\s+/);
  const action = parts[0];

  try {
    switch (action) {
      case "start":
        startBackend();
        break;
      case "stop":
        stopBackend();
        break;
      case "load":
        await loadPet(parts[1] || "../pets/esheep64");
        break;
      case "add":
        await api("add_pet", { pet_path: parts[1] || "../pets/esheep64", spawn_id: parseInt(parts[2]) || 1 });
        break;
      case "step":
        await step(parseInt(parts[1]) || 1);
        break;
      case "health":
        await new Promise((resolve, reject) => {
          http.get(`${BACKEND_URL}/api/health`, (res) => {
            let body = "";
            res.on("data", (d) => (body += d));
            res.on("end", () => {
              console.log("←", body);
              resolve();
            });
          }).on("error", reject);
        });
        break;
      case "quit":
      case "exit":
        stopBackend();
        rl.close();
        process.exit(0);
        break;
      default:
        console.log("commands: start, stop, load <path>, add <path> <spawn>, step <n>, health, quit");
    }
  } catch (e) {
    console.error("error:", e.message);
  }

  rl.prompt();
});

console.log("clod-pet REPL");
console.log("commands: start, stop, load <path>, add <path> <spawn>, step <n>, health, quit");
rl.prompt();
