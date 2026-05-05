import { EditorApp } from "./EditorApp";

const app = new EditorApp();

window.addEventListener("DOMContentLoaded", () => {
  void app.init();
});

