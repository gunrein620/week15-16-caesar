# jungle-snack-court

크래프톤 정글 학우들이 간식이나 야식을 먹은 이유를 빠르게 올리고, 다른 학우들에게 정당한 간식 섭취였는지 공감받기 위한 게시판입니다.

## 현재 구현된 기능

- Next.js App Router, React, TypeScript, Tailwind CSS 기반 메인 화면
- Auth.js / NextAuth 소셜 로그인 구조
- Google, Kakao, Naver provider 설정
- Prisma Adapter와 PostgreSQL 기준 Prisma schema
- DB는 향후 기능을 고려해 확장 모델을 미리 포함
- 로그인 전/후 메인 UI 분기
- 메인 페이지 안에서 바로 포스트 작성
- 간식 이름, 변명, 점심/저녁 여부, 태그, 이미지 첨부 입력
- 이미지 최대 5장, jpg/png/webp 제한, 선택 즉시 미리보기, 개별 삭제
- `POST /api/posts`, `GET /api/posts`, `DELETE /api/posts/[id]`
- `POST /api/posts/[id]/votes`
- `GET /api/posts/[id]/comments`, `POST /api/posts/[id]/comments`
- `DELETE /api/comments/[id]`
- `POST /api/comments/[id]/likes`, `DELETE /api/comments/[id]/likes`
- `GET /api/meals/recent`
- 로컬 `public/uploads/posts` 파일 저장 구조
- 최신 포스트 피드, 이미지 슬라이드, 본인 글 삭제
- 포스트별 판결 투표 집계와 내 선택 상태 표시
- 좋아요 상위 댓글 2개 하이라이트, 댓글창 열기 후 전체 댓글 최신순 표시
- 본인 댓글 삭제와 댓글 좋아요
- 카카오 채널 `_xhzNjn` 공개 포스트 JSON 기반 식단 크롤링 및 DB 캐싱
- 카카오 식단 제목 패턴 분류: 주차 식단표, 중식 메뉴, 석식 메뉴
- MealPost, MealMenu 캐시 저장 및 kakaoPostId 중복 방지
- 작성칸에서 추천 식단 불러오기, 첨부, 제거
- 포스트 작성 시 선택된 식단을 PostMealContext에 저장
- 피드 카드에 첨부 식단 날짜, 중식/석식, 메뉴 텍스트, 이미지 링크 표시
- 로그인 사용자용 Notifications API 기반 브라우저 알림 권한 요청, 테스트 알림, 포스트 작성 완료 알림
- `POST /api/posts/[id]/judgements` 기반 AI 간식 판결 생성
- 최신 AI 판결을 `AiJudgement`에 저장하고 포스트 카드에서 판결 배지, 요약, 상세 판결문 표시
- 작성자만 AI 재판결 요청 가능
- AI 판결 생성 완료 시 브라우저 탭 알림 표시

## 실행 방법

```bash
npm install
npx prisma migrate dev
npx prisma generate
npx prisma db seed
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

PostgreSQL DB에 실제 테이블을 만들 때는 `.env.local` 같은 로컬 환경변수 파일의 `DATABASE_URL`을 맞춘 뒤 아래 명령을 실행합니다.

```bash
npx prisma migrate dev
```

기존 DB가 있다면 최신 Prisma schema에 맞춰 마이그레이션을 추가로 생성해야 합니다.

## Seed 데이터

테스트 피드를 빠르게 확인하려면 마이그레이션 후 seed를 실행합니다.

```bash
npx prisma db seed
```

seed는 다음 표시용 데이터를 만듭니다.

- 테스트 유저 3명: `정글식객`, `단백질변호사`, `야식검사`
- 포스트 5개: 이미지 없음, 이미지 1장, 이미지 여러 장, 저녁 패스, 식단 맥락 연결 케이스
- 태그, 판결 투표, 댓글, 댓글 좋아요, 식단 캐시, AI 판결 더미 데이터

seed 유저는 실제 로그인 계정이 아니라 피드 UI 확인용 작성자 데이터입니다. OAuth 키나 OpenAI API 키가 없어도 seed 데이터로 포스트 피드, 이미지 슬라이드, 댓글 하이라이트, 투표 집계, 식단 맥락, 기존 AI 판결 표시를 확인할 수 있습니다.

## 필요한 환경변수

`.env.example`을 참고해 `.env.local` 같은 로컬 환경변수 파일을 준비합니다.

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/jungle_snack_court?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-random-32-byte-secret"
AUTH_SECRET="replace-with-a-random-32-byte-secret"
AUTH_GOOGLE_ID="your-google-client-id"
AUTH_GOOGLE_SECRET="your-google-client-secret"
AUTH_KAKAO_ID="your-kakao-client-id"
AUTH_KAKAO_SECRET="your-kakao-client-secret"
AUTH_NAVER_ID="your-naver-client-id"
AUTH_NAVER_SECRET="your-naver-client-secret"
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.5
```

