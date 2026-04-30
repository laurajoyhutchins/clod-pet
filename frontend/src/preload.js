"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("clodPet", {
    send: (channel, data) => electron_1.ipcRenderer.send(channel, data),
    on: (channel, callback) => {
        const listener = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(channel, listener);
        return () => electron_1.ipcRenderer.removeListener(channel, listener);
    },
    off: (channel, callback) => electron_1.ipcRenderer.removeListener(channel, callback),
    once: (channel, callback) => electron_1.ipcRenderer.once(channel, (_event, data) => callback(data)),
    invoke: (channel, data) => electron_1.ipcRenderer.invoke(channel, data),
    control: {
        getSettings: () => electron_1.ipcRenderer.invoke("control:get-settings"),
        setSettings: (settings) => electron_1.ipcRenderer.invoke("control:set-settings", settings),
        listPets: () => electron_1.ipcRenderer.invoke("control:list-pets"),
        listActive: () => electron_1.ipcRenderer.invoke("control:list-active"),
        addPet: (petName) => electron_1.ipcRenderer.invoke("control:add-pet", petName),
        removePet: (petId) => electron_1.ipcRenderer.invoke("control:remove-pet", petId),
        setVolume: (volume) => electron_1.ipcRenderer.invoke("control:set-volume", volume),
        setScale: (scale) => electron_1.ipcRenderer.invoke("control:set-scale", scale),
        diagnostics: () => electron_1.ipcRenderer.invoke("control:diagnostics"),
        reportError: (source, message, stack) => electron_1.ipcRenderer.invoke("control:renderer-error", { source, message, stack }),
    },
});
