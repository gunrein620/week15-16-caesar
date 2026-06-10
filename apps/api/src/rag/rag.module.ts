import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EmbeddingService } from './embedding.service.js';
import { RagController } from './rag.controller.js';
import { RagIngestionService } from './rag-ingestion.service.js';
import { RagService } from './rag.service.js';
import { VectorSearchService } from './vector-search.service.js';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [RagController],
  providers: [EmbeddingService, VectorSearchService, RagIngestionService, RagService],
  exports: [EmbeddingService, VectorSearchService, RagIngestionService, RagService]
})
export class RagModule {}
