const http = require("http");

const BACKEND_URL = "http://localhost:8080";

class BackendClient {
  constructor() {
    this.connected = false;
  }

  async request(command, payload = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ command, payload });
      const req = http.request(`${BACKEND_URL}/api`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }, (res) => {
        let body = "";
        res.on("data", (chunk) => body += chunk);
        res.on("end", () => {
          try {
            const result = JSON.parse(body);
            if (result.ok) {
              this.connected = true;
              resolve(result.payload);
            } else {
              reject(new Error(result.error || "unknown error"));
            }
          } catch {
            reject(new Error("invalid response"));
          }
        });
      });

      req.on("error", (err) => {
        this.connected = false;
        reject(err);
      });

      req.write(data);
      req.end();
    });
  }

  async addPet(petId, spawnId) {
    return this.request("add_pet", { pet_id: petId, spawn_id: spawnId });
  }

  async removePet(petId) {
    return this.request("remove_pet", { pet_id: petId });
  }

  async dragPet(petId, x, y) {
    return this.request("drag_pet", { pet_id: petId, x, y });
  }

  async dropPet(petId) {
    return this.request("drop_pet", { pet_id: petId });
  }

  async setVolume(volume) {
    return this.request("set_volume", { volume });
  }

  async setScale(scale) {
    return this.request("set_scale", { scale });
  }

  async getStatus() {
    return this.request("get_status");
  }
}

module.exports = BackendClient;
