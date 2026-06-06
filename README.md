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
- `FRONTEND_ORIGIN`
- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOW_ORIGIN_REGEX`
- `OPENAI_API_KEY`
- `YOUTUBE_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `AI_DAILY_USER_LIMIT`
- `AI_DAILY_GLOBAL_LIMIT`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`

Public frontend variable:

- `VITE_API_BASE_URL`

## Public Beta Deploy

Frontend goes to Vercel with:

- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Env: `VITE_API_BASE_URL=<Railway backend URL>`

Backend goes to Railway with this repository root and `railway.toml`.

Beta constraints:

- Keep Railway backend at 1 instance while `alembic upgrade head` runs in the start command.
- If scaling beyond 1 instance, move migration into a separate release/predeploy step.
- Keep `/artists/{id}/sync`, YouTube source CRUD, and `/ai/briefing/*` admin-only during beta.
- Public users can sign up, write posts/comments, search, and use RAG Q&A within quota.

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

1. Public signup/login.
2. Create a post and comment.
3. Ask RAG Q&A.
4. Admin adds YouTube source and runs sync.
5. Admin creates briefing preview and publishes.
6. Public user reads the published briefing post.
