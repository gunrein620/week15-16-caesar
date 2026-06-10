import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingService } from './embedding.service.js';

describe('EmbeddingService', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalDim = process.env.EMBEDDING_DIM;

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    process.env.EMBEDDING_DIM = originalDim;
    vi.clearAllMocks();
  });

  it('creates an embedding and validates the configured dimension', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.EMBEDDING_DIM = '3';
    const llm = {
      createEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    };
    const service = new EmbeddingService(llm as never);

    const result = await service.createEmbedding('오산 야간 약국');

    expect(llm.createEmbedding).toHaveBeenCalledWith('오산 야간 약국');
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  it('throws when OPENAI_API_KEY is missing', async () => {
    process.env.OPENAI_API_KEY = '';
    const llm = {
      createEmbedding: vi.fn()
    };
    const service = new EmbeddingService(llm as never);

    await expect(service.createEmbedding('질문')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(llm.createEmbedding).not.toHaveBeenCalled();
  });

  it('throws when the provider returns a vector with the wrong dimension', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.EMBEDDING_DIM = '3';
    const llm = {
      createEmbedding: vi.fn().mockResolvedValue([0.1, 0.2])
    };
    const service = new EmbeddingService(llm as never);

    await expect(service.createEmbedding('질문')).rejects.toThrow('Embedding dimension mismatch');
  });
});
