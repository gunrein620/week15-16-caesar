# 4-Day Project Study Plan

기준일: 2026-06-10

목표는 모든 기술을 깊게 익히는 것이 아니라, 다음 질문에 답할 수 있는 수준까지 프로젝트 구조와 핵심 흐름을 이해하는 것이다.

- 이 프로젝트는 어떤 서비스인가?
- 프론트와 백엔드는 어떻게 통신하나?
- 게시글 작성은 어떤 흐름으로 DB에 저장되나?
- 로그인은 어떻게 유지되나?
- YouTube/Naver 데이터는 어떻게 가져오나?
- RAG는 어떤 데이터를 기반으로 답변하나?
- OpenAI와 pgvector는 각각 왜 필요한가?
- Agent Briefing은 무슨 역할인가?
- Vercel과 Railway는 각각 무엇을 담당하나?

## 핵심 목표

- 로컬에서 앱을 실행할 수 있다.
- React Frontend -> FastAPI Backend -> PostgreSQL DB 흐름을 설명할 수 있다.
- 로그인, 게시판 CRUD, 외부 데이터 수집, RAG, 브리핑 흐름을 말할 수 있다.
- 기술 스택을 "왜 썼는지" 한 문장씩 설명할 수 있다.

## Day 1: 전체 구조와 로컬 실행

목표: 프로젝트가 무슨 앱인지, 어떤 덩어리로 나뉘는지 이해한다.

### 볼 파일

- `README.md`
- `frontend/package.json`
- `backend/pyproject.toml`
- `docker-compose.yml`
- `.env.example`
- `backend/app/main.py`

### 실행 순서

루트 디렉터리에서:

```bash
cp .env.example .env
docker compose up -d
```

