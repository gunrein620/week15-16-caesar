import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  createTextEmbedding,
  formatPgVectorLiteral,
  getEmbeddingConfig
} from "./embedding.ts";

test("getEmbeddingConfig reads OpenAI embedding settings from environment", () => {
  const config = getEmbeddingConfig({
    OPENAI_API_KEY: "test-key",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    OPENAI_EMBEDDING_DIMENSIONS: "1536"
  });

  assert.deepEqual(config, {
    apiKey: "test-key",
    model: "text-embedding-3-small",
    dimensions: 1536
  });
});

test("getEmbeddingConfig returns null without an API key and keeps stable defaults", () => {
  assert.equal(getEmbeddingConfig({ OPENAI_API_KEY: "" }), null);

  const config = getEmbeddingConfig({ OPENAI_API_KEY: "test-key" });

  assert.deepEqual(config, {
    apiKey: "test-key",
    model: DEFAULT_EMBEDDING_MODEL,
    dimensions: DEFAULT_EMBEDDING_DIMENSIONS
  });
});

test("createTextEmbedding sends a float embedding request and returns the first vector", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });

    return new Response(
      JSON.stringify({
        data: [{ embedding: [0.1, -0.2, 0.3] }]
      }),
      { status: 200 }
    );
  };

  const embedding = await createTextEmbedding("제육볶음 후기", {
    apiKey: "test-key",
    model: "text-embedding-3-small",
    dimensions: 3,
    fetcher
  });

  assert.deepEqual(embedding, [0.1, -0.2, 0.3]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.openai.com/v1/embeddings");
  assert.equal(calls[0]?.init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    model: "text-embedding-3-small",
    input: "제육볶음 후기",
    encoding_format: "float",
    dimensions: 3
  });
  assert.equal((calls[0]?.init.headers as Record<string, string>).Authorization, "Bearer test-key");
});

test("createTextEmbedding rejects empty input and malformed responses", async () => {
  await assert.rejects(
    () =>
      createTextEmbedding("   ", {
        apiKey: "test-key",
        model: "text-embedding-3-small",
        dimensions: 1536
      }),
    /embedding input is required/
  );

  await assert.rejects(
    () =>
      createTextEmbedding("rice", {
        apiKey: "test-key",
        model: "text-embedding-3-small",
        dimensions: 1536,
        fetcher: async () => new Response(JSON.stringify({ data: [{ embedding: ["bad"] }] }), { status: 200 })
      }),
    /embedding response is invalid/
  );
});

test("formatPgVectorLiteral formats finite vectors for pgvector casts", () => {
  assert.equal(formatPgVectorLiteral([0.1, -0.2, 3]), "[0.1,-0.2,3]");
  assert.throws(() => formatPgVectorLiteral([]), /embedding vector is required/);
  assert.throws(() => formatPgVectorLiteral([Number.NaN]), /embedding vector must contain finite numbers/);
});
