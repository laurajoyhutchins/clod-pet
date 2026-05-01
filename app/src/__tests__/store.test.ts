import { WorldStore } from "../store";
import { initialState } from "../store/state";

describe("WorldStore", () => {
  let store: WorldStore;

  beforeEach(() => {
    store = new WorldStore();
  });

  test("should initialize with initial state", () => {
    expect(store.getState()).toEqual(initialState);
  });

  test("should update state with setState", () => {
    const newState = {
      backend: {
        ...initialState.backend,
        status: 'ready' as const,
        url: 'http://localhost:8080',
        version: '1.0.0',
      }
    };
    store.setState(newState);
    expect(store.getState().backend.status).toBe('ready');
    expect(store.getState().backend.url).toBe('http://localhost:8080');
    // Ensure it didn't wipe out other top-level state
    expect(store.getState().pets).toEqual({});
  });

  test("should update a specific pet", () => {
    const petId = "pet-1";
    const petData = {
      id: petId,
      path: "/path/to/pet",
      backendPetId: "backend-1",
      frameW: 64,
      frameH: 64,
      currentAnimId: 0,
      currentAnimName: "idle",
      state: {
        frameIndex: 0,
        x: 100,
        y: 100,
        flipH: false,
      },
      loaded: true,
      stopped: false,
    };

    store.setState({
      pets: { [petId]: petData }
    });

    store.updatePet(petId, {
      state: { ...petData.state, x: 200 }
    });

    expect(store.getState().pets[petId].state.x).toBe(200);
    expect(store.getState().pets[petId].state.y).toBe(100);
  });

  test("should notify listeners on change", () => {
    const listener = jest.fn();
    store.subscribe(listener);

    store.setState({ ui: { ...initialState.ui, isChatOpen: true } });

    expect(listener).toHaveBeenCalledTimes(1);
    const [newState, prevState] = listener.mock.calls[0];
    expect(newState.ui.isChatOpen).toBe(true);
    expect(prevState.ui.isChatOpen).toBe(false);
  });

  test("should allow unsubscribing", () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.setState({ ui: { ...initialState.ui, isChatOpen: true } });

    expect(listener).not.toHaveBeenCalled();
  });

  test("should handle multiple listeners", () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    store.subscribe(listener1);
    store.subscribe(listener2);

    store.setState({ ui: { ...initialState.ui, isChatOpen: true } });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});
