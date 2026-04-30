const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const BACKEND_URL = "http://localhost:8080";
const BACKEND_DIR = path.join(__dirname, "backend");
const PETS_DIR = path.join(__dirname, "pets");
const PET_REL_PATH = "../pets/esheep64";

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
          const result = JSON.parse(body);
          resolve(result);
        } catch {
          resolve({ ok: false, error: body });
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function test() {
  console.log("=== starting backend ===");
  const backend = spawn("go", ["run", "."], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: "8080", PETS_DIR: PETS_DIR },
  });

  backend.stdout.on("data", (d) => console.log("[backend]", d.toString().trim()));
  backend.stderr.on("data", (d) => console.error("[backend err]", d.toString().trim()));
  backend.on("error", (e) => console.error("[backend] spawn:", e.message));
  backend.on("close", (code) => console.log(`[backend] exited ${code}`));

  await new Promise((r) => setTimeout(r, 5000));

  console.log("\n=== load pet ===");
  const loadResult = await new Promise((resolve, reject) => {
    const data = JSON.stringify({ pet_path: "../pets/esheep64" });
    const req = http.request(`${BACKEND_URL}/api/pet/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        const result = JSON.parse(body);
        if (result.ok) {
          console.log("loaded:", result.pet.title, `(${result.pet.tiles_x}x${result.pet.tiles_y})`);
        } else {
          console.log("failed:", result.error);
        }
        resolve(result);
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });

  if (!loadResult.ok) {
    backend.kill();
    return;
  }

  console.log("\n=== add pet ===");
  const addResult = await api("add_pet", { pet_path: "../pets/esheep64", spawn_id: 1 });
  console.log("add_pet:", addResult.ok ? "ok" : addResult.error);

  console.log("\n=== step 50 ===");
  for (let i = 0; i < 50; i++) {
    const stepResult = await api("step_pet", { pet_id: "../pets/esheep64", border_ctx: 0 });
    if (stepResult.ok) {
      const p = typeof stepResult.payload === "string" ? JSON.parse(stepResult.payload) : stepResult.payload;
      const na = p.next_anim_id !== undefined ? `nextAnim=${p.next_anim_id}` : "no transition";
      console.log(`  step ${i}: frame=${p.frame_index} x=${p.x} y=${p.y} flip=${p.flip_h} interval=${p.interval_ms} ${na}`);
      if (p.next_anim_id > 0) {
        console.log("  >>> TRANSITION TRIGGERED <<<");
      }
    } else {
      console.log(`  step ${i}: error: ${stepResult.error}`);
      break;
    }
  }

  console.log("\n=== done ===");
  backend.kill();
}

test().catch(console.error);
