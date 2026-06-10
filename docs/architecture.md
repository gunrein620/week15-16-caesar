# LocalMind Board Architecture

LocalMind Board는 오산 지역 주민을 위한 모바일 우선 지역 생활 커뮤니티 게시판이다. 기본 게시판 기능 위에 RAG, MCP, AI Agent를 얹어 동네 정보 검색, 중복 글 확인, 글쓰기 도움, 외부 날씨/공공데이터 활용 답변을 제공한다.

## Goals

- React 모바일 우선 반응형 프론트엔드
- NestJS + TypeScript 기반 REST API 우선 백엔드
- PostgreSQL + Prisma + pgvector 기반 일반 데이터와 벡터 데이터 통합 저장
- 게시글, 댓글, 공지 데이터를 활용한 RAG
- JSON-RPC 기반 MCP Server 직접 구현
- Function Calling 기반 AI Agent 추론 루프 구현
- MVP 기본 지역은 오산으로 고정하되 Region 계층 구조로 다른 지역 확장 가능

## System Overview

```mermaid
flowchart LR
  User["User"] --> Web["React Web"]
  Web --> Api["NestJS API Server"]
  Api --> DB[("PostgreSQL + pgvector")]
  Api --> LLM["OpenAI compatible LLM"]
  Api --> Agent["Agent Runtime"]
  Agent --> Rag["RAG Service"]
  Agent --> McpClient["MCP Client"]
  Rag --> DB
  Rag --> LLM
  McpClient --> Mcp["NestJS MCP Server"]
  Mcp --> Weather["Weather API"]
  Mcp --> PublicData["Public Data API"]
  Mcp --> Place["Map or Place API"]
```

## Applications

### apps/web

React 앱이다. 모바일 화면을 기본으로 잡고 태블릿/데스크톱에서는 본문 폭과 보조 패널만 확장한다.

주요 화면:

- 홈 피드
- 게시글 상세
- 글쓰기
- 검색
- AI 도우미
- 로그인/회원가입
- 마이페이지

### apps/api

NestJS REST API 서버다. 인증, 게시판, 검색, RAG, Agent, MCP Client를 담당한다.

주요 책임:

- JWT 회원가입/로그인
- 게시글/댓글/태그/좋아요 CRUD
- 지역/카테고리 조회
- PostgreSQL/Prisma 데이터 처리
- pgvector 기반 벡터 검색
- LLM API 호출
- Agent 상태 관리와 도구 호출 로그 저장
- Swagger 문서 제공

### apps/mcp-server

NestJS로 구현하는 JSON-RPC MCP 서버다. 외부 API 호출은 이 앱 안에 격리한다.

MVP Tool:

- `get_weather_by_region`
- `search_public_facility`
- `get_local_event_info`

## Frontend Design

참고 이미지는 지역 커뮤니티 모바일 피드의 정보 구조만 참고한다. 브랜드, 문구, 아이콘, 그래픽은 LocalMind Board 전용으로 만든다.

### Mobile First Layout

```text
Top App Bar
- 현재 지역: 오산
- 검색
- 알림
- 메뉴

Primary Tabs
- 동네생활
- 맛집
- 분실물
- 중고거래
- 동네행사
- 생활민원
- 병원/약국

Filter Chips
- 추천
- 인기
- 긴급
- 생활정보
- AI추천

Feed
- 카테고리 배지
- 제목
- 요약
- 동 단위 지역
- 작성 시간
- 조회수
- 좋아요 수
- 댓글 수
- 선택 이미지 썸네일

Bottom Navigation
- 홈
- 커뮤니티
- 동네지도
- AI도우미
- 마이페이지

Floating Action Button
- + 글쓰기
```

### Responsive Rules

- 360px부터 정상 사용 가능해야 한다.
- 430px 모바일 화면을 주요 기준으로 잡는다.
- 768px 이상에서는 본문 최대 폭을 제한하고 좌우 여백을 늘린다.
- 1024px 이상에서는 중앙 피드와 우측 보조 패널을 둘 수 있다.
- 하단 탭바와 글쓰기 버튼은 모바일에서 고정한다.
- 게시글 리스트는 모바일에서 1열 리스트로 유지한다.

### Visual Tokens

```text
Primary: #ff6f0f
Background: #f8f9fa
Surface: #ffffff
Text: #191919
SubText: #868b94
Border: #eaebee
Danger: #e03131
Success: #2f9e44
```

MVP는 라이트 테마로 시작한다. 다크 모드는 CSS 변수로 확장 가능하게만 둔다.

## Region Strategy

MVP 기본 지역은 오산이다.

```text
DEFAULT_REGION_CODE=OSAN
DEFAULT_REGION_NAME=오산
```

비로그인 사용자는 오산 피드를 본다. 로그인 사용자는 `users.defaultRegionId`가 있으면 해당 지역을 사용하고, 없으면 오산을 사용한다. RAG, Agent, MCP 날씨 조회도 region 값이 없으면 오산 기준으로 실행한다.

지역은 계층형으로 설계한다.

```text
경기도
└── 오산시
    ├── 오산동
    ├── 원동
    ├── 궐동
    ├── 금암동
    ├── 세교동
    ├── 부산동
    └── 은계동
```

## Backend Module Map

```text
PrismaModule
AuthModule
UsersModule
RegionsModule
CategoriesModule
PostsModule
CommentsModule
TagsModule
LikesModule
SearchModule
AiModule
RagModule
McpClientModule
AgentModule
```

MCP Server module map:

