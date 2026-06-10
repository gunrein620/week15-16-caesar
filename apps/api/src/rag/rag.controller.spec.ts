import { describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RagController } from './rag.controller.js';

describe('RagController', () => {
  it('guards all RAG endpoints because they can trigger paid AI calls', () => {
    const guardMetadata = Reflect.getMetadata('__guards__', RagController);

    expect(guardMetadata).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });
});
