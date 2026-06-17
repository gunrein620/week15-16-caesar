# Day 1 Study Guide: Deployment-Centered Project Overview

기준일: 2026-06-11

이 문서는 1일차에 꼭 알아야 할 내용만 빠르게 읽기 위해 만든 요약본이다.

중요한 기준은 **로컬 개발 환경이 아니라 실제 배포 환경**이다.  
로컬의 Docker, Vite dev server, uvicorn은 배포 구조를 이해하기 위한 보조 수단으로만 본다.

오늘 목표는 코드를 깊게 읽는 것이 아니라, 실제 서비스가 어떤 구조로 배포되어 있고 요청이 어떻게 흐르는지 설명할 수 있게 되는 것이다.

## 1. 이 프로젝트는 무엇인가?

이 프로젝트는 리센느 중심의 아이돌 팬 커뮤니티 AI 게시판이다.

사용자는 다음 기능을 사용할 수 있다.

- 게시글 작성, 조회, 수정, 삭제
- 댓글 작성
- YouTube/Naver 기반 최신 소식 확인
- 저장한 글 요약
- RAG 기반 AI 질문 답변
- 관리자용 YouTube 동기화, RAG 임베딩 관리, AI 브리핑 발행

한 문장으로 정리하면 다음과 같다.

```text
Vercel에 배포된 React 프론트엔드, Railway에 배포된 FastAPI 백엔드, Railway PostgreSQL + pgvector DB를 이용해 팬 게시판, 외부 소식 수집, AI 검색/브리핑을 제공하는 서비스다.
```

## 2. 배포 기준 전체 구조

실제 서비스 기준으로는 세 덩어리로 보면 된다.

```text
Frontend
Vercel
React + TypeScript + Vite

Backend
Railway
FastAPI + SQLAlchemy + OpenAI/RAG

Database
Railway PostgreSQL + pgvector
사용자, 게시글, 영상, 임베딩 저장
```

배포 환경의 기본 요청 흐름은 다음과 같다.

```text
사용자 브라우저
-> Vercel React Frontend
-> Railway FastAPI Backend
-> Railway PostgreSQL + pgvector
```

외부 데이터와 AI 기능까지 포함하면 다음 흐름이다.

```text
YouTube / Naver
-> Railway FastAPI Backend가 외부 API 호출
-> Railway PostgreSQL에 영상/뉴스/블로그 데이터 저장
-> Vercel Frontend에서 최신 소식 피드로 표시
-> 저장된 데이터 일부는 RAG 검색에도 사용
```

```text
게시글 / 영상 / 외부 소식
-> 텍스트를 chunk로 나눔
-> OpenAI embedding 생성
-> pgvector에 저장
-> 질문과 비슷한 근거 검색
-> OpenAI chat 모델로 답변 생성
-> Frontend에 답변과 source card 반환
```

## 3. Vercel Frontend

프론트엔드는 Vercel에 배포된다.

역할:

- 사용자가 보는 화면 제공
- 게시판, 로그인, 관리자, AI 질문 UI 제공
- Railway 백엔드로 REST API 요청 전송
- API 응답을 화면 상태로 관리

주요 기술:

```text
React
화면을 컴포넌트 단위로 만드는 라이브러리

TypeScript
JavaScript에 타입을 붙여 실수를 줄이는 언어

Vite
프론트엔드 개발 서버와 빌드 도구

TanStack Query
API 요청, 로딩 상태, 캐시, 재요청을 관리하는 라이브러리

React Router
브라우저 안에서 페이지 이동을 처리하는 라이브러리
```

배포 관점에서 중요한 파일:

```text
frontend/package.json
Vercel이 실행할 build 명령과 프론트 의존성 확인

frontend/vite.config.ts
Vite 빌드 설정

frontend/vercel.json
Vercel SPA fallback 설정

frontend/src/api.ts
VITE_API_BASE_URL을 기준으로 Railway 백엔드 API 호출

frontend/src/App.tsx
실제 화면과 주요 사용자 흐름
```

Vercel 배포 핵심:

```text
Root directory: frontend
Build command: npm run build
Output directory: dist
환경변수: VITE_API_BASE_URL=<Railway backend URL>
```

## 4. Railway Backend

백엔드는 Railway에 배포된다.

역할:

