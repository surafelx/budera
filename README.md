# Budera

An AI business partner for founders. Five built-in specialist agents study a company, its market and its competitors, and owners build their own agents for anything else. Every agent returns a brief and tasks that land in one list.

| Built-in agent | Looks at | Returns |
|---|---|---|
| Growth GPS | Goals, stage, customers | Growth readiness score, priorities, risks, tasks |
| My Paralegal | Rules where the company operates | Compliance checklist, documents, questions for a lawyer |
| Trend Hawk | Live web research on the industry | Sourced market signals and opportunities |
| Competitor Radar | Live web research on competitors | Sourced competitor map, threat levels, gaps to win |
| Operational Radar | How a company this size runs | Operations health, fixes, automations |

**Custom agents** are built in the app. An owner gives one a name, a job, instructions, and optionally tools (search the web, read web pages), a score and a daily or weekly schedule. There are starter templates, and each company can have up to 10.

Built with Next.js 16, React 19, TypeScript and Drizzle ORM on Postgres. There's no AI vendor SDK: agents run on Budera's own engine against any OpenAI-compatible API.

## Run it locally

```bash
npm install
cp .env.example .env.local   # set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, and optionally SEARCH_PROVIDER / SEARCH_API_KEY
npm run dev
```

Open http://localhost:3000. There's no database to install locally: Budera uses an embedded Postgres (PGlite) stored in `.data/`, and migrations run on first use.

Without `LLM_MODEL`, sign-up, onboarding, the dashboard and the agent builder all work, and agent runs fail with a message saying what to configure. Settings → AI setup shows what the server has configured, without revealing keys.

### Choosing a provider

| Provider | `LLM_BASE_URL` | Notes |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | Strict structured outputs supported |
| OpenRouter | `https://openrouter.ai/api/v1` | One key, many models; set `LLM_EXTRA_HEADERS` for attribution |
| Groq, Together, DeepSeek, Mistral | Their OpenAI-compatible URL | Set `LLM_STRUCTURED_OUTPUT=json_object` if a model rejects JSON schemas |
| Ollama / vLLM (self-hosted) | e.g. `http://localhost:11434/v1` | `LLM_API_KEY` can be empty; pick a model with tool calling for research agents |

Research agents need a model that supports tool (function) calling. Each custom agent can override the model, which is useful for sending hard jobs to a larger model.

### Demo data

```bash
npm run seed:demo
```

Creates a fictional company ("Kaffa Roasters (demo)") with a report from every built-in agent and one custom agent, and prints a local sign-in. Stop the dev server first, because the embedded database allows one process at a time. It refuses to run when `DATABASE_URL` is set.

### Tests

```bash
npm test
```

34 tests cover:
- Auth and validation
- The runner: built-in and custom agents, isolation between companies, task replacement, failures, duplicate runs, stuck runs, schedules
- Structured output: strict schemas, the JSON-mode fallback and repair retries
- The research tool loop, using a scripted fake model
- The page reader's safety checks

## How the agent engine works

1. `POST /api/runs` queues agents by key (`growth_gps` or `custom:<id>`) and responds straight away. Work continues in the background via Next.js `after()`.
2. Each agent becomes a spec with a system prompt, output schema, tools and optional model. Built-in agents and owner-built agents use the same spec shape.
3. **Research phase** (agents with tools): Budera's own loop. The model calls `web_search` or `read_page`, Budera executes them and returns the results, and this repeats for up to 8 steps until the model writes research notes. Only URLs the tools actually returned count as sources.
4. **Report phase**: one structured-output call. Budera asks for JSON schema output, falls back to JSON mode if the provider refuses, validates with Zod, and gives the model one chance to repair invalid JSON. Scores and due dates are clamped, and invented source URLs are dropped.
5. The report is saved. That agent's unfinished tasks are replaced with the new ones, and completed tasks are kept.
6. The UI polls `GET /api/runs/status` and refreshes when runs finish. Runs stuck for 15 minutes are marked failed.

**Page reader safety:** it only fetches public http(s) pages on standard ports. It resolves DNS, refuses loopback, private, link-local and cloud-metadata addresses, and re-checks every redirect. Pages are capped at 2 MB, and the text sent to the model is capped too.

## Deploy

1. Create a Postgres database (Neon, Supabase or RDS).
2. Import the repo into Vercel and set the variables from `.env.example`: at least `DATABASE_URL`, `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`.
3. Run migrations once, and again after schema changes:
   ```bash
   DATABASE_URL=... npm run db:migrate
   ```
4. For scheduled custom agents, set `CRON_SECRET`. `vercel.json` calls `/api/cron/scheduled` daily at 06:00 UTC, and weekly agents run every seventh day.
5. Research runs can take several minutes. `/api/runs` sets `maxDuration = 300`, so the plan needs to allow 300-second functions.

## Project layout

```
src/agents/        built-in registry, custom agent rules and templates, prompts, schemas, engine, runner
src/llm/           provider config, OpenAI-compatible client, structured output
src/tools/         web search providers, safe page reader, tool definitions
src/app/           landing page, auth, onboarding, app pages, API routes (runs, custom agents, cron)
src/components/    landing, auth, company forms, agent builder, app UI
src/db/            Drizzle schema and connection (Postgres or PGlite)
src/lib/           auth, sessions, validation, formatting, agent helpers
drizzle/           SQL migrations
scripts/           migrate, seed-demo
tests/             Vitest suites
```