백엔드:

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.cli seed-demo
uv run uvicorn app.main:app --reload
```

프론트엔드:

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 확인:

```text
http://localhost:5173
```

### 오늘 이해해야 할 문장

```text
이 프로젝트는 React 프론트엔드, FastAPI 백엔드, PostgreSQL DB로 구성된 팬 커뮤니티 게시판이다.
YouTube/Naver 데이터를 수집하고, OpenAI와 pgvector를 이용해 RAG 검색과 AI 브리핑을 제공한다.
```

### 체크리스트

- [x] 로컬 실행 준비 명령을 한 번 따라 했다.
- [x] 프론트엔드와 백엔드가 분리되어 있다는 것을 이해했다.
- [x] `README.md`의 Stack, Local Run, Environment 섹션을 읽었다.
- [x] `backend/app/main.py`에서 FastAPI 앱 생성과 router 등록 위치를 확인했다.
- [x] `frontend/package.json`에서 React, Vite, TypeScript, TanStack Query를 확인했다.
- [x] `backend/pyproject.toml`에서 FastAPI, SQLAlchemy, Alembic, OpenAI, LangGraph, MCP를 확인했다.
- [x] `docker-compose.yml`에서 PostgreSQL + pgvector DB가 실행되는 것을 확인했다.
- [ ] 백엔드와 프론트엔드 dev server를 직접 켜고 브라우저에서 확인한다.

### 2026-06-10 진행 메모

- `.env.example`을 `.env`로 복사했다. `.env`는 `.gitignore`에 포함되어 커밋되지 않는다.
- Docker DB 컨테이너는 `pgvector/pgvector:pg16` 이미지로 실행 중이고 healthy 상태다.
- `uv sync`와 `npm install`을 완료했다.
- `uv run alembic upgrade head`로 마이그레이션을 `0015_auth_sessions_email_oauth`까지 적용했다.
- `uv run python -m app.cli seed-demo`로 데모 데이터를 넣었다.
- `npm run build`로 프론트엔드 TypeScript/Vite 빌드를 확인했다.
- `check_db_ready()` 결과 DB, pgvector, migration 상태가 모두 true였다.

## Day 2: 게시판 CRUD와 프론트/백엔드 연결

목표: 화면에서 글을 쓰면 어디로 가는지 이해한다.

### 볼 파일

- `frontend/src/App.tsx`
- `frontend/src/api.ts`
- `backend/app/api/posts.py`
- `backend/app/schemas.py`
- `backend/app/models.py`

### 집중 개념

- React component
- `useState`
- `useQuery`
- `useMutation`
- REST API
- FastAPI router
- Pydantic schema
- SQLAlchemy model

### 추적할 흐름

```text
게시글 작성 버튼
-> frontend api 호출
-> POST /posts
-> FastAPI posts.py
-> SQLAlchemy Post 모델
-> PostgreSQL 저장
-> 다시 목록 조회
```

### 오늘 이해해야 할 문장

```text
프론트는 TanStack Query로 API 상태를 관리하고,
백엔드는 FastAPI 라우터에서 요청을 받아 SQLAlchemy로 DB를 조작한다.
```

## Day 3: 인증과 외부 데이터 수집

목표: 로그인과 YouTube/Naver 수집 흐름을 이해한다.

### 볼 파일

- `backend/app/api/auth.py`
- `backend/app/dependencies.py`
- `backend/app/core/security.py`
- `backend/app/services/auth_sessions.py`
- `backend/app/services/oauth.py`
- `backend/app/services/youtube.py`
- `backend/app/services/naver.py`
- `backend/app/services/external_updates.py`

### 집중 개념

- JWT access token
- refresh token
- HttpOnly cookie
- OAuth
- `httpx`
- 외부 API 호출
- 동기화

### 외울 수준

```text
JWT: 로그인한 사용자인지 확인하는 토큰
Refresh token: access token 재발급용 장기 세션
OAuth: Google/Kakao/Naver 계정으로 로그인하는 방식
httpx: 백엔드에서 외부 API 호출할 때 쓰는 라이브러리
```

### 오늘 이해해야 할 문장

```text
사용자가 로그인하면 access token과 refresh session이 발급되고,
인증이 필요한 API는 Depends로 현재 사용자를 확인한다.
YouTube/Naver 데이터는 백엔드 서비스에서 외부 API를 호출해 DB에 저장한다.
```

## Day 4: RAG, Agent, 배포

목표: AI 기능을 깊게 구현하지는 못해도 전체 흐름을 설명할 수 있다.

### 볼 파일

- `backend/app/services/rag.py`
- `backend/app/services/rag_context.py`
- `backend/app/api/ai.py`
- `backend/app/api/agent.py`
- `backend/app/services/mcp_client.py`
- `backend/app/core/config.py`
- `railway.toml`
- `backend/railway.toml`
- `frontend/vercel.json`

### RAG 핵심 흐름

```text
1. 게시글/영상 텍스트를 chunk로 나눈다.
2. OpenAI embedding으로 벡터를 만든다.
3. pgvector로 질문과 비슷한 chunk를 찾는다.
4. OpenAI chat 모델이 근거 기반 답변을 만든다.
```

### Agent 핵심 흐름

```text
LangGraph로 브리핑 생성 흐름을 구성하고,
MCP client를 통해 YouTube/Naver 관련 도구 호출을 기록한다.
생성된 브리핑은 게시글로 발행된다.
```

### 배포 핵심 흐름

```text
Frontend: Vercel
Backend: Railway
DB: Railway PostgreSQL + pgvector
환경변수: .env 또는 Railway/Vercel env
```

## 이번 일정에서 깊게 보지 않을 것

- LangGraph 내부 원리
- MCP 공식 스펙
- pgvector 성능 튜닝
- OAuth provider별 세부 설정
- Railway/Vercel 운영 최적화
- CSS 전체 구조
- 테스트 코드 전체

## 최종 암기용 기술 스택

- Frontend: React, TypeScript, Vite, TanStack Query
- Backend: FastAPI, SQLAlchemy, Alembic, Pydantic
- DB: PostgreSQL, pgvector
- AI: OpenAI embeddings/chat, RAG, LangGraph, MCP
- External APIs: YouTube Data API, Naver Search API
- Auth: JWT, refresh token, OAuth, HttpOnly cookie
- Deploy: Vercel, Railway
