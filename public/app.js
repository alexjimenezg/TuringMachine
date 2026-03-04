let currentSessionId = null;

const aliasInput = document.getElementById("alias");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const roomCodeEl = document.getElementById("roomCode");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const roundPrompt = document.getElementById("roundPrompt");
const roundMeta = document.getElementById("roundMeta");
const chatLog = document.getElementById("chatLog");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const guessHumanBtn = document.getElementById("guessHumanBtn");
const guessAiBtn = document.getElementById("guessAiBtn");
const confidenceInput = document.getElementById("confidence");
const confidenceValue = document.getElementById("confidenceValue");
const guessResult = document.getElementById("guessResult");
const metricsOutput = document.getElementById("metricsOutput");
const briefSummary = document.getElementById("briefSummary");
const promptBank = document.getElementById("promptBank");

function addMessage(role, content) {
  const row = document.createElement("div");
  row.className = `msg ${role}`;
  row.textContent = `${role === "user" ? "You" : "Partner"}: ${content}`;
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateRoundUI(round, progress) {
  if (round) {
    roundPrompt.textContent = round.prompt;
    roundMeta.textContent = `Category: ${round.category} · Anchor: ${round.paperAnchor}`;
  }

  if (progress) {
    const pct = Math.round((progress.completion || 0) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${pct}%`;
  }
}

async function startSession() {
  const payload = {
    participantAlias: aliasInput.value.trim() || "anonymous"
  };

  const response = await fetch("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    statusEl.textContent = data.error || "Could not start session.";
    return;
  }

  currentSessionId = data.sessionId;
  roomCodeEl.textContent = `ROOM ${data.roomCode || "----"}`;
  statusEl.textContent = `Session active: ${currentSessionId.slice(0, 8)}...`;
  chatLog.innerHTML = "";
  guessResult.textContent = "";
  updateRoundUI(data.currentRound, { completion: 0 });
  addMessage("assistant", data.prompt);
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!currentSessionId || !text) return;

  addMessage("user", text);
  messageInput.value = "";

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: currentSessionId,
      message: text
    })
  });

  const data = await response.json();

  if (!response.ok) {
    addMessage("assistant", data.error || "Error replying.");
    return;
  }

  addMessage("assistant", data.reply);
  updateRoundUI(data.currentRound, data.progress);
  await refreshMetrics();
}

async function submitGuess(guess) {
  if (!currentSessionId) return;

  const response = await fetch("/api/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: currentSessionId,
      guess,
      confidence: Number(confidenceInput.value)
    })
  });

  const data = await response.json();

  if (!response.ok) {
    guessResult.textContent = data.error || "Error saving guess.";
    return;
  }

  guessResult.textContent = `${data.message} Actual partner: ${data.actual}. Score: ${data.score}`;
  await refreshMetrics();
}

async function refreshMetrics() {
  const response = await fetch("/api/metrics");
  const data = await response.json();
  metricsOutput.textContent = JSON.stringify(data, null, 2);
}

async function loadBrief() {
  const response = await fetch("/api/game/brief");
  const data = await response.json();

  briefSummary.textContent = data.summary;
  promptBank.innerHTML = "";

  data.prompts.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "prompt-item";
    card.innerHTML = `
      <h4>${entry.category.toUpperCase()}</h4>
      <p><strong>Prompt:</strong> ${entry.prompt}</p>
      <p><strong>Human-like sample:</strong> ${entry.humanStyleExample}</p>
      <p><strong>Judge hint:</strong> ${entry.judgeHint}</p>
    `;
    promptBank.appendChild(card);
  });
}

startBtn.addEventListener("click", startSession);
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});
guessHumanBtn.addEventListener("click", () => submitGuess("HUMAN"));
guessAiBtn.addEventListener("click", () => submitGuess("AI"));
confidenceInput.addEventListener("input", () => {
  confidenceValue.textContent = confidenceInput.value;
});

refreshMetrics();
loadBrief();
