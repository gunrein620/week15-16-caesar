# LocalMind Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first React + NestJS AI local community board for Osan with RAG, JSON-RPC MCP, and a bounded AI Agent.

**Architecture:** Use an npm-workspaces monorepo with `apps/web`, `apps/api`, `apps/mcp-server`, and `packages/shared`. The API server owns REST, Auth, Prisma, RAG, and Agent. The MCP server is a separate NestJS JSON-RPC app that wraps external data tools.

**Tech Stack:** React, Vite, NestJS, TypeScript, Prisma, PostgreSQL, pgvector, JWT, Swagger, OpenAI-compatible LLM API, JSON-RPC.

---

## File Structure

Create this structure during implementation:

```text
apps/
  web/
  api/
  mcp-server/
packages/
  shared/
prisma/
  schema.prisma
  seed.ts
infra/
  docker-compose.yml
  postgres/init.sql
docs/
  architecture.md
  superpowers/specs/2026-06-10-localmind-board-design.md
  superpowers/plans/2026-06-10-localmind-board-implementation.md
```

## Task 1: Repository and Workspace Bootstrap

**Files:**

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Add root npm workspace config**

Create root `package.json` with these scripts:

```json
{
  "name": "localmind-board",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev -w apps/api\" \"npm run dev -w apps/mcp-server\" \"npm run dev -w apps/web\"",
    "dev:api": "npm run dev -w apps/api",
    "dev:web": "npm run dev -w apps/web",
    "dev:mcp": "npm run dev -w apps/mcp-server",
    "build": "npm run build -ws",
    "lint": "npm run lint -ws --if-present",
    "test": "npm run test -ws --if-present",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "prisma": "^6.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Add TypeScript base config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@localmind/shared": ["packages/shared/src/index.ts"]
    }
  }
}
```

- [ ] **Step 3: Add shared package**

Create `packages/shared/src/index.ts`:

```ts
export const DEFAULT_REGION_CODE = 'OSAN';
export const DEFAULT_REGION_NAME = '오산';

export type ApiPage<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};
```

- [ ] **Step 4: Install root dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and install exits with code 0.

- [ ] **Step 5: Commit bootstrap**

Run:

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore .env.example packages
git commit -m "chore: bootstrap localmind workspace"
```

## Task 2: PostgreSQL, pgvector, and Prisma Schema

**Files:**

- Create: `infra/docker-compose.yml`
- Create: `infra/postgres/init.sql`
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Add Docker Compose**

Create `infra/docker-compose.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: localmind
      POSTGRES_PASSWORD: localmind
      POSTGRES_DB: localmind_board
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

volumes:
  postgres_data:
```

- [ ] **Step 2: Enable pgvector**

Create `infra/postgres/init.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

- [ ] **Step 3: Add Prisma schema**

Create `prisma/schema.prisma` with models for `User`, `Region`, `Category`, `Post`, `Comment`, `Tag`, `PostTag`, `PostLike`, `Notice`, `Embedding`, `AgentSession`, `AgentToolLog`, and `McpToolLog`. Use `Unsupported("vector(1536)")` for `Embedding.embedding`.

- [ ] **Step 4: Add seed data**

Create `prisma/seed.ts` to upsert:

```text
Region: 경기도, 오산시, 오산동, 원동, 궐동, 금암동, 세교동, 부산동, 은계동
Category: 동네생활, 맛집, 분실물, 중고거래, 동네행사, 생활민원, 병원/약국, 반려동물/육아
Notice: 오산 생활 커뮤니티 이용 안내
```

- [ ] **Step 5: Run database**

Run:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Expected: `postgres` service is running.

- [ ] **Step 6: Run migration and seed**

Run:

```bash
npm run prisma:migrate -- --name init
npm run prisma:seed
```

Expected: migration succeeds and seed exits with code 0.

- [ ] **Step 7: Commit database setup**

Run:

```bash
git add infra prisma package.json package-lock.json
git commit -m "feat: add database schema and seed data"
```