- API 요청 처리
- 로그인/회원가입/OAuth 처리
- 게시글/댓글/저장 기능 처리
- YouTube/Naver 외부 API 호출
- RAG 검색과 AI 답변 생성
- 관리자 설정과 브리핑 발행 처리

주요 기술:

```text
FastAPI
Python REST API 서버 프레임워크

SQLAlchemy
Python 코드로 DB 테이블을 조회/저장/수정/삭제하는 ORM

Alembic
DB 테이블 구조 변경 이력을 관리하는 migration 도구

Pydantic
API 요청/응답 데이터의 타입과 검증 담당

slowapi
API 요청 횟수를 제한하는 rate limit 도구

uvicorn
FastAPI 앱을 실행하는 ASGI 서버
```

배포 관점에서 중요한 파일:

```text
backend/pyproject.toml
Railway 백엔드가 설치해야 할 Python 의존성

backend/railway.toml
Railway 백엔드 실행 설정

backend/app/main.py
FastAPI 앱 시작점, router 등록, health/ready API

backend/app/core/config.py
Railway 환경변수 읽기

backend/app/core/db.py
Railway PostgreSQL 연결과 ready check

backend/app/models.py
DB 테이블 구조

backend/app/schemas.py
API 요청/응답 구조
```

Railway 백엔드 배포 핵심:

```text
Railway에는 backend/ 디렉터리를 백엔드 서비스로 올린다.
백엔드는 DATABASE_URL, OPENAI_API_KEY, YOUTUBE_API_KEY, NAVER_CLIENT_ID 같은 환경변수로 외부 서비스와 DB에 연결한다.
```

## 5. Railway PostgreSQL + pgvector

DB는 Railway의 PostgreSQL + pgvector 구성을 사용한다.

역할:

- 사용자 저장
- 게시글, 댓글, 태그 저장
- YouTube 영상 저장
- Naver 뉴스/블로그 저장
- 저장한 글과 관리자 설정 저장
- RAG chunk와 embedding 저장
- AI 사용량과 analytics 저장

pgvector가 필요한 이유:

```text
일반 PostgreSQL은 텍스트, 숫자, 날짜 같은 데이터를 저장한다.
pgvector는 embedding 벡터를 저장하고, 질문과 비슷한 chunk를 유사도 기준으로 찾을 수 있게 해준다.
```

RAG 검색에서 DB 흐름:

```text
질문 embedding
-> DB에 저장된 chunk embedding과 비교
-> 가장 비슷한 게시글/영상/소식 chunk 조회
-> OpenAI 답변 생성에 근거로 사용
```

Railway DB 준비 상태는 백엔드의 `/ready` API에서 확인한다.

`/ready`가 확인하는 것:

- DB 연결 가능 여부
- Alembic migration 최신 여부
- pgvector extension 사용 가능 여부
- pgvector extension 설치 여부

## 6. FastAPI 시작점: main.py

`backend/app/main.py`는 Railway에서 실행되는 FastAPI 서버의 조립 설명서다.

여기서 하는 일:

- FastAPI 앱 생성
- CORS 설정
- rate limit 설정
- `/health` 상태 확인 API 등록
- `/ready` DB 준비 상태 확인 API 등록
- 기능별 router 등록
- scheduled sync 설치
- infra budget hard stop middleware 등록

핵심 router 등록:

```python
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(posts.router)
app.include_router(saved_items.router)
app.include_router(analytics.router)
app.include_router(ai.router)
app.include_router(artists.router)
app.include_router(agent.router)
```

각 router의 역할:

```text
auth
회원가입, 로그인, 로그아웃, refresh token, OAuth

posts
게시글, 댓글, 태그

artists
아티스트 정보, YouTube 영상, Naver 업데이트, 동기화

ai
RAG 질문 답변, 글쓰기 보조, 유사 글 검색

agent
AI 브리핑 preview/publish

admin
사용자 관리, 설정, RAG 임베딩 관리

analytics
사용 통계 수집과 관리자 통계 조회

saved_items
사용자가 저장한 글/소스 관리
```

## 7. 인증 흐름

배포 환경에서는 Vercel 프론트와 Railway 백엔드가 서로 다른 도메인에 있다.

그래서 인증에서는 CORS와 cookie 설정이 중요하다.

흐름:

```text
사용자가 Vercel 프론트에서 로그인
-> Railway FastAPI /auth/login 호출
-> 비밀번호 확인
-> access token 발급
-> refresh session을 HttpOnly cookie로 저장
-> 프론트는 access token으로 인증 API 호출
-> access token 만료 시 /auth/refresh로 재발급
```

