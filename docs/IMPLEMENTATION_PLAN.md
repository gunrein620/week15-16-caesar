# 정글밥 구현 계획

## 구현 Phase

### Phase 1. 기본 앱 뼈대

- monorepo 구성
- `apps/web` Next.js 앱 생성
- `apps/mcp-server` JSON-RPC 서버 생성
- `packages/db` Prisma 공유 패키지 생성
- PostgreSQL 연결
- 회원가입 / 로그인
- 기본 레이아웃

### Phase 2. 게시판/식단

- MenuArchive 조회
- 오늘/주간 식단 화면
- Review CRUD
- Comment
- Tag
- 검색 / 페이징
- FoodPreference 음식 프로필

### Phase 3. RAG

- ReviewChunk 생성
- OpenAI Embedding 연동
- Prisma `Float[]` 임베딩 저장
- 메뉴명/태그 정확 검색
- 앱 레이어 코사인 유사도 의미 검색
- 두 검색 결과 병합

### Phase 4. MCP

- 별도 MCP 서버 구현
- JSON-RPC 요청/응답 처리
- Slack history import
- Kakao weekly/daily sync
- OCR/텍스트화
- 식중독 위험도 외부 API 조회
- McpCallLog 저장

### Phase 5. Agent

- `/ai/recommend` 화면
- 직접 tool loop 구현
- GOOD / CAUTION / AVOID 판단
- 최종 답변 생성
- 결과 + 도구 로그 표시
- AgentRun / AgentStep 저장

## 화면 구성

```txt
/
- 홈, 오늘 메뉴 요약, AI 추천 진입

/menus
- 오늘/주간 식단 보기

/reviews
- 후기 목록, 검색, 태그 필터, 페이징

/reviews/new
- 후기 작성

/reviews/[id]
- 후기 상세, 댓글

/profile/food
- 알레르기/선호/불호/매운맛 허용도 관리

/ai/recommend
- "오늘 메뉴 나한테 괜찮아?" AI 추천
- 추천 결과와 사용 도구 로그 표시

/admin/agent-runs
- Agent 실행 로그 확인
```

## API 초안

```txt
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/menus
GET    /api/menus/week

GET    /api/reviews
POST   /api/reviews
GET    /api/reviews/:id
PATCH  /api/reviews/:id
DELETE /api/reviews/:id

POST   /api/reviews/:id/comments

GET    /api/profile/food
PATCH  /api/profile/food

POST   /api/ai/recommend

GET    /api/admin/agent-runs
GET    /api/admin/mcp-call-logs
```

MCP 서버는 별도 JSON-RPC 엔드포인트를 제공합니다.

```txt
POST /rpc
```

## MCP 실행 정책

```txt
최초 import
- Slack 특정 채널의 누적 식단 텍스트/이미지 전체 수집

주간 식단표
- 매주 월요일 10:00~11:00 사이 Kakao 이미지 확인
- OCR 성공 시 월~토 점심/저녁을 MenuArchive에 저장

당일 식단 이미지
- 점심: 11:00~12:00
- 저녁: 17:00~18:00
- Kakao 일별 포스트 또는 Slack 이미지 수집
```

## 대표 데모 시나리오

질문:

```txt
오늘 점심 나한테 괜찮아? 나는 새우 알레르기가 있고 매운 음식은 별로야.
```

처리:

```txt
1. 오늘 점심 메뉴 조회
2. 사용자 음식 프로필 조회
3. 새우/매운 음식 룰 기반 체크
4. RAG로 과거 유사 후기/댓글 검색
5. MCP로 식중독 위험도 조회
6. AI Agent가 최종 답변 생성
7. 실행 로그 저장
```

결과:

```txt
- 추천도: GOOD / CAUTION / AVOID
- 한 줄 요약
- 주의 음식
- 과거 후기 근거
- 식중독 위험도
- 사용한 도구 로그
- 공식 식단표 확인 안내
```

## 개발 원칙

- 먼저 mock 데이터로 화면/API 흐름을 완성한다.
- 이후 Prisma/PostgreSQL 저장소와 연결한다.
- RAG, MCP, Agent는 각각 역할을 분리한다.
- 알레르기/식품안전 관련 답변은 단정하지 않는다.
- Agent와 MCP는 반드시 실행 로그를 남긴다.
- Slack/Kakao 자동 수집이 막히면 로컬 이미지/샘플 데이터로 같은 MCP 흐름을 검증한다.
