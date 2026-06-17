# 정글밥 🐵

> 정글러를 위한 **AI 식단 후기 게시판**
> 핵심 질문: **"오늘 메뉴, 나한테 괜찮아?"**

정글밥은 구내식당 식단과 사용자 후기를 모아, 사용자의 알레르기·선호·불호·매운맛 프로필과 **과거 후기 근거**를 종합해 오늘 메뉴가 나에게 괜찮은지를 AI가 판단해 주는 게시판입니다. **RAG · MCP · AI Agent** 세 가지 AI 기술이 하나의 추천 흐름 안에서 함께 동작합니다.

---

## 1. 프로젝트 개요

매일 구내식당 메뉴가 바뀌고, 알레르기·취향이 제각각인데 "이거 내가 먹어도 되나?"를 매번 직접 판단하기 번거롭습니다. 정글밥은 이 일상적인 문제를 AI로 자동화합니다.

- **데이터 자동 수집**: Slack·Kakao에 올라오는 식단을 MCP 서버가 수집하고 OpenAI Vision으로 OCR해 구조화
- **개인화 판단**: 내 음식 프로필 + 다른 사람들의 후기를 근거로 LLM이 GOOD / CAUTION / AVOID 판단
- **투명성**: 에이전트가 어떤 단계를 거쳐 결론에 도달했는지 타임라인으로 시각화

---

## 2. 기술 스택

| 영역 | 선택 |
| --- | --- |
| Frontend | React (Next.js App Router) |
| Backend | Next.js (Route Handlers) |
| Database | PostgreSQL (네이티브 로컬) |
| ORM | Prisma |
| LLM | OpenAI API (`gpt-4.1-mini`) |
| Embedding | OpenAI Embedding (1536d) |
| RAG | Float[] 임베딩 코사인 유사도 + 키워드 폴백 (직접 구현) |
| MCP | 별도 JSON-RPC 기반 MCP 서버 |
| Agent | Function/step 기반 도구 오케스트레이션 + 상태 영속화 |

---

## 3. 주요 구현 기능

### 기본 게시판 (필수)
- 회원가입 / 로그인 / 로그아웃 (세션 쿠키 기반) + 데모 계정 원클릭 체험
- 후기(게시물) CRUD
- 댓글 작성·삭제
- 태그 (작성·필터)
- 페이징
- 검색 (키워드 / 메뉴명 / 태그)

### 식단
- 일별·주간 식단 보기, 메뉴 사진(없으면 이모지 대체)
- 내 알레르기·기피 재료 **하이라이트**
- 메뉴별 과거 평균 별점 배지
- "이 메뉴 후기 쓰기" 바로가기

### 개인화 (음식 프로필)
- 알레르기 / 선호 / 불호 음식, 매운맛 허용도 칩 설정
- 설정 즉시 "오늘 메뉴 GOOD/CAUTION" 미리보기

### AI 기능 (필수)
- **RAG** — 후기·댓글 근거 검색 + 비슷한 후기 추천
- **MCP** — Slack/Kakao 식단 수집 + OCR
- **AI Agent** — 메뉴·프로필·후기를 종합한 개인화 판단 + 챗봇(정글밥 몽키)

---

## 4. 전체 아키텍처

```
                ┌──────────────── apps/mcp-server (JSON-RPC) ────────────────┐
[Slack API]──┐  │  import_slack_menu_history / sync_weekly_menu /            │
[Kakao]──────┼─▶│  sync_daily_menu_image / extract_menu_from_image          │──OCR(OpenAI Vision)─┐
[OpenAI Vision]─┘  (McpCallLog에 모든 호출 로깅, .env로 키 관리)             │                      ▼
                └────────────────────────────────────────────────────────────┘            MenuArchive
                                                                                                │
사용자 ─▶ apps/web (Next.js / React) ─▶ 후기·댓글 ─chunk+embedding─▶ ReviewChunk            (PostgreSQL)
                          │                                                  │
                          ▼                                                  │
            /ai/recommend (AI Agent) ── 오늘 메뉴 + 내 프로필 + RAG 검색 ──▶ LLM 판단 ──▶ GOOD/CAUTION/AVOID
                          │                                                          (+ AgentRun/Step 영속)
                          └─▶ 정글밥 몽키 챗봇 (규칙 즉답 + LLM 자유대화)
```

모노레포 구성:
- `apps/web` — 프론트엔드 + API Route Handlers
- `apps/mcp-server` — JSON-RPC MCP 서버 (외부 데이터 수집/OCR)
- `packages/db` — Prisma 스키마/클라이언트 공유
- `packages/ai` — 임베딩·해시·OpenAI 호출 유틸

---

## 5. AI 활용 기능 상세

### 5.1 RAG (Retrieval-Augmented Generation)

| 단계 | 구현 |
| --- | --- |
| 데이터 소스 | 사용자 후기·댓글을 `ReviewChunk`로 청킹 (`features/rag/chunk.ts`) |
| 임베딩 | OpenAI 임베딩(1536차원)으로 청크 벡터화 (`features/rag/embedding.ts`) |
| 벡터 저장/검색 | Prisma `Float[]` 컬럼에 저장 후 앱 레이어에서 코사인 유사도 top-k 검색, 실패 시 키워드(`contains`) 폴백 |
| 생성(AG) | 검색된 **후기 본문을 LLM에 근거로 주입** → 판단·설명 생성 (`judgeWithReviews`) |

