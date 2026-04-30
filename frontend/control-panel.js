"use strict";
const api = window.clodPet.control;
let settings = {};
let pets = [];
let activePets = [];
function el(id) {
    return document.getElementById(id);
}
function input(id) {
    return document.getElementById(id);
}
function select(id) {
    return document.getElementById(id);
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
        await refreshActivePets();
        await refreshDiagnostics();
        updateStatus("Connected", "success");
    }
    catch (err) {
        updateStatus("Error: " + err.message, "error");
    }
}
function renderSettings() {
    const volume = settings.Volume ?? 0.3;
    const scale = settings.Scale ?? 1.0;
    input("volume").value = String(volume);
    el("volume-value").textContent = Math.round(volume * 100) + "%";
    input("scale").value = String(scale);
    el("scale-value").textContent = scale.toFixed(1) + "x";
    input("multi-screen").checked = settings.MultiScreenEnabled !== false;
    input("win-foreground").checked = settings.WinForeGround || false;
    input("steal-focus").checked = settings.StealTaskbarFocus || false;
    input("autostart").value = String(settings.AutostartPets || 1);
}
function renderPetSelect() {
    const petSelect = select("pet-select");
    petSelect.innerHTML = "";
    pets.forEach((pet) => {
        const opt = document.createElement("option");
        opt.value = pet;
        opt.textContent = pet;
        if (pet === settings.CurrentPet)
            opt.selected = true;
        petSelect.appendChild(opt);
    });
}
async function refreshActivePets() {
    try {
        activePets = await api.listActive();
        activePets = activePets || [];
        renderActivePets();
    }
    catch (err) {
        updateStatus("Error loading pets: " + err.message, "error");
    }
}
function renderActivePets() {
    const container = el("active-pets");
    const countEl = el("pet-count");
    countEl.textContent = activePets.length + " pet" + (activePets.length !== 1 ? "s" : "");
    if (activePets.length === 0) {
        container.innerHTML = '<div class="empty-state">No pets active. Add one below!</div>';
        return;
    }
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
async function removePet(petId) {
    try {
        await api.removePet(petId);
        updateStatus("Pet removed", "success");
        await refreshActivePets();
    }
    catch (err) {
        updateStatus("Error: " + err.message, "error");
    }
}
async function addPet() {
    const petName = select("pet-select").value;
    if (!petName)
        return;
    try {
        await api.addPet(petName);
        updateStatus(`Added ${petName}`, "success");
        await refreshActivePets();
    }
    catch (err) {
        updateStatus("Error: " + err.message, "error");
    }
}
function updateStatus(msg, type = "") {
    const status = el("status");
    status.textContent = msg;
    status.className = "status " + type;
}
async function refreshDiagnostics() {
    const summary = el("diagnostics-summary");
    const log = el("diagnostics-log");
    try {
        const diag = await api.diagnostics();
        const backend = diag.backend || {};
        const launch = backend.launch || {};
        const petsDiag = diag.pets || {};
        summary.innerHTML = "";
        addDiagnosticRow(summary, "Backend", diag.backendHealth?.status || (diag.backendHealth?.ok ? "ok" : "unknown"));
        addDiagnosticRow(summary, "URL", backend.url || "not started");
        addDiagnosticRow(summary, "Launch", launch.cmd ? `${launch.cmd} ${Array.isArray(launch.args) ? launch.args.join(" ") : ""}`.trim() : "unknown");
        addDiagnosticRow(summary, "Mode", launch.useExe ? "executable" : "source");
        addDiagnosticRow(summary, "Pets Dir", launch.petsDir || diag.backendVersion?.pets_dir || "unknown");
        addDiagnosticRow(summary, "Active", `${petsDiag.petCount || 0} pet(s)`);
        addDiagnosticRow(summary, "Logs", diag.app?.logDir || "unknown");
        addDiagnosticRow(summary, "Last Error", diag.app?.lastError || petsDiag.lastError || "none");
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
    }
    catch (err) {
        summary.innerHTML = "";
        addDiagnosticRow(summary, "Diagnostics", "failed");
        log.textContent = err.message;
    }
}
function addDiagnosticRow(container, label, value) {
    const labelEl = document.createElement("span");
    labelEl.className = "diag-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "diag-value";
    valueEl.textContent = value;
    container.appendChild(labelEl);
    container.appendChild(valueEl);
}
el("volume").addEventListener("input", async (e) => {
    const vol = parseFloat(e.target.value);
    el("volume-value").textContent = Math.round(vol * 100) + "%";
    try {
        await api.setVolume(vol);
    }
    catch (err) {
        updateStatus("Error: " + err.message, "error");
    }
});
el("scale").addEventListener("input", async (e) => {
    const scale = parseFloat(e.target.value);
    el("scale-value").textContent = scale.toFixed(1) + "x";
    try {
        await api.setScale(scale);
    }
    catch (err) {
        updateStatus("Error: " + err.message, "error");
    }
});
el("add-pet-btn").addEventListener("click", addPet);
el("refresh-diagnostics-btn").addEventListener("click", refreshDiagnostics);
el("pet-select").addEventListener("change", async (e) => {
    try {
        await api.setSettings({ CurrentPet: e.target.value });
    }
    catch (err) {
        updateStatus("Error: " + err.message, "error");
    }
});
["multi-screen", "win-foreground", "steal-focus"].forEach((id) => {
    el(id).addEventListener("change", async (e) => {
        const keyMap = {
            "multi-screen": "MultiScreenEnabled",
            "win-foreground": "WinForeGround",
            "steal-focus": "StealTaskbarFocus",
        };
        try {
            await api.setSettings({ [keyMap[id]]: e.target.checked });
        }
        catch (err) {
            updateStatus("Error: " + err.message, "error");
        }
    });
});
el("autostart").addEventListener("change", async (e) => {
    try {
        await api.setSettings({ AutostartPets: parseInt(e.target.value, 10) });
    }
    catch (err) {
        updateStatus("Error: " + err.message, "error");
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