OAuth 키가 placeholder여도 앱 구조와 빌드는 유지됩니다. 실제 로그인은 각 provider 콘솔에서 발급받은 키와 callback URL 설정이 필요합니다.

OpenAI API 키도 실제 값이 없으면 AI 판결 기능만 비활성화되고, 나머지 게시판 기능은 계속 동작합니다.

## OpenAI API 키 설정과 보안

`.env.local` 또는 프로젝트에서 사용하는 로컬 환경변수 파일에 아래 값을 입력합니다.

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.5
```

- 실제 `OPENAI_API_KEY`는 `.env.local` 같은 로컬 파일에만 입력합니다.
- `.env.local`, `.env`, `.env.development`, `.env.production` 등 실제 secret이 들어갈 수 있는 파일은 GitHub에 커밋하지 않습니다.
- 커밋 가능한 파일은 placeholder만 담은 `.env.example`입니다.
- OpenAI API 키, OAuth secret, Auth secret에는 `NEXT_PUBLIC_` 접두사를 붙이면 안 됩니다. 이 접두사가 붙으면 브라우저 번들에 노출될 수 있습니다.
- 서버에 `OPENAI_API_KEY`가 없으면 포스트 카드에서 AI 판결 요청 시 “서버에 OpenAI API 키가 설정되지 않았습니다.” 안내만 표시됩니다.

AI 판결 기능을 테스트하려면 키를 넣고 개발 서버를 다시 시작한 뒤, 로그인 상태에서 포스트 카드의 `AI 판결 받기` 버튼을 누릅니다. API로 확인할 때는 `POST /api/posts/{postId}/judgements`를 호출합니다. 이미 판결이 있으면 최신 판결을 반환하고, 작성자만 `{ "force": true }`로 재판결을 요청할 수 있습니다.

## DB 설계 범위

현재 API/UI는 소셜 로그인, 메인 작성칸, 이미지 첨부, 포스트 피드, 내 글 삭제, 판결 투표, 댓글, 댓글 좋아요, 카카오 식단 캐싱, AI 판결, 브라우저 탭 알림을 구현합니다. Prisma schema는 이후 확장을 고려해 아래 모델을 미리 포함합니다.

- Auth.js: `User`, `Account`, `Session`, `VerificationToken`
- 게시글: `Post`, `PostImage`, `Tag`, `PostTag`
- 댓글: `Comment`, `CommentLike`
- 공감/판결 투표: `Vote`
- 카카오 식단 크롤링 캐시: `MealPost`, `MealMenu`
- 포스트와 식단 연결: `PostMealContext`
- AI 판결: `AiJudgement`
- RAG: `RagDocument`, `RagEmbedding`
- 알림 이벤트: `NotificationEvent`

아직 RAG API와 MCP 서버는 구현하지 않았습니다. RAG embedding은 당장 pgvector를 쓰지 않고 `embeddingJson Json`에 저장하도록 설계했습니다. 이후 PostgreSQL `pgvector` 확장을 붙이면 벡터 검색용 컬럼과 인덱스로 개선할 예정입니다.

## 카카오 식단 크롤링

- 카카오 채널 `_xhzNjn`의 공개 JSON을 서버에서 `fetch`로 조회합니다.
- 목록 API: `https://pf.kakao.com/rocket-web/web/profiles/_xhzNjn/posts`
- 상세 API: `https://pf.kakao.com/rocket-web/web/profiles/_xhzNjn/posts/{postId}`
- 크롤링 실패, 메뉴 미공개, 캐시 없음 상태는 작성 자체를 막지 않고 UI 메시지로 안내합니다.
- `GET /api/meals/recent`는 현재 시각 기준으로 오늘 중식/석식 우선순위를 정하고, 없으면 오늘 다른 식단, 그래도 없으면 가장 최근 식단을 반환합니다.

## 현재 알림 기능의 한계

- 현재 알림은 Service Worker/Web Push가 아니라 브라우저 Notifications API만 사용합니다.
- 현재 알림은 브라우저 탭이 열려 있는 동안만 동작합니다.
- 앱이 닫혀 있을 때 오는 푸시 알림, VAPID key, DB subscription 저장은 아직 구현하지 않았습니다.
- 백그라운드 푸시는 추후 Service Worker + Web Push로 확장할 예정입니다.

## UI 개선 방향

- 첫 화면은 랜딩페이지가 아니라 작성칸과 최신 피드가 바로 보이는 앱 화면으로 유지합니다.
- 전체 톤은 음식 SNS와 캠퍼스 커뮤니티 사이의 가볍고 위트 있는 분위기를 목표로 합니다.
- 피드 카드는 간식 사건, 식단 맥락, 판결 투표, 주요 댓글, AI 판결이 한 흐름으로 읽히도록 구성합니다.
- seed 데이터만으로도 이미지 슬라이드, 댓글 하이라이트, 투표 집계, 식단 맥락, AI 판결 표시를 확인할 수 있습니다.

## RAG 판례/외부 자료 정책

