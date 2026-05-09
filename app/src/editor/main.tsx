import { createRoot } from "react-dom/client";
import { EditorAppRoot } from "./EditorApp";

function showBootstrapError(error: unknown) {
  const root = document.getElementById("editor-root");
  if (!root) return;
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `
    <div class="window editor-window editor-boot">
      <h1 class="titlebar">
        <span class="titlebar-icon" aria-hidden="true"></span>
        <span class="titlebar-title" id="window-title">Clod Pet - Animation Editor</span>
      </h1>
      <div class="editor-runtime-error">
        <strong>Editor failed to start.</strong>
        <pre>${message.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char))}</pre>
      </div>
    </div>
  `;
}

function bootEditor() {
  try {
    const root = document.getElementById("editor-root");
    if (!root) throw new Error("missing #editor-root");
    createRoot(root).render(<EditorAppRoot />);
  } catch (error) {
    showBootstrapError(error);
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", bootEditor, { once: true });
} else {
  bootEditor();
}

window.addEventListener("error", (event) => {
  showBootstrapError(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  showBootstrapError(event.reason);
});
