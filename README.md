# TuringMachine

Node.js web app to run a Turing-test style experiment with your friends using Azure OpenAI.

Now includes an **Imitation Game mode** inspired by Turing's 1950 framing: text-only interrogation rounds, hidden identity, final verdict with confidence, and computed scoring.

## What this project does

- Starts a chat session for each participant.
- Builds a paper-inspired round sequence (`identity`, `language`, `creativity`, `reasoning`, etc.).
- Randomly assigns each session to either:
	- `AI` (Azure OpenAI), or
	- `HUMAN` (human-like seeded response dataset).
- Stores all experiment data:
	- session metadata,
	- room code and round sequence,
	- full message history,
	- final participant guess,
	- confidence and computed score,
	- whether the guess was correct.
- Shows live metrics in the UI and via API.

## Project structure

- `src/server.js`: Express app entrypoint.
- `src/routes/api.js`: API endpoints for session/chat/guess/metrics.
- `src/services/azureOpenAI.js`: Azure OpenAI client integration.
- `src/services/humanResponder.js`: Seeded human-like replies.
- `src/services/imitationGame.js`: Prompt bank loader and score computation.
- `src/services/dataStore.js`: JSON persistence layer.
- `public/`: Static frontend.
- `data/experiments.json`: Stored sessions + guesses (includes sample data).
- `data/humanReplies.json`: Seed data for human-style fallback sessions.
- `data/imitationGamePrompts.json`: Paper-inspired prompt bank.

## Setup

1. Install dependencies:

	 ```bash
	 npm install
	 ```

2. Create your env file:

	 ```bash
	 copy .env.example .env
	 ```

3. Fill `.env` values:

	 - `AZURE_OPENAI_ENDPOINT`
	 - `AZURE_OPENAI_API_KEY`
	 - `AZURE_OPENAI_DEPLOYMENT`
	 - `AZURE_OPENAI_API_VERSION` (default: `2024-06-01`)
	 - `AI_SESSION_RATIO` (e.g. `0.5`)

4. Start server:

	 ```bash
	 npm run dev
	 ```

5. Open browser:

	 - `http://localhost:3000`

## Owner control scripts (activate/deactivate)

You can control the app with two Windows scripts from the project root:

- `activate.bat`
	- Starts/rebuilds Docker server
	- Starts public tunnel
	- Prints live URLs + health + dashboard metrics (`/api/metrics`)

- `deactivate.bat`
	- Stops tunnel
	- Stops Docker server
	- Prints proof that server is down (health endpoint unreachable)

### Optional stable public URL (recommended)

By default, activation uses a quick Cloudflare URL that can change each run.

For a permanent URL, add to `.env`:

```dotenv
CF_TUNNEL_TOKEN=your_named_tunnel_token
CF_PUBLIC_URL=https://your-stable-domain.example.com
```

When `CF_TUNNEL_TOKEN` is present, `activate.bat` will run the named tunnel and print `CF_PUBLIC_URL`.

## API summary

- `POST /api/session/start`
	- body: `{ "participantAlias": "alex" }`
	- returns: session id, room code, mode, and first round prompt.

- `GET /api/session/:sessionId/state`
	- returns: current round and progress percentage.

- `POST /api/chat`
	- body: `{ "sessionId": "...", "message": "..." }`
	- returns: partner reply + updated round progress.

- `POST /api/guess`
	- body: `{ "sessionId": "...", "guess": "AI" | "HUMAN", "confidence": 50-100 }`
	- returns: correctness, actual type, computed score, and calibration.

- `GET /api/game/brief`
	- returns: imitation-game brief and paper-inspired prompt bank.

- `GET /api/metrics`
	- returns experiment summary (`totalSessions`, `accuracy`, `deceptionRate`, `averageConfidence`, etc.).

## Data collection details

The app collects and stores experiment outcomes in `data/experiments.json`:

- `sessions[]`: participant alias, assigned type, timestamps, message transcript.
- `guesses[]`: participant final guess, confidence, actual type, correctness, calibration, and score.

Additionally, durable per-record files are written to:

- `data/sessions/<sessionId>.json`
- `data/guesses/<guessId>.json`

With Docker Compose, `./data` is mounted into the container (`/app/data`), so data is preserved across `activate`/`deactivate` cycles and container restarts.

This gives you measurable data to evaluate how often your friends can correctly identify AI vs human-like chat behavior.

## Scoring model

Each final verdict computes a score based on:

- **Correctness** (main weight)
- **Confidence calibration** (high confidence helps only when correct)
- **Engagement depth** (more rounds played gives small bonus)

This makes your game feel more like an online competition instead of a single binary guess.
