import { createTextEmbedding, getEmbeddingConfig } from "@junglebob/ai";
import type { Prisma } from "@junglebob/db";
import type { RagSearchResult } from "./semantic-search";

type ChunkWithContent = {
  id: string;
  content: string;
};

// reviewChunk 델리게이트만 있으면 되므로 PrismaClient/트랜잭션 클라이언트 둘 다 받는다.
type RagDbClient = Pick<Prisma.TransactionClient, "reviewChunk">;

// 청크 내용을 임베딩해 Float[] 컬럼에 저장한다. 임베딩 설정이 없으면 건너뛴다(false).
export async function attachOptionalEmbeddingToChunk(
  client: RagDbClient,
  chunk: ChunkWithContent
): Promise<boolean> {
  const embedding = await createOptionalEmbedding(chunk.content);

  if (!embedding) {
    return false;
  }

  try {
    await client.reviewChunk.update({
      where: { id: chunk.id },
      data: { embedding }
    });
    return true;
  } catch {
    return false;
  }
}

// 질문을 임베딩해, 임베딩이 있는 청크들과 코사인 유사도를 계산하고 상위 limit개를 반환한다.
// 임베딩 설정이 없거나 임베딩된 청크가 없으면 null을 반환해 텍스트 검색으로 폴백한다.
export async function findSemanticRagResults(
  client: RagDbClient,
  query: string,
  limit: number
): Promise<RagSearchResult[] | null> {
  const queryEmbedding = await createOptionalEmbedding(query);

  if (!queryEmbedding) {
    return null;
  }

  try {
    const chunks = await client.reviewChunk.findMany({
      where: { NOT: { embedding: { isEmpty: true } } },
      select: {
        id: true,
        content: true,
        metadata: true,
        createdAt: true,
        embedding: true,
        review: {
          select: {
            id: true,
            title: true,
            rating: true,
            menuNames: true,
            author: { select: { name: true } }
          }
        },
        comment: {
          select: {
            id: true,
            reviewId: true,
            author: { select: { name: true } },
            review: { select: { id: true, title: true } }
          }
        }
      }
    });

    const scored = chunks
      .map((chunk) => ({ chunk, similarity: cosineSimilarity(queryEmbedding, chunk.embedding) }))
      .filter((entry) => Number.isFinite(entry.similarity) && entry.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    if (scored.length === 0) {
      return null;
    }

    return scored.map(({ chunk, similarity }) => ({
      id: chunk.id,
      content: chunk.content,
      metadata: chunk.metadata,
      createdAt: chunk.createdAt,
      similarity,
      review: chunk.review
        ? {
            id: chunk.review.id,
            title: chunk.review.title,
            rating: chunk.review.rating,
            menuNames: chunk.review.menuNames,
            author: { name: chunk.review.author.name }
          }
        : null,
      comment: chunk.comment
        ? {
            id: chunk.comment.id,
            reviewId: chunk.comment.reviewId,
            author: { name: chunk.comment.author.name },
            review: { id: chunk.comment.review.id, title: chunk.comment.review.title }
          }
        : null
    }));
  } catch {
    // 임베딩 컬럼이 없거나 조회 실패 시 텍스트 검색으로 폴백
    return null;
  }
}

// 코사인 유사도 (-1 = 비교 불가)
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return -1;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return -1;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function createOptionalEmbedding(input: string): Promise<number[] | null> {
  const config = getEmbeddingConfig(process.env);

  if (!config) {
    return null;
  }

  try {
    return await createTextEmbedding(input, config);
  } catch {
    return null;
  }
}
