export function getEmbeddingDim() {
  const value = Number(process.env.EMBEDDING_DIM ?? 1536);
  return Number.isFinite(value) && value > 0 ? value : 1536;
}

export function assertEmbeddingDimension(embedding: number[]) {
  const expected = getEmbeddingDim();
  if (embedding.length !== expected) {
    throw new Error(`Embedding dimension mismatch: expected ${expected}, got ${embedding.length}`);
  }
}

export function formatVector(embedding: number[]) {
  if (!embedding.every((value) => Number.isFinite(value))) {
    throw new Error('Embedding vector contains a non-finite value');
  }
  return `[${embedding.join(',')}]`;
}
