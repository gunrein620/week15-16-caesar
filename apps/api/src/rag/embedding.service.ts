import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { LlmService } from '../ai/llm.service.js';
import { assertEmbeddingDimension } from './vector-utils.js';

@Injectable()
export class EmbeddingService {
  constructor(@Inject(LlmService) private readonly llmService: LlmService) {}

  async createEmbedding(input: string) {
    if (!process.env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is required to create embeddings.');
    }
    const embedding = await this.llmService.createEmbedding(input);
    assertEmbeddingDimension(embedding);
    return embedding;
  }
}
