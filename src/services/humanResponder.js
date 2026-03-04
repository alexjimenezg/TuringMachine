const fs = require("fs");
const path = require("path");

const humanRepliesPath = path.join(__dirname, "..", "..", "data", "humanReplies.json");

function getHumanReply(prompt) {
  const dataset = JSON.parse(fs.readFileSync(humanRepliesPath, "utf8"));
  const normalized = prompt.trim().toLowerCase();

  const matched = dataset.find((entry) =>
    entry.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  );

  if (matched) {
    return matched.replies[Math.floor(Math.random() * matched.replies.length)];
  }

  const fallbackPool = [
    "Haha fair question. What do you think?",
    "Not sure, but that sounds interesting.",
    "I need coffee before I answer that seriously.",
    "Can you give me more context?"
  ];

  return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
}

module.exports = {
  getHumanReply
};
