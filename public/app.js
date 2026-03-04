const socket = io();

const aliasInput = document.getElementById("alias");
const startBtn = document.getElementById("startBtn");
const leaveQueueBtn = document.getElementById("leaveQueueBtn");
const statusEl = document.getElementById("status");
const roomCodeEl = document.getElementById("roomCode");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const roundPrompt = document.getElementById("roundPrompt");
const roundMeta = document.getElementById("roundMeta");
const chatLog = document.getElementById("chatLog");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const guessABtn = document.getElementById("guessABtn");
const guessBBtn = document.getElementById("guessBBtn");
const guessResult = document.getElementById("guessResult");
const metricsOutput = document.getElementById("metricsOutput");
const roleInfo = document.getElementById("roleInfo");
const entityInfo = document.getElementById("entityInfo");
const roundInfo = document.getElementById("roundInfo");

const howToPlayModal = document.getElementById("howToPlayModal");
const howToPlayConfirmBtn = document.getElementById("howToPlayConfirmBtn");
const matchmakingModal = document.getElementById("matchmakingModal");
const roleModal = document.getElementById("roleModal");
const roleModalTitle = document.getElementById("roleModalTitle");
const roleModalBody = document.getElementById("roleModalBody");
const roleModalConfirmBtn = document.getElementById("roleModalConfirmBtn");
const winnerModal = document.getElementById("winnerModal");
const winnerText = document.getElementById("winnerText");
const winnerConfirmBtn = document.getElementById("winnerConfirmBtn");

const state = {
  matchId: null,
  role: null,
  controlledEntity: null,
  round: 0,
  maxRounds: 4
};

function setProgress(round, maxRounds) {
  const completion = Math.min(100, Math.round(((round - 1) / maxRounds) * 100));
  progressFill.style.width = `${completion}%`;
  progressText.textContent = `${completion}%`;
  roundInfo.textContent = `Round: ${Math.min(round, maxRounds)} / ${maxRounds}`;
}

function addMessage(role, content) {
  const row = document.createElement("div");
  row.className = `msg ${role}`;
  row.textContent = content;
  chatLog.appendChild(row);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function showModal(modal) {
  modal.classList.remove("hidden");
}

function hideModal(modal) {
  modal.classList.add("hidden");
}

function resetMatchState() {
  state.matchId = null;
  state.role = null;
  state.controlledEntity = null;
  state.round = 0;
  state.maxRounds = 4;
  roomCodeEl.textContent = "MATCH ----";
  roleInfo.textContent = "No role assigned.";
  entityInfo.textContent = "Entity: --";
  roundPrompt.textContent = "Find a match to begin.";
  roundMeta.textContent = "Role: --";
  guessResult.textContent = "";
  setProgress(1, 4);
  guessABtn.disabled = true;
  guessBBtn.disabled = true;
}

function updateInteractionLocks() {
  const isJudge = state.role === "JUDGE";
  const isHuman = state.role === "HUMAN";
  guessABtn.disabled = !isJudge;
  guessBBtn.disabled = !isJudge;
  sendBtn.disabled = !state.role;

  if (isJudge) {
    messageInput.placeholder = "Judge: ask one question for both entities";
  } else if (isHuman) {
    messageInput.placeholder = "Human entity: answer judge prompt naturally";
  } else {
    messageInput.placeholder = "Find a match first";
  }
}

function appendFeed(eventText, payload = null) {
  const stamp = new Date().toLocaleTimeString();
  const next = payload ? `${eventText}\n${JSON.stringify(payload, null, 2)}` : eventText;
  metricsOutput.textContent = `[${stamp}] ${next}\n\n${metricsOutput.textContent}`;
}

startBtn.addEventListener("click", () => {
  const alias = aliasInput.value.trim() || "anonymous";
  socket.emit("queue:join", { alias });
  statusEl.textContent = "Searching for player...";
  showModal(matchmakingModal);
  appendFeed("Queue joined");
});

leaveQueueBtn.addEventListener("click", () => {
  socket.emit("queue:leave");
  hideModal(matchmakingModal);
  statusEl.textContent = "Left matchmaking queue.";
  appendFeed("Queue left");
});

sendBtn.addEventListener("click", () => {
  const text = messageInput.value.trim();
  if (!text || !state.role) return;

  if (state.role === "JUDGE") {
    socket.emit("judge:prompt", { text });
    addMessage("user", `Judge prompt: ${text}`);
    appendFeed("Judge prompt sent", { text });
  } else if (state.role === "HUMAN") {
    socket.emit("human:reply", { text });
    addMessage("user", `You (${state.controlledEntity}) replied: ${text}`);
    appendFeed("Human reply sent", { text });
  }

  messageInput.value = "";
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendBtn.click();
  }
});

