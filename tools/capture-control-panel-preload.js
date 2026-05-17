const { contextBridge } = require("electron");

function readConfig() {
  try {
    return JSON.parse(process.env.CAPTURE_CONTROL_PANEL_MOCK || "{}");
  } catch {
    return {};
  }
}

const config = readConfig();
const activePets = Number.isFinite(config.activePets) ? Math.max(0, Math.floor(config.activePets)) : 0;
const showAdvanced = !!config.showAdvanced;
const showDiagnosticsPanel = !!(config.showDiagnosticsPanel ?? config.showDiagnostics);
const panelStyle = typeof config.panelStyle === "string" ? config.panelStyle : "windows-98";

function makeActivePet(index) {
  const id = `pet-${index + 1}`;
  return {
    pet_id: id,
    title: `Pet ${index + 1}`,
    pet_name: `Pet ${index + 1}`,
  };
}

contextBridge.exposeInMainWorld("clodPet", {
  send: () => {},
  on: () => () => {},
  off: () => {},
  once: () => {},
  invoke: () => Promise.resolve({}),
  store: {
    getState: () => Promise.resolve({}),
    subscribe: () => () => {},
  },
  control: {
    getSettings: () =>
      Promise.resolve({
        Volume: 0.3,
        Scale: 1.0,
        ShowAdvancedSettings: showAdvanced,
        ShowDiagnosticsPanel: showDiagnosticsPanel,
        MultiScreenEnabled: true,
        WinForeGround: false,
        StealTaskbarFocus: false,
        AutostartPets: 1,
        CurrentPet: "eSheep-modern",
        GravityFactor: 2.0,
        PanelStyle: panelStyle,
      }),
    setSettings: () => Promise.resolve({}),
    listPets: () => Promise.resolve(["eSheep-modern", "eDog-modern"]),
    listActive: () => Promise.resolve(Array.from({ length: activePets }, (_, index) => makeActivePet(index))),
    addPet: () => Promise.resolve({ ok: true }),
    removePet: () => Promise.resolve(true),
    setVolume: () => Promise.resolve({}),
    setScale: () => Promise.resolve({}),
    setGravityFactor: () => Promise.resolve({}),
    resizeWindow: () => Promise.resolve(true),
    diagnostics: () =>
      Promise.resolve({
        app: { logDir: "", lastError: null },
        backend: {
          url: "",
          lastStderr: "",
          state: "ready",
          available: true,
          launch: { cmd: "", args: [], useExe: false, petsDir: "" },
        },
        backendHealth: { ok: true },
        backendVersion: { version: "0.0.0", ok: true },
        pets: { petCount: activePets, lastError: null, lastPetLoad: null, windows: [] },
        rendererErrors: [],
        state: {},
      }),
    reportError: () => Promise.resolve(),
    streamChat: () => {},
    closeWindow: () => Promise.resolve(),
  },
});
