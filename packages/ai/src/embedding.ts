export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";

type EmbeddingEnv = {
  [key: string]: string | undefined;
  OPENAI_API_KEY?: string;
  OPENAI_EMBEDDING_MODEL?: string;
  OPENAI_EMBEDDING_DIMENSIONS?: string;
};

export type EmbeddingConfig = {
  apiKey: string;
  model: string;
  dimensions: number;
};

export type CreateTextEmbeddingOptions = EmbeddingConfig & {
  endpoint?: string;
  fetcher?: typeof fetch;
};

export function getEmbeddingConfig(env: EmbeddingEnv = process.env): EmbeddingConfig | null {
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const parsedDimensions = Number(env.OPENAI_EMBEDDING_DIMENSIONS);
  const dimensions =
    Number.isInteger(parsedDimensions) && parsedDimensions > 0
      ? parsedDimensions
      : DEFAULT_EMBEDDING_DIMENSIONS;

  return {
    apiKey,
    model: env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    dimensions
  };
}

export async function createTextEmbedding(
  input: string,
  options: CreateTextEmbeddingOptions
): Promise<number[]> {
  const text = input.trim();

  if (!text) {
    throw new Error("embedding input is required");
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(options.endpoint ?? OPENAI_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      input: text,
      encoding_format: "float",
      dimensions: options.dimensions
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`embedding request failed: ${response.status}${body ? ` ${body}` : ""}`);
  }

  return parseEmbeddingResponse(await response.json());
}

export function formatPgVectorLiteral(vector: number[]): string {
  if (vector.length === 0) {
    throw new Error("embedding vector is required");
  }

  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("embedding vector must contain finite numbers");
  }

  return `[${vector.map((value) => String(value)).join(",")}]`;
}

function parseEmbeddingResponse(body: unknown): number[] {
  if (!isEmbeddingResponse(body)) {
    throw new Error("embedding response is invalid");
  }

  return body.data[0].embedding;
}

function isEmbeddingResponse(body: unknown): body is { data: Array<{ embedding: number[] }> } {
  if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) {
    return false;
  }

  const first = body.data[0] as unknown;

  if (!first || typeof first !== "object" || !("embedding" in first) || !Array.isArray(first.embedding)) {
    return false;
  }

  return first.embedding.length > 0 && first.embedding.every((value) => typeof value === "number");
}
