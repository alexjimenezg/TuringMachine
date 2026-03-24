const { v4: uuidv4 } = require("uuid");
const { getAiReply } = require("./azureOpenAI");
const { addConversation } = require("./dataStore");

const MAX_ROUNDS = 4;

function createPairingHub(io) {
  let waitingPlayer = null;
  const matches = new Map();
  const playerToMatch = new Map();

  function emitWaitingCount() {
    const waitingCount = waitingPlayer ? 1 : 0;
    io.emit("queue:count", { waitingCount });
  }

  function resetWaitingPlayer(socketId) {
    if (waitingPlayer && waitingPlayer.socketId === socketId) {
      waitingPlayer = null;
      emitWaitingCount();
    }
  }

  function getMatchContext(socketId) {
    const binding = playerToMatch.get(socketId);
    if (!binding) return null;
    const match = matches.get(binding.matchId);
    if (!match) return null;

    return {
      binding,
      match
    };
  }

  function tryFinishRound(match) {
    if (!match.pendingPrompt) return;
    if (!match.pendingPrompt.aiReply || !match.pendingPrompt.humanReply) return;

    const judgeSocket = io.sockets.sockets.get(match.judgeSocketId);
    const humanSocket = io.sockets.sockets.get(match.humanSocketId);

    const responses = {
      A: match.entityMap.A === "AI" ? match.pendingPrompt.aiReply : match.pendingPrompt.humanReply,
      B: match.entityMap.B === "AI" ? match.pendingPrompt.aiReply : match.pendingPrompt.humanReply
    };

    const promptText = match.pendingPrompt.text;
    const roundNumber = match.currentRound;

    match.transcript.push({
      round: roundNumber,
      prompt: promptText,
      responses,
      at: new Date().toISOString()
    });

    match.pendingPrompt = null;

    if (judgeSocket) {
      judgeSocket.emit("round:result", {
        round: roundNumber,
        maxRounds: MAX_ROUNDS,
        prompt: promptText,
        responses,
        verdictEnabled: true,
        lastRound: roundNumber >= MAX_ROUNDS
      });
    }

    if (humanSocket) {
      humanSocket.emit("round:complete", {
        round: roundNumber,
        maxRounds: MAX_ROUNDS
      });
    }

    match.currentRound += 1;
  }

  async function buildAiReply(match, promptText) {
    const historyWithPrompt = [
      ...match.aiHistory,
      {
        role: "user",
        content: promptText
      }
    ];

    const reply = await getAiReply(historyWithPrompt);

    match.aiHistory = [
      ...historyWithPrompt,
      {
        role: "assistant",
        content: reply
      }
    ];

    return reply;
  }

  async function endMatch(match, winner) {
    if (match.ended) return;
    match.ended = true;

    playerToMatch.delete(match.judgeSocketId);
    playerToMatch.delete(match.humanSocketId);
    matches.delete(match.id);

    const endedAt = new Date().toISOString();

    try {
      await addConversation({
        id: uuidv4(),
        matchId: match.id,
        winner,
        humanEntity: match.humanEntity,
        aiEntity: match.aiEntity,
        roundCount: match.transcript.length,
        transcript: match.transcript,
        createdAt: match.createdAt,
        endedAt
      });
    } catch {
      // Avoid interrupting real-time gameplay if file persistence fails.
    }

    const judgeSocket = io.sockets.sockets.get(match.judgeSocketId);
    const humanSocket = io.sockets.sockets.get(match.humanSocketId);

    const payload = {
      winner,
      humanEntity: match.humanEntity,
      aiEntity: match.aiEntity,
      transcript: match.transcript,
      endedAt
    };

    if (judgeSocket) judgeSocket.emit("match:ended", payload);
    if (humanSocket) humanSocket.emit("match:ended", payload);
  }

  io.on("connection", (socket) => {
    socket.on("queue:join", ({ alias }) => {
      const player = {
        socketId: socket.id,
        alias: String(alias || "anonymous").slice(0, 60)
      };

      if (!waitingPlayer || waitingPlayer.socketId === socket.id) {
        waitingPlayer = player;
        socket.emit("queue:joined", { waiting: true });
        emitWaitingCount();
        return;
      }

      const first = waitingPlayer;
      const second = player;
      waitingPlayer = null;
      emitWaitingCount();

      const judgeFirst = Math.random() < 0.5;
      const judgeSocketId = judgeFirst ? first.socketId : second.socketId;
      const humanSocketId = judgeFirst ? second.socketId : first.socketId;

      const humanEntity = Math.random() < 0.5 ? "A" : "B";
      const aiEntity = humanEntity === "A" ? "B" : "A";

      const match = {
        id: uuidv4(),
        judgeSocketId,
        humanSocketId,
        entityMap: {
          A: humanEntity === "A" ? "HUMAN" : "AI",
          B: humanEntity === "B" ? "HUMAN" : "AI"
        },
        humanEntity,
        aiEntity,
        aiHistory: [],
        pendingPrompt: null,
        currentRound: 1,
        transcript: [],
        createdAt: new Date().toISOString(),
        ended: false
      };

      matches.set(match.id, match);
      playerToMatch.set(judgeSocketId, { matchId: match.id, role: "JUDGE" });
      playerToMatch.set(humanSocketId, { matchId: match.id, role: "HUMAN" });

      const judgeSocket = io.sockets.sockets.get(judgeSocketId);
      const humanSocket = io.sockets.sockets.get(humanSocketId);

      if (judgeSocket) {
        judgeSocket.emit("match:found", {
          matchId: match.id,
          role: "JUDGE",
          entities: ["A", "B"],
          maxRounds: MAX_ROUNDS,
          roleMessage: "You are the Judge. Interrogate both entities and decide who is human."
        });
      }

      if (humanSocket) {
        humanSocket.emit("match:found", {
          matchId: match.id,
          role: "HUMAN",
          controlledEntity: humanEntity,
          maxRounds: MAX_ROUNDS,
          roleMessage: `You are the Human Entity (${humanEntity}). Reply naturally and try not to be detected.`
        });
      }
    });

    socket.on("queue:leave", () => {
      resetWaitingPlayer(socket.id);
    });

    socket.on("judge:prompt", async ({ text }) => {
      const context = getMatchContext(socket.id);
      if (!context) return;
      const { binding, match } = context;
      if (binding.role !== "JUDGE") return;
      if (match.pendingPrompt) return;
      if (match.currentRound > MAX_ROUNDS) return;

      const promptText = String(text || "").trim().slice(0, 500);
      if (!promptText) return;

      match.pendingPrompt = {
        text: promptText,
        aiReply: null,
        humanReply: null
      };

      const humanSocket = io.sockets.sockets.get(match.humanSocketId);
      if (humanSocket) {
        humanSocket.emit("human:prompt", {
          round: match.currentRound,
          maxRounds: MAX_ROUNDS,
          prompt: promptText,
          entity: match.humanEntity
        });
      }

      const judgeSocket = io.sockets.sockets.get(match.judgeSocketId);
      if (judgeSocket) {
        judgeSocket.emit("round:pending", {
          round: match.currentRound,
          maxRounds: MAX_ROUNDS,
          prompt: promptText
        });
      }

      try {
        const aiReply = await buildAiReply(match, promptText);
        if (!match.pendingPrompt) return;
        match.pendingPrompt.aiReply = aiReply;
        tryFinishRound(match);
      } catch {
        if (!match.pendingPrompt) return;
        match.pendingPrompt.aiReply = "I need a second to think about that.";
        tryFinishRound(match);
      }
    });

    socket.on("human:reply", ({ text }) => {
      const context = getMatchContext(socket.id);
      if (!context) return;
      const { binding, match } = context;
      if (binding.role !== "HUMAN") return;
      if (!match.pendingPrompt) return;

      const replyText = String(text || "").trim().slice(0, 500);
      if (!replyText) return;

      match.pendingPrompt.humanReply = replyText;
      tryFinishRound(match);
    });

    socket.on("judge:verdict", ({ humanGuess }) => {
      const context = getMatchContext(socket.id);
      if (!context) return;
      const { binding, match } = context;
      if (binding.role !== "JUDGE") return;

      const normalizedGuess = String(humanGuess || "").toUpperCase();
      if (!["A", "B"].includes(normalizedGuess)) return;

      const judgeWins = normalizedGuess === match.humanEntity;
      endMatch(match, judgeWins ? "JUDGE" : "ENTITIES");
    });

    socket.on("disconnect", () => {
      resetWaitingPlayer(socket.id);

      const context = getMatchContext(socket.id);
      if (!context) return;
      const { match } = context;
      endMatch(match, "ENTITIES");
    });
  });
}

module.exports = {
  createPairingHub
};
