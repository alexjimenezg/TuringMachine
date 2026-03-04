const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { addSession, appendMessage, addGuess, getSessionById, getSummary } = require("../services/dataStore");
const { getAiReply } = require("../services/azureOpenAI");
const { getHumanReply } = require("../services/humanResponder");
const {
  loadPromptBank,
  buildSessionRounds,
  computeRoundProgress,
  computeGuessScore
} = require("../services/imitationGame");

const router = express.Router();

function chooseSessionType() {
  const ratio = Number(process.env.AI_SESSION_RATIO || 0.5);
  return Math.random() < ratio ? "AI" : "HUMAN";
}

router.post("/session/start", async (req, res) => {
  const participantAlias = String(req.body?.participantAlias || "anonymous").slice(0, 60);
  const sessionType = chooseSessionType();
  const rounds = buildSessionRounds(4);

  const session = {
    id: uuidv4(),
    participantAlias,
    assignedType: sessionType,
    mode: "IMITATION_1950",
    roomCode: uuidv4().split("-")[0].toUpperCase(),
    rounds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  };

  await addSession(session);

  res.json({
    sessionId: session.id,
    roomCode: session.roomCode,
    mode: session.mode,
    prompt: "Imitation Game started. Use the round prompt to interrogate your hidden partner.",
    currentRound: session.rounds[0]
  });
});

router.get("/session/:sessionId/state", async (req, res) => {
  const session = await getSessionById(req.params.sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const roundCount = session.rounds?.length || 4;
  const progress = computeRoundProgress(session.messages.length, roundCount);
  const roundIndex = Math.min(roundCount - 1, progress.currentRound - 1);

  res.json({
    sessionId: session.id,
    roomCode: session.roomCode,
    mode: session.mode,
    progress,
    currentRound: session.rounds?.[roundIndex] || null
  });
});

router.post("/chat", async (req, res) => {
  const { sessionId, message } = req.body || {};

  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId and message are required" });
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const userMessage = {
    role: "user",
    content: String(message).slice(0, 500),
    timestamp: new Date().toISOString()
  };

  await appendMessage(sessionId, userMessage);

  let reply;
  const roundCount = session.rounds?.length || 4;
  const progress = computeRoundProgress(session.messages.length, roundCount);
  const activeRound = session.rounds?.[Math.min(roundCount - 1, progress.currentRound - 1)] || null;

  try {
    if (session.assignedType === "AI") {
      const chatHistory = [...session.messages, userMessage].map((entry) => ({
        role: entry.role,
        content: entry.content
      }));

      if (activeRound) {
        chatHistory.unshift({
          role: "system",
          content: `Current imitation-game round: ${activeRound.prompt}`
        });
      }

      reply = await getAiReply(chatHistory);
    } else {
      reply = getHumanReply(`${activeRound?.category || "general"} ${userMessage.content}`);
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "Error generating response" });
  }

  const assistantMessage = {
    role: "assistant",
    content: reply,
    timestamp: new Date().toISOString()
  };

  await appendMessage(sessionId, assistantMessage);

  const updatedMessageCount = session.messages.length + 2;
  const updatedProgress = computeRoundProgress(updatedMessageCount, roundCount);
  const nextRound = session.rounds?.[Math.min(roundCount - 1, updatedProgress.currentRound - 1)] || null;

  res.json({
    reply,
    progress: updatedProgress,
    currentRound: nextRound
  });
});

router.post("/guess", async (req, res) => {
  const { sessionId, guess, confidence } = req.body || {};

  if (!sessionId || !guess) {
    return res.status(400).json({ error: "sessionId and guess are required" });
  }

  const normalizedGuess = String(guess).toUpperCase();
  if (!["AI", "HUMAN"].includes(normalizedGuess)) {
    return res.status(400).json({ error: "guess must be AI or HUMAN" });
  }

  const session = await getSessionById(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const scoreDetails = computeGuessScore({
    isCorrect: normalizedGuess === session.assignedType,
    confidence,
    messageCount: session.messages.length,
    roundCount: session.rounds?.length || 4
  });

  const guessRecord = {
    id: uuidv4(),
    sessionId,
    guess: normalizedGuess,
    actual: session.assignedType,
    correct: normalizedGuess === session.assignedType,
    messageCount: session.messages.length,
    confidence: scoreDetails.confidence,
    calibration: scoreDetails.calibration,
    engagement: scoreDetails.engagement,
    score: scoreDetails.score,
    guessedAt: new Date().toISOString()
  };

  await addGuess(guessRecord);

  res.json({
    correct: guessRecord.correct,
    message: guessRecord.correct ? "Correct guess." : "Wrong guess.",
    actual: session.assignedType,
    score: guessRecord.score,
    calibration: guessRecord.calibration
  });
});

router.get("/game/brief", (_req, res) => {
  const promptBank = loadPromptBank();
  res.json({
    mode: "IMITATION_1950",
    summary:
      "Inspired by Turing's text-only imitation game: interrogate via language, then decide if the partner is human or machine.",
    prompts: promptBank
  });
});

router.get("/metrics", async (_req, res) => {
  const summary = await getSummary();
  res.json(summary);
});

module.exports = router;