## Task 3: NestJS API Base

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/common/default-region.ts`

- [ ] **Step 1: Create NestJS API app**

Use the Nest CLI or create a minimal NestJS app manually under `apps/api`.

- [ ] **Step 2: Configure Swagger and CORS**

`apps/api/src/main.ts` must:

```text
Read API_PORT from env, default 3000
Enable CORS for CORS_ORIGIN
Serve Swagger at /api/docs
Set global prefix /api
```

- [ ] **Step 3: Add PrismaService**

`PrismaService` extends `PrismaClient`, connects on module init, and disconnects on module destroy.

- [ ] **Step 4: Add default region helper**

`default-region.ts` exports:

```ts
export const DEFAULT_REGION_CODE = process.env.DEFAULT_REGION_CODE ?? 'OSAN';
export const DEFAULT_REGION_NAME = process.env.DEFAULT_REGION_NAME ?? '오산';
```

- [ ] **Step 5: Verify API boots**

Run:

```bash
npm run dev:api
```

Expected: NestJS API listens on `http://localhost:3000`.

- [ ] **Step 6: Commit API base**

Run:

```bash
git add apps/api package.json package-lock.json
git commit -m "feat: add nest api base"
```

## Task 4: Auth, Users, Regions, and Categories

**Files:**

- Create: `apps/api/src/auth/*`
- Create: `apps/api/src/users/*`
- Create: `apps/api/src/regions/*`
- Create: `apps/api/src/categories/*`

- [ ] **Step 1: Implement AuthModule**

Endpoints:

```text
POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/me
```

Rules:

```text
email is unique
password is hashed with bcrypt
login returns accessToken
JWT payload contains sub and email
```

- [ ] **Step 2: Implement UsersModule**

Endpoint:

```text
PATCH /api/users/me/region
```

Rules:

```text
Requires JWT
Accepts regionId
Rejects unknown regionId
Updates users.defaultRegionId
```

- [ ] **Step 3: Implement RegionsModule**

Endpoints:

```text
GET /api/regions
GET /api/regions/default
```

Rules:

```text
Default region resolves OSAN
parentId query returns children
No parentId returns top-level regions
```

- [ ] **Step 4: Implement CategoriesModule**

Endpoint:

```text
GET /api/categories
```

- [ ] **Step 5: Add service tests**

Test these cases:

```text
AuthService rejects duplicate email
AuthService rejects invalid password
RegionsService returns OSAN as default
UsersService rejects unknown region
```

- [ ] **Step 6: Commit auth and metadata**

Run:

```bash
git add apps/api/src/auth apps/api/src/users apps/api/src/regions apps/api/src/categories
git commit -m "feat: add auth users regions and categories"
```

## Task 5: Board CRUD, Tags, Likes, Paging, and Search

**Files:**

- Create: `apps/api/src/posts/*`
- Create: `apps/api/src/comments/*`
- Create: `apps/api/src/tags/*`
- Create: `apps/api/src/likes/*`
- Create: `apps/api/src/search/*`

- [ ] **Step 1: Implement PostsModule**

Endpoints:

```text
GET    /api/posts?regionId=&categoryId=&tag=&page=&limit=&q=
POST   /api/posts
GET    /api/posts/:id
PATCH  /api/posts/:id
DELETE /api/posts/:id
```

Rules:

```text
POST, PATCH, DELETE require JWT
Only author can PATCH or DELETE
No regionId query means default OSAN region
DELETE sets status to DELETED
GET list excludes DELETED
```

- [ ] **Step 2: Implement CommentsModule**

Endpoints:

```text
GET    /api/posts/:postId/comments
POST   /api/posts/:postId/comments
PATCH  /api/comments/:id
DELETE /api/comments/:id
```

Rules:

```text
Only comment author can PATCH or DELETE
Deleting a post hides related comments from post detail
```

- [ ] **Step 3: Implement TagsModule**

Rules:

```text
Post create accepts tag names
Tag names are trimmed
Existing tags are reused
PostTag rows connect post and tags
```

- [ ] **Step 4: Implement LikesModule**

Endpoints:

