interface Window {
  clodPet: {
    send(channel: string, data?: unknown): void;
    on(channel: string, callback: (data: any) => void): () => void;
    off(channel: string, callback: (data: any) => void): void;
    once(channel: string, callback: (data: any) => void): void;
    invoke(channel: string, data?: unknown): Promise<any>;
    store: {
      getState(): Promise<any>;
      subscribe(callback: (state: any) => void): () => void;
    };
    control: {
      getSettings(): Promise<any>;
      setSettings(settings: any): Promise<any>;
      listPets(): Promise<any[]>;
      listActive(): Promise<any[]>;
      addPet(petName: string): Promise<any>;
      removePet(petId: string): Promise<any>;
      setVolume(volume: number): Promise<any>;
      setScale(scale: number): Promise<any>;
      diagnostics(): Promise<any>;
      reportError(source: string, message: string, stack?: string): Promise<any>;
    };
  };
}
