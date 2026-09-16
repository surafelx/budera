# Budera

An AI business partner for founders. Five specialist agents study a company, its market and its competitors, then return a scored brief and a ranked task list.

| Agent | Looks at | Returns |
|---|---|---|
| Growth GPS | Goals, stage, customers | Growth readiness score, priorities, risks, tasks |
| My Paralegal | Rules where the company operates | Compliance checklist, documents, questions for a lawyer |
| Trend Hawk | Live web research on the industry | Sourced market signals and opportunities |
| Competitor Radar | Live web research on competitors | Sourced competitor map, threat levels, gaps to win |
| Operational Radar | How a company this size runs | Operations health, fixes, automations |

Built with Next.js 16, React 19, TypeScript, Drizzle ORM on Postgres, and the Claude API (`claude-opus-5`).

## Run it locally

```bash
npm install
cp .env.example .env.local   # then add ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Locally there's no database to install: Budera uses an embedded Postgres (PGlite) stored in `.data/`, and migrations run on first use.

Without `ANTHROPIC_API_KEY`, sign-up, onboarding and the dashboard all work, and agent runs fail with a message explaining the key is missing.

### Demo data

```bash
npm run seed:demo
```

Creates a fictional company ("Kaffa Roasters (demo)") with a sample report from every agent, and prints a local sign-in. Stop the dev server first, because the embedded database allows one process at a time. It refuses to run when `DATABASE_URL` is set.

### Tests

```bash
npm test
```

Covers password hashing, sessions, validation, and the agent runner using a fake Claude client and an in-memory database: task replacement, failures, duplicate runs, stuck runs, and output clean-up.

## How agent runs work

1. `POST /api/runs` queues runs for the chosen agents and responds straight away. The work continues in the background through Next.js `after()`.
2. Trend Hawk and Competitor Radar first run a research call with Claude's web search tool, and keep the URLs it actually retrieved.
3. Every agent then makes one structured-output call. The response is validated against the agent's Zod schema in `src/agents/schemas.ts`. Scores and due dates are clamped, and any source URL the research didn't return is dropped.
4. The report is saved. The agent's unfinished tasks are replaced with the new ones, and tasks the owner already completed are kept.
5. The UI polls `GET /api/runs/status` and refreshes when the runs finish. A run stuck for 15 minutes is marked failed so it can be retried.

Requests use adaptive thinking at `medium` effort, with server-side refusal fallbacks switched on (`fallbacks: "default"`). If a request is declined, it's retried on Anthropic's recommended fallback model instead of failing.

Cost: a full "Run all agents" makes 5 to 7 Claude Opus calls, plus up to 16 web searches.

## Deploy

1. Create a Postgres database (Neon, Supabase or RDS) and copy its connection string.
2. Import the repo into Vercel and set:
   - `DATABASE_URL`
   - `ANTHROPIC_API_KEY`
3. Run migrations against the new database once, and again after any schema change:
   ```bash
   DATABASE_URL=... npm run db:migrate
   ```
4. Agent runs can take several minutes. `/api/runs` sets `maxDuration = 300`, so the Vercel plan needs to allow 300-second functions.

## Project layout

```
src/agents/        registry, output schemas, prompts, Claude calls, runner
src/app/           landing page, auth, onboarding, app pages, API routes
src/components/    landing, auth, company forms, app UI
src/db/            Drizzle schema and connection (Postgres or PGlite)
src/lib/           auth, sessions, validation, formatting
drizzle/           SQL migrations (npm run db:generate after schema changes)
scripts/           migrate, seed-demo
tests/             Vitest suites
```
