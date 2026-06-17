# 정글밥 결정 사항

이 문서는 구현 중 흔들리지 않도록 지금까지 확정한 내용을 모아둔 기준 문서입니다.

## 1. 서비스

- 서비스명: 정글밥
- 주제: 정글러를 위한 AI 식단 후기 게시판
- 핵심 질문: "오늘 메뉴 나한테 괜찮아?"
- 핵심 시연: RAG, MCP, Agent가 하나의 추천 흐름 안에서 모두 동작하는 장면

## 2. 기술 스택

- Frontend: React
- Backend: Next.js
- Database: PostgreSQL
- ORM: Prisma
- Vector DB: 별도 확장 없이 Prisma `Float[]` 임베딩 저장
- LLM: OpenAI API
- Embedding: OpenAI Embedding
- MCP: 별도 JSON-RPC 기반 MCP 서버
- Agent: 직접 tool loop + LangGraph 유사 step pipeline

## 3. 프로젝트 구조

```txt
bob/
  apps/
    web/
    mcp-server/
  packages/
    db/
    ai/
  storage/
    menu-images/
    review-images/
  docs/
```

## 4. 데이터 수집

### 과거 데이터

- Slack 특정 채널에 누적된 식단 텍스트/이미지 전체 import
- 몽키봇이 보낸 메시지 우선 수집
- 식단, 중식, 석식, 메뉴, 점심, 저녁 키워드 메시지 보조 수집
- 최초 1회 전체 import 후 마지막 수집 시점 이후 데이터만 추가 수집

### 주간 식단표

- 매주 월요일 10:00~11:00 사이 Kakao 주간 식단표 이미지 확인
- 기존 몽키봇의 `sync_weekly_menu_image` 로직 참고
- OCR/Vision으로 월~토 점심/저녁 메뉴 추출
- 날짜 + 식사 단위로 `MenuArchive` 저장

### 당일 식단 이미지

- 점심: 11:00~12:00 사이 확인
- 저녁: 17:00~18:00 사이 확인
- Kakao 일별 포스트 또는 Slack 이미지 수집
- 기존 몽키봇의 당일 식단 이미지 수집/전송 로직 참고

## 5. 식단 저장 방식

식단은 날짜 + 점심/저녁 단위로 저장합니다.

```txt
MenuArchive
- date
- mealType: LUNCH | DINNER
- items
- rawText
- imageUrl
- sourceType: SLACK | KAKAO | MANUAL
- sourceId
- imageHash
- syncedAt
```

## 6. 후기 구조

- 후기는 특정 `MenuArchive`에 연결할 수 있지만 필수는 아님
- 검색과 RAG 품질을 위해 `menuNames` 저장
- 사용자가 메뉴 키워드를 직접 입력 가능
- 비워두면 AI가 본문에서 메뉴 키워드를 자동 추출

```txt
Review
- title
- content
- rating
- imageUrl
- menuArchiveId optional
- menuNames
- tags
```

## 7. 사용자 음식 프로필

```txt
FoodPreference
- allergyFoods
- favoriteFoods
- dislikedFoods
- spicyTolerance: NONE | LOW | MEDIUM | HIGH
```

## 8. AI 추천 결과

추천 결과는 3단계입니다.

```txt
GOOD
- 현재 정보 기준으로 큰 주의사항이 보이지 않음

CAUTION
- 먹을 수는 있지만 주의 요소가 있음

AVOID
- 알레르기 또는 명확히 피해야 하는 조건과 충돌
```

화면에는 결과와 함께 사용한 도구 로그를 간단히 표시합니다.

## 9. RAG

RAG 검색 대상:

- Review title/content
- Review menuNames/tags
- Comment content

RAG 검색 방식:

```txt
1. 메뉴명/태그 기반 정확 검색
2. `ReviewChunk.embedding Float[]` 기반 코사인 유사도 검색
3. 두 결과 병합
4. 중복 제거
5. 상위 3~5개를 Agent에 전달
```

## 10. MCP

- 별도 MCP 서버 구현
- JSON-RPC 기반 요청/응답 처리
- MCP 서버가 PostgreSQL에 직접 저장
- Slack, Kakao, OCR, 식품안전 API 연동
- API Key는 `.env`로 관리

v1 tools:

```txt
import_slack_menu_history
fetch_kakao_weekly_menu_image
sync_weekly_menu
sync_daily_menu_image
extract_menu_from_image
get_food_poisoning_risk
```

## 11. Agent

- 직접 tool loop 구현
- LangGraph 라이브러리는 v1에서 사용하지 않음
- LangGraph와 유사하게 step pipeline으로 설계
- Agent state에 각 step 결과 저장
- AgentRun / AgentStep 로그 저장
- 고정 step과 max step으로 무한 루프 방지

Agent steps:

```txt
get_today_menu
get_user_food_profile
check_food_rules
search_similar_reviews
get_food_poisoning_risk
generate_final_answer
save_agent_logs
```

## 12. 인증

- 이메일/비밀번호 직접 구현
- 비밀번호는 bcrypt hash로 저장
- 로그인 시 session token 생성
- DB에는 tokenHash 저장
- 브라우저에는 httpOnly cookie 저장

## 13. 이미지 저장

- v1은 로컬 파일 저장
- 저장 위치:

```txt
storage/menu-images/
storage/review-images/
```

- 추후 S3/Supabase Storage로 교체 가능

## 14. 구현 순서

```txt
Phase 1: 기본 앱 뼈대
Phase 2: 게시판/식단
Phase 3: RAG
Phase 4: MCP
Phase 5: Agent
```
