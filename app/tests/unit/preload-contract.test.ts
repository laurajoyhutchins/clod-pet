import { createPetBridge, PET_CHANNELS, type PetIpcRenderer } from "../../src/preload/ipc-contract";

describe("pet preload contract", () => {
  test("uses only fixed channel names", async () => {
    const invoke = jest.fn().mockResolvedValue({ ok: true });
    const send = jest.fn();
    const on = jest.fn();
    const removeListener = jest.fn();
    const ipc = { invoke, send, on, removeListener } as unknown as PetIpcRenderer;
    const bridge = createPetBridge(ipc);

    await bridge.getInit("pet_1");
    bridge.beginDrag();
    bridge.moveDrag({ x: 10, y: 20 });
    bridge.endDrag();

    expect(invoke).toHaveBeenCalledWith(PET_CHANNELS.getInit, "pet_1");
    expect(send.mock.calls).toEqual([
      [PET_CHANNELS.dragStart],
      [PET_CHANNELS.dragMove, { x: 10, y: 20 }],
      [PET_CHANNELS.dragEnd],
    ]);
  });

  test("returns a precise frame listener cleanup", () => {
    const listenerByChannel = new Map<string, Function>();
    const ipc: PetIpcRenderer = {
      invoke: jest.fn(),
      send: jest.fn(),
      on: jest.fn((channel, listener) => listenerByChannel.set(channel, listener)),
      removeListener: jest.fn(),
    };
    const callback = jest.fn();
    const cleanup = createPetBridge(ipc).onFrame(callback);

    listenerByChannel.get(PET_CHANNELS.frame)?.({}, { frame: 2 });
    cleanup();

    expect(callback).toHaveBeenCalledWith({ frame: 2 });
    expect(ipc.removeListener).toHaveBeenCalledWith(PET_CHANNELS.frame, listenerByChannel.get(PET_CHANNELS.frame));
  });
});
