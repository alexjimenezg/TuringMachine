const fs = require("fs");
const path = require("path");

const promptPath = path.join(__dirname, "..", "..", "data", "imitationGamePrompts.json");

function loadPromptBank() {
  const raw = fs.readFileSync(promptPath, "utf8");
  return JSON.parse(raw);
}

function shuffle(array) {
  const cloned = [...array];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function buildSessionRounds(roundCount = 4) {
  const bank = loadPromptBank();
  return shuffle(bank).slice(0, roundCount);
}

function computeRoundProgress(messageCount, roundCount) {
  const turns = Math.floor(messageCount / 2);
  const round = Math.min(roundCount, Math.max(1, turns + 1));
  const completion = Math.min(1, turns / roundCount);

  return {
    turns,
    currentRound: round,
    completion: Number(completion.toFixed(2))
  };
}

function computeGuessScore({ isCorrect, confidence, messageCount, roundCount }) {
  const boundedConfidence = Math.min(100, Math.max(50, Number(confidence || 50)));
  const calibration = isCorrect ? boundedConfidence : 100 - boundedConfidence;
  const roundsPlayed = Math.min(roundCount, Math.floor(messageCount / 2));
  const engagement = (roundsPlayed / roundCount) * 100;

  const score = Math.round((isCorrect ? 70 : 0) + calibration * 0.2 + engagement * 0.1);

  return {
    confidence: boundedConfidence,
    calibration: Number(calibration.toFixed(2)),
    engagement: Number(engagement.toFixed(2)),
    score
  };
}

module.exports = {
  loadPromptBank,
  buildSessionRounds,
  computeRoundProgress,
  computeGuessScore
};
