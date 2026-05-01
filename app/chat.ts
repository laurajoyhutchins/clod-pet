(function() {
const api = (window as any).clodPet.control;
const store = (window as any).clodPet.store;

const chatContainer = document.getElementById("chat-container") as HTMLDivElement;
const chatInput = document.getElementById("chat-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
let backendStatusBanner: HTMLDivElement | null = null;
let backendStatusRefreshTimer: any = null;

let messages = [
  { role: "assistant", content: "Hello! I'm your clod-pet. How can I help you today?" }
];

function addMessage(role: string, content: string) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = content;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

function ensureBackendStatusBanner() {
  if (backendStatusBanner) return backendStatusBanner;

  backendStatusBanner = document.createElement("div");
  backendStatusBanner.style.margin = "12px 15px 0";
  backendStatusBanner.style.padding = "8px 10px";
  backendStatusBanner.style.borderRadius = "8px";
  backendStatusBanner.style.fontSize = "12px";
  backendStatusBanner.style.lineHeight = "1.35";
  backendStatusBanner.style.display = "none";
  backendStatusBanner.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  backendStatusBanner.style.background = "rgba(233, 69, 96, 0.18)";
  backendStatusBanner.style.color = "#ffd7de";
  chatContainer.parentElement?.insertBefore(backendStatusBanner, chatContainer);
  return backendStatusBanner;
}

function updateBackendStatus(backend: any) {
  const banner = ensureBackendStatusBanner();
  const fatal = backend.lastError || "unexpected crash";

  if (backend.status === "fatal" || backend.status === "failed" || backend.available === false) {
    banner.textContent = `Backend unavailable: ${fatal}`;
    banner.style.display = "block";
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.placeholder = "Backend unavailable";
    return;
  }

  if (backend.status === "restarting") {
    banner.textContent = "Backend restarting after a crash. Chat is temporarily disabled.";
    banner.style.display = "block";
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.placeholder = "Backend restarting";
    return;
  }

  banner.style.display = "none";
  chatInput.disabled = false;
  sendBtn.disabled = false;
  chatInput.placeholder = "Type a message...";
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  chatInput.disabled = true;
  sendBtn.disabled = true;

  addMessage("user", text);
  messages.push({ role: "user", content: text });

  const assistantMsgDiv = addMessage("assistant", "");
  let assistantContent = "";

  try {
    await api.streamChat(messages, (event: any) => {
      if (event.content) {
        assistantContent += event.content;
        assistantMsgDiv.textContent = assistantContent;
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      if (event.done) {
        messages.push({ role: "assistant", content: assistantContent });
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
      }
      if (event.error) {
        assistantMsgDiv.textContent = "Error: " + event.error;
        chatInput.disabled = false;
        sendBtn.disabled = false;
      }
    });
  } catch (err: any) {
    assistantMsgDiv.textContent = "Error: " + err.message;
    chatInput.disabled = false;
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Subscribe to store for real-time status updates
const unsubscribeStore = store.subscribe((state: any) => {
  updateBackendStatus(state.backend);
});

// Initial state
store.getState().then((state: any) => updateBackendStatus(state.backend));

window.addEventListener("beforeunload", () => {
  unsubscribeStore();
});

chatInput.focus();
})();
