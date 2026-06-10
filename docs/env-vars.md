# LocalMind Board 환경변수 목록

실제 비밀값은 `.env`에만 넣고, `.env.example`에는 빈 값 또는 예시값만 둡니다. `.env`는 `.gitignore`에 포함되어 있으므로 커밋하지 않습니다.

## 필수

| 변수 | 예시 | 설명 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 실행 환경 |
| `DATABASE_URL` | `postgresql://localmind:localmind@localhost:5432/localmind_board` | Prisma가 접속할 PostgreSQL 주소 |
| `JWT_SECRET` | `localmind-local-dev-secret-change-before-prod` | JWT Access Token 서명 키 |
| `JWT_EXPIRES_IN` | `1h` | Access Token 만료 시간 |
| `API_PORT` | `3000` | NestJS API 서버 포트 |
| `WEB_PORT` | `5173` | React Vite 서버 포트 |
| `MCP_SERVER_PORT` | `3010` | MCP 서버 포트 |
| `MCP_SERVER_URL` | `http://localhost:3010/rpc` | API 서버가 호출할 MCP JSON-RPC 주소 |
| `CORS_ORIGIN` | `http://localhost:5173` | API CORS 허용 origin |
| `DEFAULT_REGION_CODE` | `OSAN` | MVP 기본 지역 코드 |
| `DEFAULT_REGION_NAME` | `오산` | MVP 기본 지역 이름 |

## AI 기능용

| 변수 | 예시 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | `sk-...` | OpenAI 또는 호환 LLM API Key. 실제 값은 `.env`에만 입력 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 호환 API base URL |
| `LLM_MODEL` | `gpt-4.1-mini` | Agent/RAG 답변 생성용 chat 모델 |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | RAG embedding 모델 |
| `EMBEDDING_DIM` | `1536` | pgvector 차원. 모델 변경 시 migration도 같이 확인 |

## MCP 외부 API용

MVP는 mock fallback이 있어 비워둬도 실행됩니다. 실제 외부 API를 붙일 때만 값을 넣습니다.

| 변수 | 예시 | 설명 |
| --- | --- | --- |
| `WEATHER_API_KEY` | `...` | 날씨 API Key |
| `PUBLIC_DATA_API_KEY` | `...` | 공공데이터포털 지역행사 API Key |
| `MAP_API_KEY` | `...` | 카카오 로컬 API REST API Key |

현재 MCP 실제 연동 기준:

- `WEATHER_API_KEY`: 공공데이터포털 `기상청_단기예보 조회서비스`의 인증키를 사용합니다.
- `MAP_API_KEY`: Kakao Developers 앱의 REST API 키를 사용합니다. 앱 설정에서 로컬/지도 계열 API 권한이 비활성화되어 있으면 `OPEN_MAP_AND_LOCAL service` 403 오류가 납니다.
- `PUBLIC_DATA_API_KEY`: 한국관광공사 TourAPI `KorService2/searchFestival2` 지역행사 조회에 사용합니다. 공공데이터포털에서 해당 API를 별도로 활용신청하지 않은 키면 403이 날 수 있습니다.

## 로컬 실행 순서

```bash
npm install
docker compose -f infra/docker-compose.yml up -d
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

RAG 데모를 하려면 `.env`의 `OPENAI_API_KEY`를 채운 뒤 `npm run prisma:seed`를 다시 실행합니다.
