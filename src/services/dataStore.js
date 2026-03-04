const fs = require("fs/promises");
const path = require("path");

const dataDir = path.join(__dirname, "..", "..", "data");
const experimentsPath = path.join(dataDir, "experiments.json");

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(experimentsPath);
  } catch {
    const initialData = {
      sessions: [],
      guesses: [],
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(experimentsPath, JSON.stringify(initialData, null, 2), "utf8");
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(experimentsPath, "utf8");
  return JSON.parse(raw);
}

async function writeData(payload) {
  await ensureDataFile();
  await fs.writeFile(experimentsPath, JSON.stringify(payload, null, 2), "utf8");
}

async function addSession(session) {
  const data = await readData();
  data.sessions.push(session);
  await writeData(data);
}

async function appendMessage(sessionId, message) {
  const data = await readData();
  const session = data.sessions.find((entry) => entry.id === sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  session.messages.push(message);
  session.updatedAt = new Date().toISOString();
  await writeData(data);
}

async function addGuess(guessRecord) {
  const data = await readData();
  data.guesses.push(guessRecord);
  await writeData(data);
}

async function getSessionById(sessionId) {
  const data = await readData();
  return data.sessions.find((entry) => entry.id === sessionId) || null;
}

async function getSummary() {
  const data = await readData();
  const totalGuesses = data.guesses.length;
  const correctGuesses = data.guesses.filter((entry) => entry.correct).length;
  const aiGuessesAsHuman = data.guesses.filter(
    (entry) => entry.actual === "AI" && entry.guess === "HUMAN"
  ).length;

  const confidenceValues = data.guesses
    .map((entry) => Number(entry.confidence))
    .filter((value) => !Number.isNaN(value));

  const accuracy = totalGuesses === 0 ? 0 : Number((correctGuesses / totalGuesses).toFixed(4));
  const deceptionRate =
    totalGuesses === 0 ? 0 : Number((aiGuessesAsHuman / totalGuesses).toFixed(4));
  const averageConfidence =
    confidenceValues.length === 0
      ? 0
      : Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(2));

  const aiSessions = data.sessions.filter((session) => session.assignedType === "AI").length;
  const humanSessions = data.sessions.filter((session) => session.assignedType === "HUMAN").length;

  return {
    totalSessions: data.sessions.length,
    aiSessions,
    humanSessions,
    totalGuesses,
    correctGuesses,
    accuracy,
    deceptionRate,
    averageConfidence
  };
}

module.exports = {
  addSession,
  appendMessage,
  addGuess,
  getSessionById,
  getSummary
};