중요 개념:

```text
JWT access token
짧은 시간 동안 로그인한 사용자인지 확인하는 토큰

refresh token
access token을 다시 발급받기 위한 장기 세션 토큰

HttpOnly cookie
JavaScript에서 직접 읽지 못하게 보호되는 쿠키

SameSite=None; Secure
Vercel과 Railway처럼 서로 다른 사이트 간 cookie를 쓰기 위한 production/preview 설정

OAuth
Google/Kakao/Naver 계정으로 로그인하는 방식
```

## 8. 외부 데이터 수집 흐름

이 프로젝트는 팬 게시판 자체 데이터만 쓰지 않고, 외부 소식도 가져온다.

외부 서비스:

```text
YouTube Data API
공식 채널, 멤버 채널, 팬 채널, 키워드 검색 영상 수집

Naver Search API
뉴스와 블로그 검색 결과 수집
```

배포 환경 흐름:

```text
관리자가 Vercel 프론트에서 동기화 요청
-> Railway FastAPI가 YouTube/Naver API 호출
-> Railway PostgreSQL에 결과 저장
-> Vercel 프론트에서 최신 소식 피드로 표시
-> RAG 검색과 AI 브리핑에서도 일부 사용
```

관련 백엔드 파일:

```text
backend/app/services/youtube.py
YouTube Data API 호출과 영상 저장

backend/app/services/naver.py
Naver Search API 호출

backend/app/services/external_updates.py
Naver 뉴스/블로그 결과를 external_updates로 저장

backend/app/services/scheduled_sync.py
주기적 동기화 실행
```

## 9. RAG 흐름

RAG는 Retrieval-Augmented Generation의 줄임말이다.

이 프로젝트에서는 AI가 아무 말이나 생성하지 않고, DB에 있는 게시글/영상/소식 근거를 먼저 찾은 뒤 답변하게 한다.

배포 환경 흐름:

```text
사용자가 Vercel 프론트에서 질문 입력
-> Railway FastAPI /qa 호출
-> 질문을 embedding으로 변환
-> Railway PostgreSQL + pgvector에서 비슷한 chunk 검색
-> 검색된 근거를 OpenAI chat 모델에 전달
-> 한국어 답변과 source card를 프론트로 반환
```

RAG 핵심 4단계:

```text
1. 게시글이나 영상 설명을 chunk로 나눈다.
2. OpenAI embedding으로 벡터를 만든다.
3. pgvector로 질문과 비슷한 chunk를 찾는다.
4. OpenAI chat 모델이 근거 기반 답변을 만든다.
```

중요 파일:

```text
backend/app/services/rag.py
RAG 검색, embedding, 답변 생성의 중심 파일

backend/app/services/rag_context.py
글쓰기 보조나 브리핑에 넣을 RAG context 생성

backend/app/api/ai.py
프론트에서 AI 기능을 호출하는 API router
```

## 10. Agent Briefing 흐름

Agent Briefing은 최신 소식과 과거 맥락을 모아서 브리핑 게시글을 만드는 기능이다.

배포 환경 흐름:

```text
관리자가 Vercel 프론트에서 브리핑 preview 요청
-> Railway FastAPI /ai/briefing/preview 호출
-> LangGraph 흐름 실행
-> YouTube/Naver 최신 소식 확인
-> RAG context 조회
-> 브리핑 markdown 생성
-> 관리자가 publish
-> 브리핑이 게시글로 저장
-> Vercel 프론트에서 일반 게시글처럼 표시
```

중요 파일:

```text
backend/app/api/agent.py
브리핑 preview/publish API

backend/app/services/mcp_client.py
YouTube/Naver 관련 도구 호출을 감싸고 로그를 남기는 계층
```

1일차에는 LangGraph와 MCP 내부 원리를 깊게 공부하지 않는다.

오늘은 다음 정도만 알면 된다.

```text
LangGraph
브리핑 생성 단계를 그래프처럼 연결하는 도구

MCP
외부 도구 호출을 일정한 방식으로 실행하고 기록하는 구조
```

## 11. 로컬 환경은 왜 있는가?

로컬 환경은 실제 배포 구조를 개발자 컴퓨터에서 흉내 내기 위한 것이다.

중요한 점:

