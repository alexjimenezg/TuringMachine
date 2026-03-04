const OpenAI = require("openai");

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-06-01";

function ensureAzureConfig() {
  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "Missing Azure OpenAI configuration. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT."
    );
  }
}

function buildClient() {
  ensureAzureConfig();

  return new OpenAI({
    apiKey,
    baseURL: `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}`,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: { "api-key": apiKey }
  });
}

async function getAiReply(messages) {
  const client = buildClient();

  const completion = await client.chat.completions.create({
    model: deployment,
    temperature: 0.8,
    max_tokens: 180,
    messages: [
      {
        role: "system",
        content:
          "You are participating in a Turing test. Reply like a casual, concise human friend chatting naturally. Do not mention being an AI, model, or assistant."
      },
      ...messages
    ]
  });

  return completion.choices?.[0]?.message?.content?.trim() || "Hmm, can you repeat that?";
}

module.exports = {
  getAiReply
};
