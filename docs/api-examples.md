# LocalMind Board API Examples

서버 실행 후 사용할 수 있는 최소 curl 예시입니다. `jq`가 있으면 토큰과 ID 추출이 편합니다.

## 1. 회원가입

```bash
curl -sS -X POST http://localhost:3000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "new-osan-user@example.com",
    "password": "password123",
    "nickname": "새오산주민"
  }'
```

## 2. 로그인

```bash
TOKEN=$(curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "demo@localmind.dev",
    "password": "password123"
  }' | jq -r '.accessToken')
```

## 3. 카테고리/지역 ID 조회

```bash
curl -sS http://localhost:3000/api/categories | jq
curl -sS http://localhost:3000/api/regions/default | jq
```

예시 변수:

```bash
CATEGORY_ID=$(curl -sS http://localhost:3000/api/categories | jq -r '.[] | select(.slug=="medical") | .id')
REGION_ID=$(curl -sS http://localhost:3000/api/regions/default | jq -r '.id')
```

## 4. 게시글 작성

```bash
POST_ID=$(curl -sS -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"title\": \"오산역 근처 야간 약국 정보 공유합니다\",
    \"content\": \"어제 밤에 아이가 열이 나서 급하게 찾았던 약국 정보를 공유합니다.\",
    \"categoryId\": \"$CATEGORY_ID\",
    \"regionId\": \"$REGION_ID\",
    \"tagNames\": [\"야간약국\", \"생활정보\", \"오산역\"]
  }" | jq -r '.id')
```

## 5. 댓글 작성

```bash
curl -sS -X POST "http://localhost:3000/api/posts/$POST_ID/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "content": "좋은 정보 감사합니다. 운영 시간도 같이 확인해볼게요."
  }' | jq
```

## 6. 좋아요

```bash
curl -sS -X POST "http://localhost:3000/api/posts/$POST_ID/like" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 7. RAG 질문

`OPENAI_API_KEY`가 설정되어 있어야 실제 embedding과 답변 생성이 동작합니다.

```bash
curl -sS -X POST http://localhost:3000/api/rag/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"question\": \"근처 야간 약국 어디 있어?\",
    \"regionId\": \"$REGION_ID\",
    \"topK\": 5
  }" | jq
```

## 8. RAG 중복 게시글 확인

```bash
curl -sS -X POST http://localhost:3000/api/rag/duplicate-check \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{
    \"title\": \"오산역 야간 약국 알려주세요\",
    \"content\": \"밤에 문 여는 약국 정보를 찾고 있습니다.\",
    \"regionId\": \"$REGION_ID\",
    \"topK\": 5
  }" | jq
```

## 9. MCP RPC 날씨 Tool

```bash
curl -sS -X POST http://localhost:3010/rpc \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": "weather-1",
    "method": "tools/call",
    "params": {
      "name": "get_weather_by_region",
      "arguments": {
        "region": "오산",
        "date": "2026-06-13"
      }
    }
  }' | jq
```

## 10. Agent 민원 글 작성 도우미

```bash
curl -sS -X POST http://localhost:3000/api/agent/complaint-helper \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "input": "오산역 뒤쪽 골목에 불법 주차가 계속돼서 아침마다 차가 못 지나가. 민원 글로 정리해줘."
  }' | jq
```

## 11. Agent 태그 추천

```bash
curl -sS -X POST http://localhost:3000/api/agent/tag-suggestion \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "input": "세교동에서 이번 주말 플리마켓을 열고 싶은데 날씨와 행사 분위기를 고려해서 태그를 추천해줘."
  }' | jq
```