```text
POST   /api/posts/:id/like
DELETE /api/posts/:id/like
```

Rules:

```text
Like is idempotent
Unlike is idempotent
Post list includes likeCount and commentCount
```

- [ ] **Step 5: Implement SearchModule**

Endpoint:

```text
GET /api/search/posts?q=&regionId=&categoryId=&page=&limit=
```

Rules:

```text
Search title and content with contains
Default region is OSAN when regionId is missing
Return paged result
```

- [ ] **Step 6: Add service tests**

Test these cases:

```text
Post author can update own post
Different user cannot update post
Default region filter uses OSAN
Like twice creates one like
Search returns matching title
```

- [ ] **Step 7: Commit board features**

Run:

```bash
git add apps/api/src/posts apps/api/src/comments apps/api/src/tags apps/api/src/likes apps/api/src/search
git commit -m "feat: add board crud and search"
```

## Task 6: RAG and Vector Search

**Files:**

- Create: `apps/api/src/ai/llm.service.ts`
- Create: `apps/api/src/rag/embedding.service.ts`
- Create: `apps/api/src/rag/vector-search.service.ts`
- Create: `apps/api/src/rag/rag-ingestion.service.ts`
- Create: `apps/api/src/rag/rag.service.ts`
- Create: `apps/api/src/rag/rag.controller.ts`
- Modify: `apps/api/src/posts/posts.service.ts`
- Modify: `apps/api/src/comments/comments.service.ts`

- [ ] **Step 1: Add LlmService**

Responsibilities:

```text
createEmbedding(input: string): Promise<number[]>
chat(messages, options): Promise<string>
chatWithTools(messages, tools): Promise<tool call or final answer>
```

- [ ] **Step 2: Add EmbeddingService**

Rules:

```text
Uses EMBEDDING_MODEL
Validates vector length equals EMBEDDING_DIM
Throws descriptive error when OPENAI_API_KEY is missing
```

- [ ] **Step 3: Add VectorSearchService**

Use raw SQL for pgvector search:

```sql
SELECT id, "sourceType", "sourceId", content, 1 - (embedding <=> $1::vector) AS similarity
FROM "Embedding"
WHERE ($2::text IS NULL OR "regionId" = $2)
ORDER BY embedding <=> $1::vector
LIMIT $3;
```

- [ ] **Step 4: Add ingestion hooks**

After post/comment create or update:

```text
Build source content
Create embedding
Upsert Embedding by sourceType + sourceId
```

- [ ] **Step 5: Add RAG endpoints**

Endpoints:

```text
POST /api/rag/ask
POST /api/rag/similar-posts
POST /api/rag/duplicate-check
GET  /api/rag/regional-issues
```

- [ ] **Step 6: Add RAG tests**

Use mocked `EmbeddingService` and `LlmService`.

Test these cases:

```text
duplicate-check returns candidates over 0.86
similar-posts returns candidates over 0.70
ask returns answer and sources
region missing resolves OSAN
```

- [ ] **Step 7: Commit RAG**

Run:

```bash
git add apps/api/src/ai apps/api/src/rag apps/api/src/posts apps/api/src/comments
git commit -m "feat: add rag vector search"
```

## Task 7: JSON-RPC MCP Server

**Files:**

- Create: `apps/mcp-server/package.json`
- Create: `apps/mcp-server/src/main.ts`
- Create: `apps/mcp-server/src/app.module.ts`
- Create: `apps/mcp-server/src/json-rpc/*`
- Create: `apps/mcp-server/src/tools/*`
- Create: `apps/mcp-server/src/weather/*`
- Create: `apps/mcp-server/src/public-facility/*`
- Create: `apps/mcp-server/src/local-event/*`

- [ ] **Step 1: Create MCP NestJS app**

Server listens on `MCP_SERVER_PORT`, default `3010`.

- [ ] **Step 2: Implement JSON-RPC endpoint**

Endpoint:

```text
POST /rpc
```

Supported method:

```text
tools/call
```

Error rules:

