CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS embeddings_vector_idx
ON "embeddings"
USING ivfflat ("embedding" vector_cosine_ops)
WITH (lists = 100);
