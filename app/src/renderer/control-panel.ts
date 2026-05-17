(function() {
const api = window.clodPet.control;
const {
  panelStyles: PANEL_STYLES,
  macPanelStyles: MAC_PANEL_STYLES,
  roundedPanelStyles: ROUNDED_PANEL_STYLES,
} = window.clodPetControlPanelThemes;

type PanelStyle = typeof PANEL_STYLES[number];
const DEFAULT_PANEL_STYLE: PanelStyle = "windows-98";
const MAC_PANEL_STYLE_SET = new Set<PanelStyle>(MAC_PANEL_STYLES);
const ROUNDED_PANEL_STYLE_SET = new Set<PanelStyle>(ROUNDED_PANEL_STYLES);

let settings: Partial<AppSettings> = {};
let pets: string[] = [];
let activePets: PetInfo[] = [];
let diagnosticsRefreshTimer: number | null = null;
let petTrackerTimer: number | null = null;
let resizeFrameHandle: number | null = null;
let lastRequestedSize: { width: number; height: number } | null = null;
let resizeObserver: ResizeObserver | null = null;

function el(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element #${id} not found`);
  return element;
}

function input(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Element #${id} is not an HTMLInputElement`);
  return element;
}

function select(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLSelectElement)) throw new Error(`Element #${id} is not an HTMLSelectElement`);
  return element;
}

function getPanelStyle(value: unknown): PanelStyle {
  return typeof value === "string" && PANEL_STYLES.includes(value as PanelStyle)
    ? (value as PanelStyle)
    : DEFAULT_PANEL_STYLE;
}

function applyPanelStyle(style: PanelStyle) {
  document.body.classList.remove(...PANEL_STYLES.map((panelStyle) => `theme-${panelStyle}`));
  document.body.classList.add(`theme-${style}`);
  document.body.classList.toggle("theme-mac", MAC_PANEL_STYLE_SET.has(style));
  document.body.classList.toggle("theme-rounded", ROUNDED_PANEL_STYLE_SET.has(style));
  scheduleControlPanelResize();
}

function setDiagnosticsPollingEnabled(enabled: boolean) {
  if (enabled) {
    if (diagnosticsRefreshTimer === null) {
      diagnosticsRefreshTimer = window.setInterval(() => {
        void refreshDiagnostics();
      }, 2000);
    }
    if (petTrackerTimer === null) {
      petTrackerTimer = window.setInterval(() => {
        void renderPetTracker();
      }, 1000);
    }
    void refreshDiagnostics();
    void renderPetTracker();
    return;
  }

  if (diagnosticsRefreshTimer !== null) {
    clearInterval(diagnosticsRefreshTimer);
    diagnosticsRefreshTimer = null;
  }
  if (petTrackerTimer !== null) {
    clearInterval(petTrackerTimer);
    petTrackerTimer = null;
  }
}

function measureScrollContentHeight(container: HTMLElement): number {
  const style = getComputedStyle(container);
  const children = Array.from(container.children) as HTMLElement[];
  const childHeight = children.reduce((total, child) => total + child.getBoundingClientRect().height, 0);
  const gap = parseFloat(style.rowGap || style.gap || "0");
  return (
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom) +
    childHeight +
    Math.max(0, children.length - 1) * (Number.isFinite(gap) ? gap : 0)
  );
}

function measureControlPanelSize(): { width: number; height: number } | null {
  const panel = document.querySelector(".window") as HTMLElement | null;
  const titlebar = document.querySelector(".titlebar") as HTMLElement | null;
  const panelScroll = document.querySelector(".panel-scroll") as HTMLElement | null;
  const status = document.querySelector(".status") as HTMLElement | null;
  if (!panel) return null;

  const bodyStyle = getComputedStyle(document.body);
  const horizontalPadding = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
  const verticalPadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
  const panelStyle = getComputedStyle(panel);
  const panelHorizontalChrome =
    parseFloat(panelStyle.borderLeftWidth) +
    parseFloat(panelStyle.borderRightWidth) +
    parseFloat(panelStyle.paddingLeft) +
    parseFloat(panelStyle.paddingRight);
  const panelVerticalChrome =
    parseFloat(panelStyle.borderTopWidth) +
    parseFloat(panelStyle.borderBottomWidth) +
    parseFloat(panelStyle.paddingTop) +
    parseFloat(panelStyle.paddingBottom);
  const panelScrollStyle = panelScroll ? getComputedStyle(panelScroll) : null;
  const statusStyle = status ? getComputedStyle(status) : null;

  const contentWidth = Math.max(
    titlebar?.scrollWidth || 0,
    panelScroll?.scrollWidth || 0,
    status?.scrollWidth || 0,
  );

  const contentHeight =
    (titlebar?.getBoundingClientRect().height || 0) +
    (panelScrollStyle ? parseFloat(panelScrollStyle.marginTop) : 0) +
    (panelScroll ? measureScrollContentHeight(panelScroll) : 0) +
    (statusStyle ? parseFloat(statusStyle.marginTop) : 0) +
    (status?.getBoundingClientRect().height || 0);

  return {
    width: Math.max(320, Math.ceil(contentWidth + panelHorizontalChrome + horizontalPadding)),
    height: Math.max(260, Math.ceil(contentHeight + panelVerticalChrome + verticalPadding)),
  };
}

