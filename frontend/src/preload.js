const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clodPet", {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, (_, data) => callback(data)),
  receive: (channel) => {
    return new Promise((resolve) => {
      ipcRenderer.once(channel, (_, data) => resolve(data));
    });
  },
});
