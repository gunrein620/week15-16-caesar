import process from "node:process";
import { prisma } from "@junglebob/db";
import { buildRagFallbackQueries } from "./features/rag/chunk.ts";
import { findSemanticRagResults } from "./features/rag/embedding.ts";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // The script can still run with environment variables supplied by the shell.
}

const query = process.argv.slice(2).join(" ").trim() || "매운 한식 추천";
const limit = 5;

try {
  const semanticResults = await findSemanticRagResults(prisma, query, limit);

  console.log(`\n질문: "${query}"\n`);

  if (semanticResults) {
    console.log(`의미검색 결과 ${semanticResults.length}개\n`);
    printResults(semanticResults);
  } else {
    console.log("의미검색 결과가 없거나 임베딩 설정을 사용할 수 없습니다.");
    console.log("텍스트/키워드 폴백도 같이 확인합니다.\n");

    const fallbackResults = await findTextFallbackResults(query, limit);
    console.log(`폴백 검색 결과 ${fallbackResults.length}개\n`);
    printResults(fallbackResults);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

type RagCheckResult = {
  id: string;
  content: string;
  similarity?: number;
  review: {
    title: string;
  } | null;
  comment: {
    review: {
      title: string;
    };
  } | null;
};

async function findTextFallbackResults(query: string, limit: number): Promise<RagCheckResult[]> {
  const fallbackQueries = Array.from(new Set([query, ...buildRagFallbackQueries(query)]));

  if (fallbackQueries.length === 0) {
    return [];
  }

  return prisma.reviewChunk.findMany({
    where: {
      OR: fallbackQueries.map((value) => ({
        content: {
          contains: value,
          mode: "insensitive" as const
        }
      }))
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      content: true,
      review: {
        select: {
          title: true
        }
      },
      comment: {
        select: {
          review: {
            select: {
              title: true
            }
          }
        }
      }
    }
  });
}

function printResults(results: RagCheckResult[]) {
  if (results.length === 0) {
    console.log("검색된 근거가 없습니다.");
    return;
  }

  results.forEach((result, index) => {
    const title = result.review?.title ?? result.comment?.review.title ?? "(근거)";
    const score = typeof result.similarity === "number" ? `유사도 ${result.similarity.toFixed(3)} · ` : "";
    const preview = result.content.replace(/\s+/g, " ").slice(0, 120);

    console.log(`${index + 1}. ${score}${title}`);
    console.log(`   ${preview}${result.content.length > preview.length ? "..." : ""}\n`);
  });
}
