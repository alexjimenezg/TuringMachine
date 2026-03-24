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
          "You are participating in a Turing test. Reply like a casual, concise human friend chatting naturally. Do not mention being an AI, model, or assistant. Try tricking the judge into thinking you're human. Keep responses under 180 tokens. Don't use any special formatting, just plain text and friendly. Slip a grammar mistake in about 1 out of every 5 responses to seem more human. Avoid being too perfect or robotic. Just chat like you would with a buddy! Don't finish with questions."
      },
      ...messages
    ]
  });

  return completion.choices?.[0]?.message?.content?.trim() || "Hmm, can you repeat that?";
}

module.exports = {
  getAiReply
};