```text
Invalid JSON-RPC version returns code -32600
Unknown method returns code -32601
Unknown tool returns code -32602
Tool failure returns code -32000
```

- [ ] **Step 3: Implement get_weather_by_region**

Input:

```json
{ "region": "오산", "date": "2026-06-13" }
```

Output:

```json
{
  "summary": "오산의 예보 요약",
  "raw": {
    "temperature": 24,
    "rainProbability": 70
  }
}
```

When no API key is available, return a deterministic mock result in development mode and include `source: "mock"`.

- [ ] **Step 4: Implement placeholder-safe public facility and event tools**

These tools return clear deterministic development responses until real API keys are configured:

```text
search_public_facility
get_local_event_info
```

The response must include `source: "mock"` in development mode.

- [ ] **Step 5: Add MCP tests**

Test these cases:

```text
tools/call get_weather_by_region returns result
unknown method returns -32601
unknown tool returns -32602
invalid params returns -32602
```

- [ ] **Step 6: Commit MCP server**

Run:

```bash
git add apps/mcp-server package.json package-lock.json
git commit -m "feat: add json rpc mcp server"
```

## Task 8: MCP Client and Agent Runtime

**Files:**

- Create: `apps/api/src/mcp-client/*`
- Create: `apps/api/src/agent/agent.types.ts`
- Create: `apps/api/src/agent/agent-tool-registry.service.ts`
- Create: `apps/api/src/agent/agent-state.service.ts`
- Create: `apps/api/src/agent/agent.service.ts`
- Create: `apps/api/src/agent/agent.controller.ts`
- Create: `apps/api/src/agent/agent.module.ts`

- [ ] **Step 1: Implement McpClientService**

Responsibilities:

```text
POST JSON-RPC to MCP_SERVER_URL
Add request id
Throw typed error on JSON-RPC error
Apply 8 second timeout
```

- [ ] **Step 2: Implement Agent types**

Define:

```ts
export type AgentPurpose =
  | 'post_helper'
  | 'complaint_helper'
  | 'tag_suggestion'
  | 'duplicate_check';

export type AgentState = {
  sessionId: string;
  userId?: string;
  purpose: AgentPurpose;
  regionCode: string;
  regionName: string;
  input: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  toolCalls: Array<{ name: string; input: unknown; output?: unknown; error?: string }>;
  iteration: number;
  maxIterations: number;
};
```

- [ ] **Step 3: Implement ToolRegistry**

Tools:

```text
vector_search_posts
check_duplicate_post
suggest_tags
call_mcp_tool
draft_local_post
draft_complaint_post
summarize_context
```

- [ ] **Step 4: Implement AgentService loop**

Rules:

```text
Create AgentSession before loop
maxIterations is 4
Same tool and same input cannot run twice
Every tool call writes AgentToolLog
Tool errors are appended to messages
Final answer marks session COMPLETED
Unexpected error marks session FAILED
```

- [ ] **Step 5: Implement Agent endpoints**

Endpoints:

```text
POST /api/agent/post-helper
POST /api/agent/complaint-helper
POST /api/agent/tag-suggestion
POST /api/agent/duplicate-check
```

- [ ] **Step 6: Add Agent tests**

Use mocked LLM, RAG, and MCP services.

Test these cases:

```text
Agent stops at maxIterations
Agent rejects repeated same tool input
Agent logs tool calls
MCP failure returns fallback answer
tag-suggestion returns tags
```

- [ ] **Step 7: Commit Agent**

Run:

```bash
git add apps/api/src/mcp-client apps/api/src/agent
git commit -m "feat: add mcp client and agent runtime"
```

## Task 9: React Mobile-First Frontend

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/PostCard.tsx`
- Create: `apps/web/src/components/BottomNav.tsx`
- Create: `apps/web/src/components/FloatingWriteButton.tsx`
- Create: `apps/web/src/pages/HomePage.tsx`
- Create: `apps/web/src/pages/PostDetailPage.tsx`
- Create: `apps/web/src/pages/PostEditorPage.tsx`
- Create: `apps/web/src/pages/AiAssistantPage.tsx`
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/SignupPage.tsx`