function scheduleControlPanelResize() {
  if (resizeFrameHandle !== null) return;

  resizeFrameHandle = window.requestAnimationFrame(async () => {
    resizeFrameHandle = null;

    const measured = measureControlPanelSize();
    if (!measured) return;

    const { width, height } = measured;
    const nextSize = { width, height };

    if (
      lastRequestedSize !== null &&
      lastRequestedSize.width === nextSize.width &&
      lastRequestedSize.height === nextSize.height
    ) {
      return;
    }

    lastRequestedSize = nextSize;

    try {
      await api.resizeWindow(width, height);
    } catch {
      // Ignore resize failures while the window is closing or not ready.
    }
  });
}

function startAutoSizing() {
  if (resizeObserver !== null || typeof ResizeObserver === "undefined") return;

  const panel = document.querySelector(".window") as HTMLElement | null;
  if (!panel) return;

  resizeObserver = new ResizeObserver(() => {
    scheduleControlPanelResize();
  });
  resizeObserver.observe(panel);

  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (fonts?.ready) {
    fonts.ready.then(() => scheduleControlPanelResize()).catch(() => {});
  }
}

async function initControlPanel() {
  try {
    const [settingsRes, petsRes] = await Promise.all([
      api.getSettings(),
      api.listPets(),
    ]);

    settings = settingsRes || {};
    pets = petsRes || [];

    renderSettings();
    renderPetSelect();
    startAutoSizing();
    setDiagnosticsPollingEnabled(settings.ShowDiagnosticsPanel || false);
    await refreshActivePets();
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
}

function renderSettings() {
  const volume = settings.Volume ?? 0.3;
  const scale = settings.Scale ?? 1.0;
  const showAdvanced = settings.ShowAdvancedSettings || false;
  const showDiagnosticsPanel = settings.ShowDiagnosticsPanel || false;
  const panelStyle = getPanelStyle(settings.PanelStyle);

  input("volume").value = String(volume);
  el("volume-value").textContent = Math.round(volume * 100) + "%";
  select("panel-style").value = panelStyle;
  applyPanelStyle(panelStyle);
  
  input("show-advanced").checked = showAdvanced;
  el("advanced-settings").style.display = showAdvanced ? "block" : "none";
  input("show-diagnostics").checked = showDiagnosticsPanel;
  el("diagnostics-card").style.display = showDiagnosticsPanel ? "block" : "none";
  
  input("scale").value = String(scale);
  el("scale-value").textContent = scale.toFixed(1) + "x";

  const gravity = settings.GravityFactor ?? 2.0;
  input("gravity").value = String(gravity);
  el("gravity-value").textContent = gravity.toFixed(1) + "x";
  
  input("multi-screen").checked = settings.MultiScreenEnabled !== false;
  input("win-foreground").checked = settings.WinForeGround || false;
  input("steal-focus").checked = settings.StealTaskbarFocus || false;
  input("autostart").value = String(settings.AutostartPets || 1);

  scheduleControlPanelResize();
}

function renderPetSelect() {
  const petSelect = select("pet-select");
  petSelect.innerHTML = "";
  pets.forEach((pet) => {
    const opt = document.createElement("option");
    opt.value = pet;
    opt.textContent = pet;
    if (pet === settings.CurrentPet) opt.selected = true;
    petSelect.appendChild(opt);
  });
}

async function refreshActivePets() {
  try {
    activePets = await api.listActive();
    activePets = activePets || [];
    renderActivePets();
    renderPetTracker();
  } catch (err: unknown) {
    updateStatus("Error loading pets: " + (err instanceof Error ? err.message : String(err)), "error");
  }
}

function renderActivePets() {
  const container = el("active-pets");
  const countEl = el("pet-count");
  countEl.textContent = activePets.length + " pet" + (activePets.length !== 1 ? "s" : "");

  if (activePets.length === 0) {
    container.innerHTML = '<div class="empty-state">No pets active. Add one below!</div>';
    el("pet-tracker-card").style.display = "none";
    return;
  }

  el("pet-tracker-card").style.display = "block";
  container.innerHTML = "";
  activePets.forEach((pet) => {
    const div = document.createElement("div");
    div.className = "pet-item";

    const info = document.createElement("div");
    info.className = "pet-info";

    const title = document.createElement("div");
    title.className = "pet-title";
    title.textContent = pet.title || pet.pet_name || "Unknown Pet";

    const id = document.createElement("div");
    id.className = "pet-id";
    id.textContent = pet.pet_id;

    const button = document.createElement("button");
    button.className = "btn btn-secondary btn-small";
    button.textContent = "Remove";
    button.addEventListener("click", () => removePet(pet.pet_id));

    info.appendChild(title);
    info.appendChild(id);
    div.appendChild(info);
    div.appendChild(button);
    container.appendChild(div);
  });
}

async function renderPetTracker() {
  const content = el("pet-tracker-content");
  try {
    const diag = await api.diagnostics();
    const petsDiag = diag.pets || { windows: [] };
    const windows = petsDiag.windows || [];

    if (windows.length === 0) {
      content.textContent = "No active windows tracked.";
      scheduleControlPanelResize();
      return;
    }

    content.replaceChildren();
    windows.forEach((win: WindowDiagnosticInfo) => {
      const b = win.bounds || { x: 0, y: 0, width: 0, height: 0 };
      const item = document.createElement("div");
      item.className = "tracker-window";
      item.textContent = [
        `ID: ${win.id}`,
        `Pos: ${b.x}, ${b.y}`,
        `Size: ${b.width}x${b.height}`,
        `Bottom: ${b.y + b.height}`,
      ].join("\n");
      content.appendChild(item);
    });
    scheduleControlPanelResize();
  } catch (err: unknown) {
    content.textContent = "Error updating tracker: " + (err instanceof Error ? err.message : String(err));
    scheduleControlPanelResize();
  }
}

// Update tracker more frequently
petTrackerTimer = setInterval(renderPetTracker, 1000) as unknown as number;

async function removePet(petId: string) {
  try {
    await api.removePet(petId);
    updateStatus("Pet removed", "success");
    await refreshActivePets();
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
}

async function addPet() {
  const petName = select("pet-select").value;
  if (!petName) return;

  try {
    await api.addPet(petName);
    updateStatus(`Added ${petName}`, "success");
    await refreshActivePets();
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
}

function updateStatus(msg: string, type = "") {
  const status = el("status");
  status.textContent = msg;
  status.className = "status " + type;
}

async function refreshDiagnostics() {
  const summary = el("diagnostics-summary");
  const log = el("diagnostics-log");
  try {
    const diag = await api.diagnostics();
    const backend = diag.backend || { url: null, lastStderr: "", state: "unknown", available: false };
    const launch = backend.launch || { cmd: "", args: [], useExe: false, petsDir: "" };
    const petsDiag = diag.pets || { petCount: 0, lastError: null, lastPetLoad: null };
    const backendState = diag.backend?.state || (diag.backendHealth?.ok ? "ready" : "unknown");
    const backendFatal = diag.backend?.fatalError || diag.backend?.lastError || null;

    summary.innerHTML = "";
    addDiagnosticRow(summary, "Backend", backendState);
    addDiagnosticRow(summary, "URL", backend.url || "not started");
    addDiagnosticRow(summary, "Launch", launch.cmd ? `${launch.cmd} ${Array.isArray(launch.args) ? launch.args.join(" ") : ""}`.trim() : "unknown");
    addDiagnosticRow(summary, "Mode", launch.useExe ? "executable" : "source");
    addDiagnosticRow(summary, "Pets Dir", launch.petsDir || "unknown");
    addDiagnosticRow(summary, "Active", `${petsDiag.petCount || 0} pet(s)`);
    addDiagnosticRow(summary, "Logs", diag.app?.logDir || "unknown");
    addDiagnosticRow(summary, "Last Error", diag.app?.lastError || petsDiag.lastError || backendFatal || "none");

    log.textContent = [
      "Backend version:",
      JSON.stringify(diag.backendVersion || {}, null, 2),
      "",
      "Last pet load:",
      JSON.stringify(petsDiag.lastPetLoad || {}, null, 2),
      "",
      "Renderer errors:",
      JSON.stringify(diag.rendererErrors || [], null, 2),
      "",
      "Backend stderr:",
      backend.lastStderr || "(empty)",
    ].join("\n");

    if (backend.state === "fatal" || backend.state === "failed" || backend.available === false) {
      updateStatus(`Backend unavailable: ${backendFatal || "unexpected crash"}`, "error");
    } else if (backend.state === "restarting") {
      const suffix = backend.nextRestartAt ? `, retrying at ${backend.nextRestartAt}` : "";
      updateStatus(`Backend restarting after crash${suffix}`, "error");
    } else if (backend.state === "ready" || diag.backendHealth?.ok) {
      updateStatus("Backend connected", "success");
    } else {
      updateStatus("Backend status unknown", "");
    }
    scheduleControlPanelResize();
  } catch (err: unknown) {
    summary.innerHTML = "";
    addDiagnosticRow(summary, "Diagnostics", "failed");
    log.textContent = err instanceof Error ? err.message : String(err);
    updateStatus("Backend unavailable: " + (err instanceof Error ? err.message : String(err)), "error");
    scheduleControlPanelResize();
  }
}

function addDiagnosticRow(container: HTMLElement, label: string, value: string) {
  const labelEl = document.createElement("span");
  labelEl.className = "diag-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("span");
  valueEl.className = "diag-value";
  valueEl.textContent = value;
  container.appendChild(labelEl);
  container.appendChild(valueEl);
}

el("volume").addEventListener("input", async (e: Event) => {
  const vol = parseFloat((e.target as HTMLInputElement).value);
  el("volume-value").textContent = Math.round(vol * 100) + "%";
  try {
    await api.setVolume(vol);
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
});

el("scale").addEventListener("input", async (e: Event) => {
  const scale = parseFloat((e.target as HTMLInputElement).value);
  el("scale-value").textContent = scale.toFixed(1) + "x";
  try {
    await api.setScale(scale);
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
});

el("gravity").addEventListener("input", async (e: Event) => {
  const gravity = parseFloat((e.target as HTMLInputElement).value);
  el("gravity-value").textContent = gravity.toFixed(1) + "x";
  try {
    await api.setGravityFactor(gravity);
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
});

el("add-pet-btn").addEventListener("click", addPet);
el("refresh-diagnostics-btn").addEventListener("click", refreshDiagnostics);
el("open-editor-btn").addEventListener("click", () => {
  void window.clodPet.editor.show();
});

el("pet-select").addEventListener("change", async (e: Event) => {
  try {
    await api.setSettings({ CurrentPet: (e.target as HTMLSelectElement).value });
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
});

el("panel-style").addEventListener("change", async (e: Event) => {
  const panelStyle = getPanelStyle((e.target as HTMLSelectElement).value);
  settings.PanelStyle = panelStyle;
  applyPanelStyle(panelStyle);
  try {
    await api.setSettings({ PanelStyle: panelStyle });
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
});

["multi-screen", "win-foreground", "steal-focus"].forEach((id) => {
  el(id).addEventListener("change", async (e: Event) => {
    const keyMap: Record<string, keyof AppSettings> = {
      "multi-screen": "MultiScreenEnabled",
      "win-foreground": "WinForeGround",
      "steal-focus": "StealTaskbarFocus",
    };
    try {
      await api.setSettings({ [keyMap[id]]: (e.target as HTMLInputElement).checked });
      scheduleControlPanelResize();
    } catch (err: unknown) {
      updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  });
});

el("autostart").addEventListener("change", async (e: Event) => {
  try {
    await api.setSettings({ AutostartPets: parseInt((e.target as HTMLInputElement).value, 10) });
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
});

el("show-advanced").addEventListener("change", async (e: Event) => {
  const show = (e.target as HTMLInputElement).checked;
  el("advanced-settings").style.display = show ? "block" : "none";
  try {
    await api.setSettings({ ShowAdvancedSettings: show });
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
});

el("show-diagnostics").addEventListener("change", async (e: Event) => {
  const show = (e.target as HTMLInputElement).checked;
  el("diagnostics-card").style.display = show ? "block" : "none";
  setDiagnosticsPollingEnabled(show);
  try {
    await api.setSettings({ ShowDiagnosticsPanel: show });
    scheduleControlPanelResize();
  } catch (err: unknown) {
    updateStatus("Error: " + (err instanceof Error ? err.message : String(err)), "error");
  }
});

initControlPanel();

window.addEventListener("error", (event) => {
  api.reportError("control-panel", event.message, event.error?.stack);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  api.reportError("control-panel", reason.message, reason.stack);
});

window.addEventListener("beforeunload", () => {
  if (petTrackerTimer !== null) {
    clearInterval(petTrackerTimer);
    petTrackerTimer = null;
  }
  if (resizeFrameHandle !== null) {
    cancelAnimationFrame(resizeFrameHandle);
    resizeFrameHandle = null;
  }
  if (resizeObserver !== null) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  setDiagnosticsPollingEnabled(false);
});

document.getElementById("close-btn")?.addEventListener("click", () => {
  api.closeWindow();
});

document.getElementById("minimize-btn")?.addEventListener("click", () => {
  api.minimizeWindow();
});

document.getElementById("zoom-btn")?.addEventListener("click", () => {
  api.zoomWindow();
});
})();