```text
배포 환경에서는 Docker Compose로 DB를 띄우지 않는다.
Docker Compose는 로컬 개발에서 Railway PostgreSQL + pgvector를 흉내 내기 위한 보조 도구다.
```

로컬 구조:

```text
Frontend
npm run dev
Vite dev server

Backend
uv run uvicorn app.main:app --reload
FastAPI dev server

Database
docker compose up -d
PostgreSQL + pgvector container
```

배포 구조와 비교:

```text
로컬 Frontend: Vite dev server
배포 Frontend: Vercel

로컬 Backend: uvicorn 직접 실행
배포 Backend: Railway service

로컬 Database: Docker Compose PostgreSQL + pgvector
배포 Database: Railway PostgreSQL + pgvector
```

Docker의 역할:

```text
맥에 PostgreSQL과 pgvector를 직접 설치하지 않고,
배포 DB와 비슷한 PostgreSQL + pgvector 환경을 로컬에서 쉽게 만들기 위한 도구다.
```

## 12. 배포 환경변수

배포에서는 `.env` 파일을 직접 서버에 올리는 대신 Vercel/Railway 환경변수에 값을 넣는다.

Vercel 프론트에 필요한 대표 환경변수:

```text
VITE_API_BASE_URL
Railway 백엔드 URL
```

Railway 백엔드에 필요한 대표 환경변수:

```text
DATABASE_URL
Railway PostgreSQL 연결 주소

JWT_SECRET_KEY
JWT 서명용 secret

OPENAI_API_KEY
OpenAI embedding/chat 호출용 key

YOUTUBE_API_KEY
YouTube Data API 호출용 key

NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
Naver Search API 호출용 key

GOOGLE_CLIENT_ID / KAKAO_CLIENT_ID / NAVER_OAUTH_CLIENT_ID
소셜 로그인용 OAuth 설정
```

중요:

```text
실제 API key, JWT secret, OAuth secret은 코드에 커밋하면 안 된다.
```

## 13. 1일차 최종 암기 문장

아래 문장을 그대로 말할 수 있으면 1일차는 충분하다.

```text
이 프로젝트는 Vercel에 배포된 React 프론트엔드, Railway에 배포된 FastAPI 백엔드, Railway PostgreSQL + pgvector DB로 구성된 팬 커뮤니티 AI 게시판이다.
사용자는 Vercel 프론트에서 게시글, 최신 소식, AI 질문, 브리핑 기능을 사용하고, 프론트는 Railway 백엔드로 REST API 요청을 보낸다.
Railway 백엔드는 인증, 게시판, 외부 데이터 동기화, RAG, 브리핑 기능을 처리하고 SQLAlchemy로 Railway PostgreSQL에 데이터를 저장한다.
OpenAI는 embedding과 답변 생성을 담당하고, pgvector는 질문과 관련 있는 근거를 찾기 위한 벡터 검색에 사용된다.
로컬 Docker Compose는 배포용이 아니라 Railway PostgreSQL + pgvector를 개발 환경에서 흉내 내기 위한 보조 도구다.
```

## 14. 오늘 버릴 것

1일차에는 아래 내용을 깊게 보지 않는다.

- React 컴포넌트 세부 구현
- CSS 전체 구조
- SQLAlchemy relationship 세부 동작
- OAuth provider별 설정
- LangGraph 내부 원리
- MCP 공식 스펙
- pgvector 인덱스 튜닝
- 테스트 코드 전체
- 로컬 실행 명령 디버깅

## 15. 오늘 체크리스트

- [ ] 이 프로젝트가 어떤 서비스인지 한 문장으로 설명할 수 있다.
- [ ] 배포 구조가 Vercel, Railway Backend, Railway PostgreSQL + pgvector라는 것을 설명할 수 있다.
- [ ] 사용자의 요청이 Vercel Frontend -> Railway Backend -> Railway DB로 흐른다는 것을 말할 수 있다.
- [ ] React, FastAPI, PostgreSQL, pgvector, OpenAI가 각각 왜 쓰였는지 말할 수 있다.
- [ ] `main.py`가 Railway에서 실행되는 FastAPI 앱의 시작점이라는 것을 이해했다.
- [ ] router가 기능별 API 묶음이라는 것을 이해했다.
- [ ] RAG의 4단계: chunk, embedding, vector search, answer generation을 말할 수 있다.
- [ ] Docker Compose는 배포용이 아니라 로컬 개발용 DB라는 것을 설명할 수 있다.
