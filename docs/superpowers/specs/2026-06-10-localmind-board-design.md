# LocalMind Board Design Spec

## Summary

LocalMind Board는 오산을 기본 지역으로 하는 AI 지역 생활 커뮤니티 게시판이다. 사용자는 맛집, 분실물, 중고거래, 동네 행사, 생활 민원, 병원/약국/주차장, 반려동물/육아 정보를 공유한다. AI 기능은 RAG, MCP, Agent가 코드 구조와 데모에서 명확하게 드러나도록 분리한다.

## Product Scope

### In Scope

- React 모바일 우선 반응형 프론트엔드
- NestJS REST API 서버
- PostgreSQL + pgvector
- Prisma ORM
- JWT Access Token 기반 인증
- 게시글 CRUD
- 댓글 CRUD
- 태그, 카테고리, 페이징, 검색
- 게시글 좋아요
- 오산 기본 지역 필터
- Region 계층 구조 기반 지역 확장성
- RAG 기반 유사 글 추천, 중복 글 알림, 동네 Q&A, 최근 이슈 요약
- JSON-RPC 기반 MCP Server 직접 구현
- 최소 1개 외부 API 연동, MVP는 날씨 API 우선
- Function Calling 기반 AI Agent
- Agent State, 반복 제한, 예외 처리, 도구 호출 로그
- Swagger 문서화
- Docker Compose PostgreSQL

### Out of Scope for MVP

- 이미지 첨부 실제 업로드 구현
- 관리자 페이지
- 실시간 알림
- 소셜 로그인
- 결제
- 실시간 채팅
- 복잡한 개인화 추천

## Frontend Design Spec

프론트엔드는 모바일을 1순위로 설계한다. 지역 커뮤니티 앱에서 익숙한 피드 구조를 참고하되 LocalMind Board 고유 UI로 구현한다.

### Primary Screens

- `/`: 오산 지역 홈 피드
- `/posts/:id`: 게시글 상세
- `/posts/new`: 글쓰기
- `/search`: 게시글 검색
- `/ai`: AI 도우미
- `/login`: 로그인
- `/signup`: 회원가입
- `/me`: 마이페이지

### Mobile Layout

- 상단 앱바: 현재 지역 `오산`, 검색, 알림, 메뉴
- 상단 카테고리 탭: 동네생활, 맛집, 분실물, 중고거래, 동네행사, 생활민원, 병원/약국
- 필터 칩: 추천, 인기, 긴급, 생활정보, AI추천
- 게시글 리스트: 카테고리 배지, 제목, 요약, 동 단위 지역, 작성 시간, 조회수, 좋아요, 댓글 수, 선택 썸네일
- 하단 탭바: 홈, 커뮤니티, 동네지도, AI도우미, 마이페이지
- 우하단 고정 버튼: `+ 글쓰기`

### Responsive Behavior

- 360px 화면에서 가로 스크롤이 없어야 한다.
- 430px 모바일 화면을 기준으로 주요 QA를 한다.
- 768px 이상은 본문 최대 폭 720px, 중앙 정렬을 적용한다.
- 1024px 이상은 우측 보조 패널을 둘 수 있다.

## Region Design

초기 기본 지역은 오산이다.

```text
DEFAULT_REGION_CODE=OSAN
DEFAULT_REGION_NAME=오산
```

지역 데이터는 계층형이다.

```text
경기도(level 1)
오산시(level 2)
오산동, 원동, 궐동, 금암동, 세교동, 부산동, 은계동(level 3)
```

기본 동작:

- 비로그인 사용자는 오산 피드를 본다.
- 로그인 사용자는 `defaultRegionId`가 없으면 오산을 사용한다.
- 게시글 작성 시 region 기본값은 오산시다.
- 상세 동 선택은 선택 입력이다.
- RAG 검색은 regionId가 없으면 오산 데이터를 우선 검색한다.
- MCP 날씨 Tool은 region이 없으면 오산을 사용한다.

## Data Model

Core entities:

- User
- Region
- Category
- Post
- Comment
- Tag
- PostTag
- PostLike
- Notice
- Embedding
- AgentSession
- AgentToolLog
- McpToolLog

`Embedding`은 게시글, 댓글, 공지를 공통 source로 저장한다.

## Prisma Draft

