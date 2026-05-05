import BackendClient = require("./backend-client");
import type {
  PetData,
  WorldContext,
  BackendResponse,
  ChatMessage,
  AppSettings,
} from "./types";

class ApiAdapter {
  client: InstanceType<typeof BackendClient>;
  apiDescription: Record<string, unknown> | null;
  discoveryError: string | null;

  constructor(baseUrl: string) {
    this.client = new BackendClient(baseUrl);
    this.apiDescription = null;
    this.discoveryError = null;
  }

  async discover() {
    try {
      const resp = await this.client.requestRaw("/api/describe", "GET");
      this.apiDescription = resp as Record<string, unknown>;
      this.discoveryError = null;
      return resp;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.discoveryError = error.message;
      return null;
    }
  }

  async getSettings(): Promise<AppSettings> {
    const resp = await this.client.getSettings() as Record<string, unknown>;
    return (resp as Record<string, unknown>)?.payload as AppSettings || {} as AppSettings;
  }

  async setSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const resp = await this.client.setSettings(settings) as Record<string, unknown>;
    return (resp as Record<string, unknown>)?.payload as AppSettings || {} as AppSettings;
  }

  async listPets(): Promise<string[]> {
    const resp = await this.client.listPets() as Record<string, unknown>;
    return ((resp as Record<string, unknown>)?.payload as string[]) || [];
  }

  async listActive(): Promise<Record<string, unknown>[]> {
    const resp = await this.client.listActive() as Record<string, unknown>;
    return ((resp as Record<string, unknown>)?.payload as Record<string, unknown>[]) || [];
  }

  async health() {
    return this.client.health();
  }

  async version() {
    return this.client.version();
  }

  async addPet(petPath: string, spawnId = 0, world?: WorldContext) {
    const resp = await this.client.addPet(petPath, spawnId, world as unknown as Record<string, unknown>);
    return (resp as Record<string, unknown>)?.payload;
  }

  async chat(messages: ChatMessage[]) {
    const resp = await this.client.chat(messages);
    return (resp as Record<string, unknown>)?.payload;
  }

  async streamChat(messages: ChatMessage[], onEvent: (event: Record<string, unknown>) => void) {
    return this.client.streamChat(messages, onEvent);
  }

  async removePet(petId: string): Promise<boolean> {
    const resp = await this.client.removePet(petId) as Record<string, unknown>;
    return resp?.ok as boolean || false;
  }

  async setVolume(volume: number): Promise<AppSettings> {
    const resp = await this.client.setVolume(volume) as Record<string, unknown>;
    return ((resp as Record<string, unknown>)?.payload as AppSettings) || {} as AppSettings;
  }

  async setScale(scale: number): Promise<AppSettings> {
    const resp = await this.client.setScale(scale) as Record<string, unknown>;
    return ((resp as Record<string, unknown>)?.payload as AppSettings) || {} as AppSettings;
  }

  async setGravityFactor(gravity: number) {
    return this.setSettings({ GravityFactor: gravity });
  }

  async stepPet(petId: string, world: WorldContext) {
    const resp = await this.client.request("step_pet", {
      pet_id: petId,
      world: world as unknown as Record<string, unknown>,
    });
    return (resp as Record<string, unknown>)?.payload;
  }

  async setPosition(petId: string, x: number, y: number) {
    return this.client.request("set_position", {
      pet_id: petId,
      x,
      y,
    });
  }

  async loadPet(petPath: string): Promise<PetData> {
    const resp = await this.client.loadPet(petPath) as Record<string, unknown>;
    return ((resp as Record<string, unknown>)?.payload as PetData) || {} as PetData;
  }

  async dragPet(petId: string, x: number, y: number) {
    return this.client.dragPet(petId, x, y);
  }

  async dropPet(petId: string) {
    return this.client.dropPet(petId);
  }

  get connected() {
    return this.client.connected;
  }
}

export = ApiAdapter;
