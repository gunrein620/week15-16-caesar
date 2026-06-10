# Jungle Market

정글마켓은 동네 중고거래 서비스 프로토타입입니다. Next.js App Router 하나로 화면, API 라우트, 인증 골격, Prisma 기반 PostgreSQL 스키마를 함께 관리합니다.

## 스택

- Next.js 15 + React 19 + TypeScript
- Prisma ORM + PostgreSQL
- Auth.js v5, OAuth 키가 없을 때는 개발용 게스트 로그인 사용
- 전역 CSS 디자인 시스템: `src/styles/tokens.css`, `src/styles/components.css`

## 로컬 실행

이 프로젝트는 컨테이너 없이 로컬 PostgreSQL을 직접 사용합니다.

1. PostgreSQL을 실행하고 개발용 계정과 데이터베이스를 만듭니다.

```bash
psql postgres
```

```sql
CREATE USER jungle WITH PASSWORD 'jungle';
CREATE DATABASE jungle_market OWNER jungle;
\q
```

이미 같은 role/database가 있다면 그대로 써도 됩니다. 다른 계정으로 접속하려면 다음 단계에서 `DATABASE_URL`만 바꾸면 됩니다.

2. 환경 변수를 준비합니다.

```bash
cp .env.example .env
```

`.env`의 `DATABASE_URL`은 로컬 PostgreSQL 계정에 맞게 수정하세요. 기본 예시는 위에서 만든 개발용 계정을 사용합니다.

```bash
DATABASE_URL="postgresql://jungle:jungle@localhost:5432/jungle_market"
```

Google OAuth를 사용할 때는 Google Cloud Console에서 Web application OAuth Client를 만들고 아래 값을 `.env`에 넣습니다.

```bash
AUTH_URL="http://localhost:3000"
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
```

Google Cloud의 Authorized redirect URI에는 로컬 개발용으로 아래 주소를 등록해야 합니다.

```text
http://localhost:3000/api/auth/callback/google
```

3. 스키마와 시드 데이터를 넣습니다.

```bash
npm run db:migrate
npm run db:seed
```

4. 개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 홈, 상품 상세, 등록, 게시판, 채팅, 로그인/회원가입 화면을 확인할 수 있습니다.

## 주요 스크립트

- `npm run dev`: 개발 서버 실행
- `npm run build`: 프로덕션 빌드
- `npm run typecheck`: TypeScript 타입체크
- `npm run lint`: 현재는 TypeScript 타입체크와 동일한 비대화형 정적 검증
- `npm run verify:auth`: OAuth 후처리 라우트, 로그인 callback URL, 환경 예시 검증
- `npm run db:generate`: Prisma Client 생성
- `npm run db:migrate`: 로컬 DB 마이그레이션 적용
- `npm run db:seed`: 데모 데이터 시드
- `npm run db:reset`: 로컬 DB 초기화 후 마이그레이션/시드 재실행
- `npm run db:studio`: Prisma Studio 실행

## 라즈베리파이 배포

서버는 `ssh rpi`로 접속하는 것을 기준으로 합니다. 서버에서 사용하는 실제 접속 origin이 `http://<server>:3000`이라면 서버 `.env`의 `AUTH_URL`과 Google Cloud redirect URI도 같은 origin을 써야 합니다.

```bash
ssh rpi
cd ~/WS/jungle-12/week15-16-caesar
git pull
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart jungle-market || pm2 start npm --name jungle-market -- start
pm2 save
```

서버용 Google redirect URI 예시는 아래 형태입니다.

```text
http://<server>:3000/api/auth/callback/google
```

배포 후 서버 내부에서 최소한 아래 엔드포인트를 확인합니다.

```bash
curl -I http://localhost:3000
curl -I http://localhost:3000/login
curl -I http://localhost:3000/api/auth/providers
```

## 구현 범위

- 홈: 마켓 보드 + 라이브 피드
- 상품: 목록 조회, 상세, 등록, 관심 토글, 거래 상태 변경 API
- 게시판: 글 목록, 검색, 태그 필터, 페이징, 글쓰기, 상세, 댓글
- 채팅: 방 목록, 메시지 조회/전송, 거래 약속 카드
- 인증: Auth.js OAuth 골격 + 개발용 게스트 로그인

AI 기능, 이미지 업로드, 실시간 채팅, 지도 연동, 라즈베리파이 배포 자동화는 후속 작업 범위입니다.