guessABtn.addEventListener("click", () => {
  socket.emit("judge:verdict", { humanGuess: "A" });
  appendFeed("Judge verdict submitted", { humanGuess: "A" });
});

guessBBtn.addEventListener("click", () => {
  socket.emit("judge:verdict", { humanGuess: "B" });
  appendFeed("Judge verdict submitted", { humanGuess: "B" });
});

howToPlayConfirmBtn.addEventListener("click", () => {
  hideModal(howToPlayModal);
});

roleModalConfirmBtn.addEventListener("click", () => {
  hideModal(roleModal);
});

winnerConfirmBtn.addEventListener("click", () => {
  hideModal(winnerModal);
  chatLog.innerHTML = "";
  metricsOutput.textContent = "Waiting for events...";
  resetMatchState();
  updateInteractionLocks();
});

socket.on("queue:joined", () => {
  statusEl.textContent = "Waiting for another player...";
});

socket.on("match:found", (payload) => {
  hideModal(matchmakingModal);
  state.matchId = payload.matchId;
  state.role = payload.role;
  state.controlledEntity = payload.controlledEntity || null;
  state.maxRounds = payload.maxRounds || 4;
  state.round = 1;

  roomCodeEl.textContent = `MATCH ${payload.matchId.slice(0, 8).toUpperCase()}`;
  roleInfo.textContent = `Role: ${payload.role}`;
  entityInfo.textContent = payload.controlledEntity
    ? `Entity: ${payload.controlledEntity}`
    : "Entity: hidden";
  roundPrompt.textContent = "Waiting for first prompt.";
  roundMeta.textContent = payload.roleMessage;
  statusEl.textContent = "Match found.";

  setProgress(1, state.maxRounds);
  updateInteractionLocks();

  roleModalTitle.textContent = `Role Assigned: ${payload.role}`;
  roleModalBody.textContent = payload.roleMessage;
  showModal(roleModal);

  appendFeed("Match found", payload);
});

socket.on("human:prompt", (payload) => {
  state.round = payload.round;
  roundPrompt.textContent = payload.prompt;
  roundMeta.textContent = `Reply as Entity ${payload.entity}`;
  setProgress(payload.round, payload.maxRounds);
  addMessage("assistant", `Judge asks: ${payload.prompt}`);
  appendFeed("Prompt received for human", payload);
});

socket.on("round:pending", (payload) => {
  state.round = payload.round;
  roundPrompt.textContent = payload.prompt;
  roundMeta.textContent = "Waiting for Entity A and B responses...";
  setProgress(payload.round, payload.maxRounds);
  appendFeed("Round pending", payload);
});

socket.on("round:result", (payload) => {
  state.round = payload.round;
  setProgress(payload.round + 1, payload.maxRounds);
  addMessage("assistant", `Entity A: ${payload.responses.A}`);
  addMessage("assistant", `Entity B: ${payload.responses.B}`);
  roundPrompt.textContent = payload.lastRound
    ? "Final round done. Submit your verdict."
    : "Ask your next question.";
  roundMeta.textContent = payload.lastRound
    ? "Use the verdict buttons now."
    : `Round ${payload.round + 1} ready`;
  appendFeed("Round result delivered", payload);
});

socket.on("round:complete", (payload) => {
  state.round = payload.round;
  setProgress(payload.round + 1, payload.maxRounds);
  roundPrompt.textContent = "Waiting for next judge prompt...";
  appendFeed("Round complete", payload);
});

socket.on("match:ended", (payload) => {
  hideModal(matchmakingModal);
  const winnerTextBody =
    payload.winner === "JUDGE"
      ? "Judge wins: Human entity was correctly identified."
      : "Entities win: Judge could not identify the human correctly.";

  winnerText.textContent = `${winnerTextBody} Human was Entity ${payload.humanEntity}.`;
  showModal(winnerModal);
  statusEl.textContent = "Match ended.";
  appendFeed("Match ended", payload);
  updateInteractionLocks();
});

resetMatchState();
updateInteractionLocks();
