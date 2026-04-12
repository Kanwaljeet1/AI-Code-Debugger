const editor = ace.edit("editor");
const languageSelect = document.getElementById("language");
const statusbar = document.getElementById("statusbar");
const readSelectionBtn = document.getElementById("read-selection");
const clearEditorBtn = document.getElementById("clear-editor");
const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const micLabel = document.getElementById("mic-label");
const micStateDot = document.querySelector(".dot");
const speakToggle = document.getElementById("speak-toggle");
const insertTranscriptBtn = document.getElementById("insert-transcript");
const resetChatBtn = document.getElementById("reset-chat");
const micState = document.getElementById("mic-state");

const MODE_MAP = {
  javascript: "ace/mode/javascript",
  typescript: "ace/mode/typescript",
  python: "ace/mode/python",
  html: "ace/mode/html",
  css: "ace/mode/css",
  json: "ace/mode/json",
  cpp: "ace/mode/c_cpp",
};

// Editor setup
editor.setTheme("ace/theme/tomorrow_night");
editor.session.setMode(MODE_MAP.javascript);
editor.session.setUseSoftTabs(true);
editor.session.setTabSize(2);
editor.setShowPrintMargin(false);
editor.setOptions({
  fontFamily: "JetBrains Mono, monospace",
  fontSize: "14px",
  wrap: true,
});

const starter = `// Voice-ready editor demo\n// Try: hold the mic, say \"explain selection\" or \"insert transcript\".\nfunction hello(name) {\n  return 'Hello, ' + name + '!';\n}\n\nconsole.log(hello('world'));`;

if (!localStorage.getItem("voice-editor-code")) {
  editor.session.setValue(starter);
} else {
  editor.session.setValue(localStorage.getItem("voice-editor-code"));
}

const savedLang = localStorage.getItem("voice-editor-lang");
if (savedLang && MODE_MAP[savedLang]) {
  languageSelect.value = savedLang;
  editor.session.setMode(MODE_MAP[savedLang]);
}

function updateStatus() {
  const pos = editor.getCursorPosition();
  statusbar.textContent = `line ${pos.row + 1}, col ${pos.column + 1} • ${languageSelect.value} • tabs: ${editor.session.getTabSize()}`;
  localStorage.setItem("voice-editor-code", editor.getValue());
}

languageSelect.addEventListener("change", () => {
  const lang = languageSelect.value;
  editor.session.setMode(MODE_MAP[lang] || MODE_MAP.javascript);
  localStorage.setItem("voice-editor-lang", lang);
  updateStatus();
});

editor.getSession().selection.on("changeCursor", updateStatus);
editor.session.on("change", updateStatus);
updateStatus();

// Utilities
function speak(text) {
  if (!speakToggle.checked || !window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.02;
  utter.pitch = 1.0;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const label = document.createElement("small");
  label.textContent = role === "user" ? "You" : "Assistant";
  const content = document.createElement("div");
  content.textContent = text;
  div.append(label, content);
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  if (role === "assistant") speak(text);
}

function summarizeSelection() {
  const selection = editor.getSelectedText();
  const content = selection || editor.getValue();
  if (!content.trim()) return "The editor is empty.";
  const lines = content.split("\n");
  const sample = lines.slice(0, 6).join("\n");
  return selection
    ? `You selected ${lines.length} line(s). First lines:\n${sample}`
    : `The document has ${lines.length} line(s). First lines:\n${sample}`;
}

function insertTextAtCursor(text) {
  const cursor = editor.getCursorPosition();
  editor.session.insert(cursor, text);
  editor.focus();
  updateStatus();
}

// Voice recognition setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let lastTranscript = "";

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => setMicState("Listening…", true);
  recognition.onend = () => setMicState("Mic idle", false);
  recognition.onerror = (e) => setMicState(`Mic error: ${e.error}`, false);

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    chatInput.value = transcript.trim();
    if (event.results[event.results.length - 1].isFinal) {
      lastTranscript = transcript.trim();
    }
  };
} else {
  micBtn.disabled = true;
  micState.textContent = "Speech recognition not supported here.";
}

function setMicState(label, live) {
  micLabel.textContent = label;
  micStateDot.classList.toggle("live", !!live);
  listening = !!live;
}

function toggleMic() {
  if (!recognition) return;
  if (listening) {
    recognition.stop();
    return;
  }
  try {
    recognition.start();
  } catch (err) {
    // Calling start twice throws; ignore.
  }
}

micBtn.addEventListener("click", toggleMic);

// Chat logic
function generateAssistantReply(message) {
  const lower = message.toLowerCase();

  if (lower.includes("explain selection") || lower.includes("explain this")) {
    return summarizeSelection();
  }
  if (lower.includes("read selection") || lower.includes("speak selection")) {
    const text = editor.getSelectedText() || "Nothing selected.";
    speak(text || "Nothing selected.");
    return text ? "Reading the current selection." : "Select code to read it aloud.";
  }
  if (lower.includes("insert transcript")) {
    if (!lastTranscript) return "No transcript yet. Hold the mic and speak first.";
    insertTextAtCursor(lastTranscript + "\n");
    return "Inserted the last transcript at the cursor.";
  }
  if (lower.startsWith("insert ")) {
    insertTextAtCursor(message.replace(/^insert\s+/i, "") + "\n");
    return "Inserted into the editor.";
  }
  if (lower.includes("what is selected") || lower.includes("selection")) {
    return summarizeSelection();
  }
  if (lower.includes("clear editor")) {
    editor.setValue("");
    return "Editor cleared.";
  }

  return "Got it. I can explain or read selections, or insert your transcript. Say 'explain selection' or 'insert transcript'.";
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  appendMessage("user", text);
  const reply = generateAssistantReply(text);
  appendMessage("assistant", reply);
  chatInput.value = "";
}

sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

readSelectionBtn.addEventListener("click", () => {
  const text = editor.getSelectedText();
  speak(text || "Nothing selected.");
});

clearEditorBtn.addEventListener("click", () => {
  editor.setValue("");
  appendMessage("assistant", "Cleared the editor.");
});

insertTranscriptBtn.addEventListener("click", () => {
  if (!lastTranscript) {
    appendMessage("assistant", "No transcript yet. Hold the mic to capture speech.");
    return;
  }
  insertTextAtCursor(lastTranscript + "\n");
  appendMessage("assistant", "Inserted the last transcript into the editor.");
});

resetChatBtn.addEventListener("click", () => {
  chatLog.innerHTML = "";
  appendMessage("assistant", "New chat started.");
});

// Initial message
appendMessage("assistant", "Voice chat ready. Hold the mic to dictate, then say 'insert transcript' to drop it into the editor.");
