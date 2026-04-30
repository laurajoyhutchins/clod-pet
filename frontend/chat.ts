(function() {
const api = (window as any).clodPet.control;

const chatContainer = document.getElementById("chat-container") as HTMLDivElement;
const chatInput = document.getElementById("chat-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

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

chatInput.focus();
})();
