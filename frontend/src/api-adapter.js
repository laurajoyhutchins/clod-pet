"use strict";
const BackendClient = require("./backend-client");
class ApiAdapter {
    constructor(baseUrl) {
        this.client = new BackendClient(baseUrl);
        this.apiDescription = null;
        this.discoveryError = null;
    }
    async discover() {
        try {
            const resp = await this.client.requestRaw("/api/describe", "GET");
            this.apiDescription = resp;
            this.discoveryError = null;
            return resp;
        }
        catch (err) {
            this.discoveryError = err.message;
            console.warn("API discovery failed:", err.message);
            return null;
        }
    }
    async getSettings() {
        const resp = await this.client.getSettings();
        return resp.payload;
    }
    async setSettings(settings) {
        const resp = await this.client.setSettings(settings);
        return resp.payload;
    }
    async listPets() {
        const resp = await this.client.listPets();
        return resp.payload;
    }
    async listActive() {
        const resp = await this.client.listActive();
        return resp.payload;
    }
    async health() {
        return this.client.health();
    }
    async version() {
        return this.client.version();
    }
    async addPet(petPath, spawnId = 0) {
        const resp = await this.client.addPet(petPath, spawnId);
        return resp.payload;
    }
    async removePet(petId) {
        const resp = await this.client.removePet(petId);
        return resp.ok;
    }
    async setVolume(volume) {
        const resp = await this.client.setVolume(volume);
        return resp.payload;
    }
    async setScale(scale) {
        const resp = await this.client.setScale(scale);
        return resp.payload;
    }
    async stepPet(petId, borderCtx, gravity) {
        const resp = await this.client.request("step_pet", {
            pet_id: petId,
            border_ctx: borderCtx,
            gravity,
        });
        return resp.payload;
    }
    async loadPet(petPath) {
        const resp = await this.client.loadPet(petPath);
        return resp.payload;
    }
    async dragPet(petId, x, y) {
        return this.client.dragPet(petId, x, y);
    }
    async dropPet(petId) {
        return this.client.dropPet(petId);
    }
    get connected() {
        return this.client.connected;
    }
}
module.exports = ApiAdapter;