- [ ] **Step 1: Create Vite React app**

Use React + TypeScript under `apps/web`.

- [ ] **Step 2: Add design tokens**

`tokens.css` must define:

```css
:root {
  --color-primary: #ff6f0f;
  --color-background: #f8f9fa;
  --color-surface: #ffffff;
  --color-text: #191919;
  --color-subtext: #868b94;
  --color-border: #eaebee;
  --bottom-nav-height: 64px;
}
```

- [ ] **Step 3: Build AppShell**

AppShell includes:

```text
Top app bar with 오산
Horizontal category tabs
Filter chips
Main content outlet
Bottom navigation
Floating write button on feed pages
```

- [ ] **Step 4: Build HomePage**

HomePage calls:

```text
GET /api/posts
GET /api/categories
```

It renders a one-column mobile feed with `PostCard`.

- [ ] **Step 5: Build Auth pages**

Login and signup use:

```text
POST /api/auth/login
POST /api/auth/signup
```

Access token is stored in memory first. LocalStorage can be used for MVP persistence.

- [ ] **Step 6: Build Post editor**

Post editor supports:

```text
title
content
category
region default OSAN
tags
AI tag suggestion button
duplicate check button
```

- [ ] **Step 7: Build AI assistant**

AI assistant supports:

```text
RAG question input
post helper input
complaint helper input
shows answer and source posts
```

- [ ] **Step 8: Browser verification**

Run:

```bash
npm run dev:web
```

Verify:

```text
360px viewport has no horizontal overflow
430px viewport shows bottom nav and write button
Home feed loads
AI page loads
Text does not overlap controls
```

- [ ] **Step 9: Commit frontend**

Run:

```bash
git add apps/web package.json package-lock.json
git commit -m "feat: add mobile first react frontend"
```

## Task 10: Swagger, README, and Demo Data

**Files:**

- Modify: `README.md`
- Create: `docs/demo-scenario.md`
- Create: `docs/api-examples.md`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Expand README**

README must include:

```text
프로젝트 개요
주요 구현 기능
전체 아키텍처
RAG 기능 설명
MCP 기능 설명
Agent 기능 설명
실행 방법
데모 시나리오
회고, 한계점, 개선 아이디어
```

- [ ] **Step 2: Add demo scenario doc**

`docs/demo-scenario.md` includes:

```text
회원가입
오산 피드 확인
게시글 작성
댓글/좋아요
RAG 질문
중복 게시글 확인
MCP 날씨 질문
Agent 민원 글 작성
Swagger와 로그 테이블 설명
```

- [ ] **Step 3: Add API examples**

`docs/api-examples.md` includes curl examples for:

```text
signup
login
create post
rag ask
mcp rpc weather call
agent complaint helper
```

- [ ] **Step 4: Seed demo posts**

Add demo seed posts:

```text
오산 야간 약국 정보
오산역 근처 분실물 안내
이번 주말 세교동 플리마켓
불법 주차 생활 민원 공유
오산 맛집 추천
```

- [ ] **Step 5: Final verification**

Run:

```bash
npm run lint
npm run test
npm run build
```

Expected: commands exit with code 0. If a package has no tests yet, the package script must print a clear message and exit 0.

- [ ] **Step 6: Commit documentation and demo data**

Run:

```bash
git add README.md docs prisma/seed.ts
git commit -m "docs: add localmind demo guide"
```

## Execution Order

Implement in this order:

```text
Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6 -> Task 7 -> Task 8 -> Task 9 -> Task 10
```

Do not start frontend polish before Task 5 board APIs are usable. Do not start Agent before RAG and MCP client boundaries exist.

## Self Review

- Spec coverage: Auth, board CRUD, comments, tags, categories, paging, search, likes, region filtering, RAG, MCP, Agent, Swagger, Docker, README, and mobile frontend are covered by tasks.
- Unresolved marker scan: no open task slots remain.
- Type consistency: Agent purpose, default region, app names, and endpoint paths match the design spec.