- **기능**: ① 후기 상세의 "비슷한 후기" 추천, ② "오늘 메뉴 괜찮아?"에 **과거 후기를 근거로** 답변
- 검색(R)과 생성(AG)이 모두 연결된 완전한 RAG 루프. LangChain 등 프레임워크 없이 직접 구현해 내부 동작을 투명하게 관리.

### 5.2 MCP (Model Context Protocol)

| 항목 | 구현 |
| --- | --- |
| 서버 | `apps/mcp-server` — HTTP **JSON-RPC** (`index.ts`, `json-rpc.ts`, `rpc-methods.ts`) |
| 도구 | `import_slack_menu_history`, `fetch_kakao_weekly_menu_image`, `sync_weekly_menu`, `sync_daily_menu_image`, `extract_menu_from_image` |
| 외부 서비스 | **Slack API**(식단 메시지), **Kakao 채널**(식단표 이미지), **OpenAI Vision**(OCR) — 3종 |
| 키/권한 | `.env`로 키 분리, 모든 도구 호출을 `McpCallLog` 테이블에 로깅(관측성) |

- 주간 식단표 이미지를 비전 모델로 OCR해 월~토 점심/저녁으로 구조화하고, 일별 식단을 매일 자동 수집.

### 5.3 AI Agent

| 항목 | 구현 |
| --- | --- |
| 추론 단계 | 오늘 메뉴 조회 → 음식 프로필 조회 → RAG 검색 → LLM 판단 |
| 상태/메모리 | 실행·단계를 `AgentRun` / `AgentStep` 테이블에 영속화 → "내 진단 히스토리"로 재조회 |
| 예외/안전 | 단계 실패 시 `FAILED` 기록, **알레르기 매칭 시 LLM과 무관하게 AVOID 강제**(안전장치), LLM 실패 시 규칙 기반 폴백 |
| 시각화 | 실행 단계를 타임라인 UI로 표시 |
| 챗봇 | "정글밥 몽키" — 규칙 기반 의도 분류(메뉴/매운맛/프로필 등) + 그 외 자유 질문은 LLM 대화 |

---

## 6. 데모

- 홈: 오늘의 식단 + AI 진단 카드 + 베스트 후기
- `/menus`: 주간 식단 + 알레르기 하이라이트
- `/ai/recommend`: 에이전트 실행 타임라인 + 후기 근거
- 챗봇: 정글밥 몽키와 대화

---

## 7. 실행 방법

```bash
# 0) PostgreSQL 준비
#    Docker를 쓰는 경우:
#    docker compose up -d postgres
#
#    로컬 DB를 직접 쓰는 경우:
#    CREATE USER junglebob WITH PASSWORD 'junglebob';
#    CREATE DATABASE junglebob OWNER junglebob;

# 1) 의존성 설치
pnpm install

# 2) .env 설정 (DATABASE_URL, OPENAI_API_KEY, KAKAO_*, SLACK_* 등)

# 3) 스키마 반영
pnpm --filter @junglebob/db exec prisma db push

# 4) 식단 수집 + 데모 후기 시드
pnpm --filter @junglebob/mcp-server import:slack-meals
pnpm --filter @junglebob/web seed:demo-reviews

# 5) 실행
pnpm --filter @junglebob/web dev   # http://localhost:3000
```

---

## 8. 회고 · 한계 · 개선 아이디어

### 잘된 점
- RAG·MCP·Agent가 **분리된 기능이 아니라 하나의 판단 흐름**으로 엮였다.
- MCP로 실제 외부 데이터(Slack·Kakao)를 수집하고 비전 OCR로 구조화해, "살아있는 데이터" 위에서 동작한다.
- 에이전트 상태를 DB에 영속화하고 실행 과정을 시각화해 **판단의 투명성**을 확보했다.

### 한계
- **재료 추론**: 알레르기 매칭이 메뉴 "이름" 문자열 기반이라, 이름에 안 드러난 재료(예: 김밥 속 오이)는 못 잡는다. (LLM 판단이 일부 보완)
- **에이전트 자율성**: 현재는 고정 단계 파이프라인 — LLM이 도구를 스스로 선택하는 function-calling 루프는 아니다.
- **벡터 인프라**: 로컬 네이티브 Postgres 운영 편의를 위해 벡터 확장 의존도를 낮췄다.

### 개선 아이디어
- LLM **재료 추출 단계**를 추가해 메뉴 → 재료 정규화 후 매칭 정확도 향상
- 에이전트를 **function-calling 자율 루프**(도구 선택 + 반복 한도/예외)로 고도화
- 에이전트가 MCP 도구를 직접 호출하도록 연결(현재는 스케줄러 호출)
- 후기 사진 첨부, 트렌드 리포트, 다국어 검색 등 확장

---
