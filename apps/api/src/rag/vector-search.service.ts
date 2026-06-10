import { Inject, Injectable } from '@nestjs/common';
import type { EmbeddingSourceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertEmbeddingDimension, formatVector } from './vector-utils.js';

export type VectorSearchInput = {
  embedding: number[];
  regionId?: string | null;
  limit?: number;
  sourceTypes?: EmbeddingSourceType[];
};

export type VectorSearchResult = {
  id: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
  regionId: string | null;
  similarity: number;
};

@Injectable()
export class VectorSearchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    assertEmbeddingDimension(input.embedding);
    const vector = formatVector(input.embedding);
    const limit = Math.min(Math.max(Number(input.limit ?? 5), 1), 20);
    const sourceType = input.sourceTypes?.length === 1 ? input.sourceTypes[0] : null;

    const rows = await this.prisma.$queryRawUnsafe<VectorSearchResult[]>(
      `
      SELECT
        id,
        "sourceType",
        "sourceId",
        content,
        "regionId",
        1 - (embedding <=> $1::vector) AS similarity
      FROM "embeddings"
      WHERE ($2::text IS NULL OR "regionId" = $2)
        AND ($4::text IS NULL OR "sourceType"::text = $4::text)
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      vector,
      input.regionId ?? null,
      limit,
      sourceType
    );

    return rows.map((row) => ({
      ...row,
      similarity: Number(row.similarity)
    }));
  }
}