- AI 판결 RAG는 현재 사이트 DB 안의 `판례` 포스트를 최우선으로 사용합니다.
- 유사 판례의 투표가 충분하면 커뮤니티 투표 결과를 먼저 반영하고, 투표 결론이 없으면 기존 AI 판결 또는 현재 AI의 추론을 보조적으로 사용합니다.
- 내부 판례가 3건 미만이면 `RagDocument`에 저장된 외부 스낵/식단/운동 맥락 문서를 fallback 자료로 함께 전달합니다.
- 외부 자료는 원문 전체를 복사하지 않고, 공개 URL 조회 결과 메타데이터와 프로젝트에서 작성한 짧은 요약만 저장합니다.
- 외부 RAG 문서를 갱신하려면 DB가 연결된 상태에서 아래 명령을 실행합니다.

```bash
npm run rag:seed
```

- 현재 외부 RAG는 pgvector 검색이 아니라 DB에 저장된 요약 문서를 키워드 기반으로 필터링합니다. 이후 `RagEmbedding.embeddingJson` 또는 PostgreSQL pgvector로 유사도 검색을 고도화할 수 있습니다.

## MCP 서버

이 프로젝트는 과제 데모와 AI Agent 연동을 위한 경량 stdio MCP 서버를 포함합니다.
웹 UI를 직접 호출하지 않아도 외부 AI 클라이언트가 게시판 컨텍스트를 도구로 조회할 수 있습니다.

```bash
npm run mcp
```

제공 MCP tools:

- `search_snack_precedents`: 로컬 DB의 유사 판례 포스트를 검색하고 유사도 근거, 투표 수, 기존 결론을 반환합니다.
- `search_external_snack_rag`: `RagDocument`에 저장된 외부 RAG 요약 문서를 검색합니다.
- `get_recent_meal_context`: 캐싱된 중식/석식 추천 식단 맥락을 반환합니다.
- `get_post_context`: 특정 포스트의 작성자, 태그, 이미지, 식단 맥락, 투표 수, 하이라이트 댓글, 최신 AI 판결을 증거 패키지로 반환합니다.

발표 기준으로 MCP는 AI 판사 Agent가 판결 전에 사용할 수 있는 도구 경계입니다.
Agent는 MCP tool을 통해 내부 판례, 외부 RAG fallback 문서, 식단 맥락, 포스트 증거를 수집한 뒤 AI 판결을 생성하는 구조로 설명할 수 있습니다.

## 이후 구현 예정 기능

- 실제 PostgreSQL 마이그레이션과 배포 환경 구성
- 이미지 저장소를 S3 또는 R2로 교체
- AI 판결 프롬프트 버전 관리와 재시도 UX 고도화
- RAG 임베딩/pgvector 검색 고도화
- Web Push
- 검색과 필터

## MCP, RAG, AI 판결 통합 흐름

MCP 서버는 다음 명령으로 실행합니다.

```bash
npm run mcp
```

제공 MCP tools:

- `search_snack_precedents`: 내부 게시판 DB에서 유사 판례를 조회합니다.
- `search_external_snack_rag`: 내부 판례가 부족할 때 참고할 외부 RAG 문서를 조회합니다.
- `get_recent_meal_context`: 현재 추천 식단 맥락을 조회합니다.
- `get_post_context`: 특정 포스트의 작성자, 태그, 이미지, 식단, 투표, 하이라이트 댓글, 최신 AI 판결을 조회합니다.
- `build_judgement_context`: AI 판결에 들어가는 전체 근거 패키지를 한 번에 반환합니다.

앱 브라우저 클라이언트는 MCP를 직접 호출하지 않습니다. MCP는 외부 AI Agent 또는 MCP 클라이언트가 사용할 tool boundary로 유지하고, Next.js 서버 내부 AI 판결 API는 MCP 서버를 다시 호출하지 않습니다. 대신 `src/lib/ai/judgement-context.ts`의 동일한 service layer를 공유합니다.

발표용 처리 흐름:

1. 사용자가 간식 사건을 접수합니다.
2. AI Agent는 MCP tool을 쓰거나, 앱 내부 API는 같은 service layer를 통해 포스트 증거를 조회합니다.
3. 내부 게시판 판례를 먼저 검색합니다.
4. 내부 판례가 부족하면 외부 RAG 문서를 보조 근거로 참고합니다.
5. 식단, 투표, 하이라이트 댓글 맥락을 함께 반영합니다.
6. OpenAI가 판결문을 생성합니다.
7. 결과와 사용 근거가 DB `AiJudgement.rawJson`에 저장됩니다.

저장되는 근거 메타데이터에는 `usedPrecedents`, `usedExternalRag`, `usedMealContext`, `usedVoteSummary`, `contextVersion`이 포함됩니다. UI의 AI 판결 영역에서는 참고한 유사 판례 수, 외부 RAG 사용 여부, 식단 맥락 사용 여부, AI가 참고한 근거 요약을 접기/펼치기로 확인할 수 있습니다.
