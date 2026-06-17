export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcSuccessResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcErrorResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
  };
};

export class JsonRpcError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = "JsonRpcError";
  }
}

export function parseJsonRpcRequest(value: unknown): JsonRpcRequest {
  if (!isRecord(value)) {
    throw new JsonRpcError(-32600, "request must be an object");
  }

  if (value.jsonrpc !== "2.0") {
    throw new JsonRpcError(-32600, "jsonrpc must be 2.0");
  }

  if (typeof value.method !== "string") {
    throw new JsonRpcError(-32600, "method must be a string");
  }

  const request: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: value.method
  };

  if ("id" in value) {
    if (!isJsonRpcId(value.id)) {
      throw new JsonRpcError(-32600, "id must be a string, number, or null");
    }
    request.id = value.id;
  }

  if ("params" in value) {
    request.params = value.params;
  }

  return request;
}

export function createSuccessResponse(
  id: JsonRpcId | undefined,
  result: unknown
): JsonRpcSuccessResponse {
  return {
    jsonrpc: "2.0",
    id: normalizeResponseId(id),
    result
  };
}

export function createErrorResponse(
  id: JsonRpcId | undefined,
  code: number,
  message: string
): JsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    id: normalizeResponseId(id),
    error: {
      code,
      message
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number" || value === null;
}

function normalizeResponseId(id: JsonRpcId | undefined): JsonRpcId {
  return id ?? null;
}