```text
JsonRpcModule
ToolsModule
WeatherModule
PublicFacilityModule
LocalEventModule
```

## Database Design

Core tables:

- `users`
- `regions`
- `categories`
- `posts`
- `comments`
- `tags`
- `post_tags`
- `post_likes`
- `notices`
- `embeddings`
- `agent_sessions`
- `agent_tool_logs`
- `mcp_tool_logs`

`embeddings.embedding`은 `vector(1536)`으로 저장한다. OpenAI `text-embedding-3-small` 기준이며, 모델 변경 시 `EMBEDDING_DIM`과 migration을 함께 바꾼다.

## REST API

```text
POST   /api/auth/signup
POST   /api/auth/login
GET    /api/auth/me

GET    /api/regions
GET    /api/regions/default
PATCH  /api/users/me/region

GET    /api/categories
GET    /api/tags

GET    /api/posts
POST   /api/posts
GET    /api/posts/:id
PATCH  /api/posts/:id
DELETE /api/posts/:id
POST   /api/posts/:id/like
DELETE /api/posts/:id/like

GET    /api/posts/:postId/comments
POST   /api/posts/:postId/comments
PATCH  /api/comments/:id
DELETE /api/comments/:id

GET    /api/search/posts
POST   /api/rag/ask
POST   /api/rag/similar-posts
POST   /api/rag/duplicate-check
GET    /api/rag/regional-issues

POST   /api/agent/post-helper
POST   /api/agent/complaint-helper
POST   /api/agent/tag-suggestion
POST   /api/agent/duplicate-check
```

## RAG Flow

### Ingestion

```text
Post, Comment, Notice 생성 또는 수정
-> RagIngestionService가 source text 생성
-> EmbeddingService가 embedding 생성
-> embeddings 테이블 upsert
```

### Retrieval

```text
사용자 질문
-> 질문 embedding 생성
-> regionId 없으면 오산 regionId 적용
-> pgvector cosine distance 검색
-> topK 문서 추출
-> LLM prompt에 context 삽입
-> 답변과 source link 반환
```

### Features

- 유사 게시글 추천: similarity 0.70 이상
- 중복 게시글 방지: similarity 0.86 이상
- 동네 Q&A 봇: top 5 context 기반 답변
- 최근 지역 이슈 요약: 최근 N일 게시글 검색 후 LLM 요약

## MCP Flow

MCP Server는 `POST /rpc` 하나를 노출한다.

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "get_weather_by_region",
    "arguments": {
      "region": "오산",
      "date": "2026-06-13"
    }
  }
}
```

처리 흐름:

```text
JsonRpcController
-> JsonRpcService validates JSON-RPC
-> ToolsService resolves tool
-> WeatherToolService calls external API
-> result returned as JSON-RPC response
-> mcp_tool_logs 저장
```

## Agent Flow

Agent는 NestJS API 서버 안에서 직접 구현한다. LangGraph 같은 그래프형 구조를 참고하되, MVP에서는 명시적인 loop와 tool registry로 충분하다.

```text
1. AgentSession 생성
2. system prompt와 user input 구성
3. LLM Function Calling 호출
4. tool_call이 있으면 AgentToolRegistry에서 실행
5. AgentToolLog 저장
6. tool result를 messages에 추가
7. iteration 증가
8. maxIterations 초과 또는 final answer 도달 시 종료
```

제한:

- `maxIterations=4`
- tool timeout 8초
- 같은 tool과 같은 input 반복 호출 금지
- MCP 실패 시 fallback 답변 생성
- JSON parse 실패 시 1회 재시도

## Environment Variables

```env
NODE_ENV=development
DATABASE_URL=postgresql://localmind:localmind@localhost:5432/localmind_board
JWT_SECRET=change-me
JWT_EXPIRES_IN=1h
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
API_PORT=3000
WEB_PORT=5173
MCP_SERVER_PORT=3010
MCP_SERVER_URL=http://localhost:3010/rpc
CORS_ORIGIN=http://localhost:5173
DEFAULT_REGION_CODE=OSAN
DEFAULT_REGION_NAME=오산
WEATHER_API_KEY=
PUBLIC_DATA_API_KEY=
MAP_API_KEY=
```

## MVP Scope

Must have:

- JWT signup/login
- 게시글 CRUD
- 댓글 CRUD
- 카테고리, 태그
- 페이징, 검색
- 좋아요
- 오산 기본 지역 필터
- PostgreSQL, Prisma, pgvector
- 게시글/댓글 embedding 저장
- RAG Q&A, 유사 게시글 추천, 중복 확인
- JSON-RPC MCP Server
- 날씨 MCP Tool 1개
- Agent 글 작성 도우미, 민원 작성 도우미, 태그 추천
- Agent 도구 호출 로그
- Swagger
- README와 발표 데모 자료

Optional after MVP:

- 이미지 첨부
- 지도 UI
- 관리자 페이지
- 알림
- 소셜 로그인
- 실시간 채팅
- 다크 모드

## Demo Scenario

1. 회원가입 후 오산 지역 피드 진입
2. 병원/약국 카테고리 게시글 작성
3. 댓글 작성, 좋아요 클릭, 태그/지역 필터 검색
4. "근처 야간 약국 어디 있어?" RAG 질문
5. 비슷한 야간 약국 글 작성 시 중복 알림 확인
6. "이번 주말 플리마켓 열어도 될까?" 질문으로 MCP 날씨 호출 확인
7. "불법 주차 민원 글 작성해줘"로 Agent 민원 초안과 태그 추천 확인
8. Swagger, embedding table, MCP log, Agent tool log 설명
