# 프로젝트 요구사항

## 개요

이 문서는 `week15-16-caesar` 프로젝트의 기술 요구사항, 사용자 기능, AI 기능, 배포 환경을 정리한 기준 문서이다.

## 기술 요구사항

### 프론트엔드

- React 사용

### 백엔드

아래 항목 중 하나 이상을 선택해 사용한다.

- Next.js
- NestJS
- FastAPI
- Spring Boot

### 데이터베이스

아래 항목 중 하나 이상을 선택해 사용한다.

- PostgreSQL
- MariaDB
- MySQL

### LLM 모델

- 상용 모델 중 자유 선택

## RAG 요구사항

RAG(Retrieval-Augmented Generation)는 개인 또는 사내 데이터와 LLM을 연결하는 가교 역할을 한다.

고려 사항:

- 데이터 소스 연동
- LLM에 맞는 Embedding 모델 연동
- Vector DB 선택
  - Pinecone
  - FAISS
  - ChromaDB
  - PostgreSQL용 pgvector
- 프레임워크 선택
  - LangChain
  - LlamaIndex
  - Haystack

## MCP 요구사항

MCP(Model Context Protocol)는 LLM이 외부 시스템을 호출할 수 있도록 한다.

고려 사항:

- MCP Server 구현
- JSON-RPC 기반 요청/응답 처리
- 최소 1개 이상의 실제 외부 서비스 연동
- API Key 및 권한 관리 전략 포함

## AI Agent 요구사항

에이전트는 스스로 도구를 선택하고 실행하는 추론 루프를 관리해야 한다.

고려 사항:

- Function Calling 사용
- 상태 관리
  - Memory
  - State
- LangGraph 또는 유사 구조 사용
- 무한 루프 방지 설계
- 예외 처리 설계

## 사용자 기능 요구사항

### 기본 게시판 기능

필수 구현 항목:

- 회원가입
- 로그인
- 게시물 CRUD
- 댓글
- 태그
- 페이징
- 검색

### AI 활용 기능

필수 구현 항목:

- RAG를 이용한 기능
- MCP를 이용한 기능
- AI Agent를 이용한 기능

## 배포 요구사항

- 라즈베리파이에 배포한다.
- 서버 접속은 아래 명령을 기준으로 한다.

```bash
ssh rpi
```

## 구현 시 메모

- 요구사항 충족 여부를 검증할 수 있도록 기능별 체크리스트를 유지한다.
- API Key, DB 비밀번호, LLM 토큰 등 민감 정보는 저장소에 커밋하지 않는다.
- 라즈베리파이 배포를 고려해 런타임, 메모리 사용량, 프로세스 관리 방식을 함께 설계한다.
