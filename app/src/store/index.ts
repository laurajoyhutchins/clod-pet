import { WorldState, initialState } from "./state";

export type Listener = (state: WorldState, prevState: WorldState) => void;

export class WorldStore {
  private state: WorldState;
  private listeners: Set<Listener>;

  constructor() {
    this.state = JSON.parse(JSON.stringify(initialState));
    this.listeners = new Set();
  }

  getState(): WorldState {
    return this.state;
  }

  /**
   * Updates the state and notifies listeners.
   * Simple implementation that merges the top-level state branches.
   */
  setState(newState: Partial<WorldState>) {
    const prevState = this.state;
    this.state = {
      ...this.state,
      ...newState,
    };
    this.notify(this.state, prevState);
  }

  /**
   * Inserts or replaces a pet record.
   */
  setPet(petId: string, pet: WorldState['pets'][string]) {
    const prevState = this.state;
    this.state = {
      ...this.state,
      pets: {
        ...this.state.pets,
        [petId]: pet,
      },
    };
    this.notify(this.state, prevState);
  }

  /**
   * Targeted update for a specific pet.
   */
  updatePet(petId: string, updates: Partial<WorldState['pets'][string]>) {
    const prevState = this.state;
    const pet = this.state.pets[petId];
    if (!pet) return;

    this.state = {
      ...this.state,
      pets: {
        ...this.state.pets,
        [petId]: { ...pet, ...updates },
      },
    };
    this.notify(this.state, prevState);
  }

  /**
   * Removes a pet record if it exists.
   */
  removePet(petId: string) {
    if (!this.state.pets[petId]) return;

    const prevState = this.state;
    const pets = { ...this.state.pets };
    delete pets[petId];

    this.state = {
      ...this.state,
      pets,
    };
    this.notify(this.state, prevState);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(state: WorldState, prevState: WorldState) {
    for (const listener of this.listeners) {
      try {
        listener(state, prevState);
      } catch (err) {
        console.error("Error in WorldStore listener:", err);
      }
    }
  }
}

// Export a singleton instance for the main process
const globalStore = new WorldStore();
export default globalStore;