```prisma
enum PostStatus {
  PUBLISHED
  HIDDEN
  DELETED
}

enum EmbeddingSourceType {
  POST
  COMMENT
  NOTICE
}

enum AgentStatus {
  RUNNING
  COMPLETED
  FAILED
}

model User {
  id              String   @id @default(uuid())
  email           String   @unique
  passwordHash    String
  nickname        String
  defaultRegionId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Region {
  id        String   @id @default(uuid())
  name      String
  code      String   @unique
  level     Int
  parentId  String?
  latitude  Float?
  longitude Float?
  createdAt DateTime @default(now())
}

model Category {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
}

model Post {
  id          String     @id @default(uuid())
  title       String
  content     String
  status      PostStatus @default(PUBLISHED)
  authorId    String
  regionId    String
  categoryId  String
  viewCount   Int        @default(0)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Comment {
  id        String   @id @default(uuid())
  postId    String
  authorId  String
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Tag {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now())
}

model PostTag {
  postId String
  tagId  String

  @@id([postId, tagId])
}

model PostLike {
  postId    String
  userId    String
  createdAt DateTime @default(now())

  @@id([postId, userId])
}

model Notice {
  id        String   @id @default(uuid())
  title     String
  content   String
  regionId  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Embedding {
  id         String
  sourceType EmbeddingSourceType
  sourceId   String
  regionId   String?
  content    String
  embedding  Unsupported("vector(1536)")
  createdAt  DateTime @default(now())
}
```

The implementation plan expands this draft with relations and indexes.

## API Spec

### Auth

```text
POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/me
```

### Region

```text
GET   /api/regions
GET   /api/regions/default
PATCH /api/users/me/region
```

### Board

```text
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
```

### AI

```text
POST /api/rag/ask
POST /api/rag/similar-posts
POST /api/rag/duplicate-check
GET  /api/rag/regional-issues
POST /api/agent/post-helper
POST /api/agent/complaint-helper
POST /api/agent/tag-suggestion
POST /api/agent/duplicate-check
```

## RAG Design

RAG는 `RagModule` 안에 둔다.

- `EmbeddingService`: LLM embedding API 호출
- `RagIngestionService`: 게시글/댓글/공지 저장 후 embedding upsert
- `VectorSearchService`: pgvector 유사도 검색
- `RagService`: 질문 답변, 유사 글, 중복 검사, 이슈 요약

Acceptance criteria:

- 게시글 작성 후 `Embedding` row가 생성된다.
- `/api/rag/ask`는 answer와 sources를 반환한다.
- `/api/rag/duplicate-check`는 threshold 이상이면 duplicateCandidates를 반환한다.
- regionId 미입력 시 오산 regionId를 사용한다.

## MCP Design

MCP 서버는 `apps/mcp-server`로 분리한다. JSON-RPC 2.0 형식을 사용한다.

Tool list:

- `get_weather_by_region`
- `search_public_facility`
- `get_local_event_info`

Acceptance criteria:

- `POST /rpc`가 JSON-RPC 요청을 받는다.
- 알 수 없는 method는 JSON-RPC error를 반환한다.
- 알 수 없는 tool name은 JSON-RPC error를 반환한다.
- 정상 tool 호출은 result를 반환하고 `McpToolLog`에 저장된다.

## Agent Design

Agent는 `AgentModule` 안에서 실행한다.

Tool list:

- `vector_search_posts`
- `check_duplicate_post`
- `suggest_tags`
- `call_mcp_tool`
- `draft_local_post`
- `draft_complaint_post`
- `summarize_context`

State:

```ts
type AgentState = {
  sessionId: string;
  userId?: string;
  regionCode: string;
  regionName: string;
  input: string;
  messages: AgentMessage[];
  toolCalls: AgentToolCall[];
  iteration: number;
  maxIterations: number;
};
```

Acceptance criteria:

- `maxIterations` 기본값은 4다.
- 같은 tool과 같은 input은 한 session에서 2회 이상 호출하지 않는다.
- 모든 tool call은 `AgentToolLog`에 저장한다.
- Tool 실패 시 session을 바로 죽이지 않고 fallback 답변을 만든다.

## README Draft

```md
# LocalMind Board

LocalMind Board는 오산 지역 주민들이 맛집, 분실물, 중고거래, 동네 행사, 생활 민원, 병원/약국/주차장 정보를 공유하는 AI 지역 생활 커뮤니티 게시판입니다.

프론트엔드는 모바일 우선 반응형 UI로 구현하며, 오산 지역 피드를 기본으로 보여줍니다. 지역 데이터는 계층형 Region 구조로 설계하여 추후 다른 시/군/구로 확장할 수 있습니다.

## 주요 기능

- JWT 회원가입 / 로그인
- 게시글 CRUD
- 댓글 CRUD
- 태그 / 카테고리
- 지역 필터링
- 검색 / 페이징
- 게시글 좋아요
- RAG 기반 동네 Q&A
- 유사 게시글 추천
- 중복 게시글 방지 알림
- MCP 기반 외부 날씨 데이터 조회
- AI Agent 기반 글 작성 도우미 / 민원 작성 도우미 / 태그 추천
```

## Self Review

- Unresolved marker scan: no open implementation requirement remains.
- Scope check: MVP is intentionally limited to one region, one external MCP weather tool, and core board features.
- Consistency check: architecture, DB, API, RAG, MCP, and Agent sections all use the same app split: `apps/web`, `apps/api`, `apps/mcp-server`.
