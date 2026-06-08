# week15-16-caesar-yong

김용 개인 구현 레포: 리센느 중심 아이돌 팬 커뮤니티 AI 게시판.

주요 기능:
- React 게시판
- FastAPI 백엔드
- PostgreSQL + pgvector RAG
- YouTube/Naver MCP tools
- LangGraph briefing preview/publish Agent

## Stack

- Frontend: React, Vite, TypeScript, TanStack Query
- Backend: FastAPI, SQLAlchemy, Alembic, slowapi
- DB: PostgreSQL 16 + pgvector
- AI: OpenAI `gpt-4o-mini`, `text-embedding-3-small`
- Tools: MCP Python SDK, YouTube Data API, Naver Search API
- Public beta: Vercel frontend + Railway backend + Railway pgvector DB

## Local Run

```bash
cp .env.example .env
openssl rand -hex 32
docker compose up -d

cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.cli seed-demo
uv run uvicorn app.main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Environment

Private values go in `.env` or Railway environment variables only. Do not commit real keys.

Required backend variables:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `LOGIN_LOCKOUT_MAX_ATTEMPTS`
- `LOGIN_LOCKOUT_WINDOW_MINUTES`
- `LOGIN_LOCKOUT_MINUTES`
- `FRONTEND_ORIGIN`
- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOW_ORIGIN_REGEX`
- `OPENAI_API_KEY`
- `YOUTUBE_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `AI_DAILY_USER_LIMIT`
- `AI_DAILY_GLOBAL_LIMIT`
- `PUBLIC_SIGNUP_ENABLED`
- `INFRA_BUDGET_HARD_STOP_ENABLED`
- `INFRA_MONTHLY_BUDGET_USD`
- `RAILWAY_SUBSCRIPTION_MONTHLY_USD`
- `RAILWAY_BACKEND_ESTIMATED_MONTHLY_USD`
- `RAILWAY_DB_ESTIMATED_MONTHLY_USD`
- `VERCEL_ESTIMATED_MONTHLY_USD`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

Public frontend variable:

- `VITE_API_BASE_URL`

## Public Beta Deploy

Current beta URLs:

- Frontend: `https://frontend-coral-six-al1fy1xeup.vercel.app`
- Backend: `https://backend-production-97eb4.up.railway.app`

Frontend goes to Vercel with:

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Env: `VITE_API_BASE_URL=<Railway backend URL>`
- SPA fallback: `frontend/vercel.json`

Backend goes to Railway with the `backend/` directory uploaded as root and `backend/railway.toml`.
From the repo root, use `railway up ./backend --path-as-root --service backend --detach`.

Beta constraints:

- Keep Railway backend at 1 instance while `alembic upgrade head` runs in the start command.
- If scaling beyond 1 instance, move migration into a separate release/predeploy step.
- Keep `/artists/{id}/sync`, YouTube source CRUD, and `/ai/briefing/*` admin-only during beta.
- Public signup defaults to `PUBLIC_SIGNUP_ENABLED`; admins can toggle it at runtime from the app.
- Repeated failed login attempts are locked by email/IP for the configured lockout window.
- Public beta collects anonymous usage events for service improvement. Raw IP, raw user-agent, emails, tokens, API keys, and search result bodies are not stored in analytics events.
- Social login is not wired to a provider yet, but the DB now supports passwordless users linked through `auth_identities(provider, provider_subject)`.
- Infra cost hard stop uses admin-managed monthly estimates. It blocks public API traffic with 503 when the elapsed monthly estimate exceeds the budget, while keeping login and admin recovery endpoints open.
- Actual Railway scale-to-zero is a separate operational action. Use `railway scale --service backend sfo=0` only when you intentionally want to take the backend offline.

## Railway pgvector Preflight

Railway DB must use a pgvector-capable setup. Prefer a Railway pgvector template or a DB service based on `pgvector/pgvector:pg16`.

Run after DB provisioning:

```sql
SELECT name FROM pg_available_extensions WHERE name = 'vector';
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extname FROM pg_extension WHERE extname = 'vector';
```

`GET /ready` checks DB connectivity, migration state, and pgvector installation for PostgreSQL.

## Verification

Backend:

```bash
cd backend
uv run pytest -q
uv run ruff check .
```

Frontend:

```bash
cd frontend
npm run build
```

Manual beta scenario:

1. Login with a seeded or manually created account.
2. Create, edit, delete a post and add a comment.
3. Use search, tag filter, and paging.
4. Ask RAG Q&A.
5. Admin adds YouTube source and runs sync.
6. Admin creates briefing preview and publishes.
7. Public user reads the published briefing post.

## Known v1 Limits

- YouTube and Naver real API verification requires `YOUTUBE_API_KEY`, `NAVER_CLIENT_ID`, and `NAVER_CLIENT_SECRET`.
- During beta, sync, source management, and briefing preview/publish are admin-only.
- Railway backend stays at one instance while migrations run in the start command.
