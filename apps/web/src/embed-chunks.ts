import process from "node:process";
import { prisma } from "@junglebob/db";
import { attachOptionalEmbeddingToChunk } from "./features/rag/embedding.ts";

// 루트 .env 자동 로드 (OPENAI_API_KEY 등)
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // 이미 주입돼 있거나 .env가 없으면 무시
}

// 아직 임베딩이 없는 ReviewChunk를 모두 임베딩해 Float[] 컬럼에 채운다.
// 시드 후 한 번 실행하면 데모 후기/댓글이 의미검색(RAG) 대상이 된다.
try {
  const chunks = await prisma.reviewChunk.findMany({
    where: { embedding: { isEmpty: true } },
    select: { id: true, content: true }
  });

  console.log(`임베딩 대상 청크: ${chunks.length}개`);

  let embedded = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    const ok = await attachOptionalEmbeddingToChunk(prisma, chunk);
    if (ok) {
      embedded += 1;
    } else {
      skipped += 1;
    }
    if ((embedded + skipped) % 50 === 0) {
      console.log(`  진행 ${embedded + skipped}/${chunks.length}`);
    }
  }

  console.log(`완료: 임베딩 ${embedded}개, 건너뜀 ${skipped}개`);
  if (skipped > 0 && embedded === 0) {
    console.log("(전부 건너뜀 → OPENAI_API_KEY가 없거나 임베딩 호출 실패. .env 확인)");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
