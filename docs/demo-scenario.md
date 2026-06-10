# LocalMind Board 데모 시나리오

이 문서는 발표자가 LocalMind Board의 기본 게시판 기능, RAG, MCP, AI Agent가 각각 드러나도록 시연하는 순서입니다.

## 0. 준비

```bash
npm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

RAG 질문과 중복 확인을 실제로 답변까지 시연하려면 `.env`에 `OPENAI_API_KEY`를 먼저 넣고 `npm run prisma:seed`를 실행합니다. 키가 없으면 seed는 샘플 게시글만 만들고 embedding 생성은 건너뛰므로, RAG 단계는 구조 설명 또는 API 오류 처리 설명으로 대체합니다.

접속 주소:

- Web: `http://localhost:5173`
- Swagger: `http://localhost:3000/api/docs`
- MCP RPC: `http://localhost:3010/rpc`

데모 계정:

```text
email: demo@localmind.dev
password: password123
```

## 1. 모바일 홈 확인

1. `http://localhost:5173` 접속
2. 상단 지역이 `오산`으로 표시되는지 확인
3. 카테고리 탭에서 `동네생활`, `맛집`, `분실물`, `중고거래`, `동네행사`, `생활민원`, `병원/약국` 확인
4. seed 게시글이 오산 지역 피드처럼 보이는지 설명

보여줄 포인트:

- 모바일 우선 UI
- 당근 스타일의 지역 커뮤니티 정보 구조
- 지역 확장을 고려한 `regions` 테이블

## 2. 회원가입/로그인

1. 로그인 화면에서 데모 계정으로 로그인
2. 로그인 후 게시글 작성 버튼 진입

보여줄 포인트:

- Access Token 중심 JWT 인증
- 인증이 필요한 API는 Swagger에서 Bearer Token 필요

## 3. 게시글 작성

예시 입력:

```text
제목: 오산역 근처 야간 약국 정보 공유합니다
본문: 어제 밤에 아이가 열이 나서 찾았는데 오산역 근처 약국 정보를 댓글로 모으면 좋겠습니다.
태그: 야간약국, 생활정보, 오산역
카테고리: 병원/약국
지역: 오산
```

보여줄 포인트:

- 게시글 CRUD
- 태그 연결
- 기본 지역이 오산으로 들어가는 구조
- 작성 후 RAG ingestion 대상이 됨

## 4. 댓글과 좋아요

1. 게시글 상세 진입
2. Swagger 또는 `docs/api-examples.md`의 댓글 작성 curl 실행
3. Swagger 또는 `docs/api-examples.md`의 좋아요 curl 실행
4. 게시글 목록을 새로고침해 댓글/좋아요 카운트 확인

보여줄 포인트:

- 댓글 CRUD
- 좋아요 idempotent 처리
- 게시글 카드의 댓글/좋아요 카운트

## 5. RAG 질문

Swagger 또는 Web AI 화면에서 질문:

```text
근처 야간 약국 어디 있어?
```

보여줄 포인트:

- 질문 embedding 생성
- pgvector 유사도 검색
- 게시글/댓글/공지 기반 답변 생성
- 관련 글 링크와 요약 제공 구조

## 6. 중복 게시글 확인

질문:

```text
오산역 근처 야간 약국 알려주세요
```

보여줄 포인트:

- 새 글 작성 전 유사 게시글 탐색
- 중복 가능성이 높으면 기존 글을 추천
- 커뮤니티의 반복 질문을 줄이는 목적

## 7. MCP 날씨 Tool 호출

MCP RPC 예시:

```json
{
  "jsonrpc": "2.0",
  "id": "demo-weather",
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

시연 질문:

```text
이번 주말 오산에서 플리마켓 열어도 될까?
```

보여줄 포인트:

- MCP Server가 JSON-RPC 요청을 처리
- 날씨 Tool을 통해 외부 데이터가 필요한 질문에 대응
- API Key가 없어도 mock fallback으로 발표 가능

## 8. AI Agent 민원 글 작성

Agent 입력:

```text
오산역 뒤쪽 골목에 불법 주차가 계속돼서 아침마다 차가 못 지나가. 민원 글로 정리해줘.
```

보여줄 포인트:

- Agent가 사용자 요청을 보고 도구를 선택
- RAG 중복 확인 또는 MCP Tool 호출 가능
- `agent_sessions`, `agent_tool_logs`에 상태와 도구 호출 로그 저장
- 최대 반복 횟수와 중복 도구 호출 방지

## 9. Swagger와 DB 로그 설명

Swagger에서 확인할 API:

- `/api/posts`
- `/api/rag/ask`
- `/api/rag/duplicate-check`
- `/api/agent/complaint-helper`

DB에서 설명할 테이블:

- `embeddings`: RAG 지식 저장소
- `agent_sessions`: Agent 실행 상태
- `agent_tool_logs`: Agent 도구 호출 로그
- `mcp_tool_logs`: MCP Tool 호출 로그

## 10. 마무리 설명

강조할 점:

- 기본 게시판 기능과 AI 기능이 분리되어 있으면서도 같은 게시판 데이터를 사용함
- RAG, MCP, Agent가 각각 명확한 책임을 가짐
- MVP는 오산이지만 Region 구조로 다른 지역 확장 가능
- 이미지 첨부, 지도 UI, 실제 외부 API 운영 연동은 후속 개선 범위
