import assert from "node:assert/strict";
import test from "node:test";
import {
  createErrorResponse,
  createSuccessResponse,
  parseJsonRpcRequest
} from "./json-rpc.ts";

test("parseJsonRpcRequest accepts a valid JSON-RPC 2.0 request", () => {
  const request = parseJsonRpcRequest({
    jsonrpc: "2.0",
    id: "abc",
    method: "ping",
    params: { ok: true }
  });

  assert.deepEqual(request, {
    jsonrpc: "2.0",
    id: "abc",
    method: "ping",
    params: { ok: true }
  });
});

test("parseJsonRpcRequest rejects a request without a method", () => {
  assert.throws(
    () => parseJsonRpcRequest({ jsonrpc: "2.0", id: 1 }),
    /method must be a string/
  );
});

test("createSuccessResponse returns a JSON-RPC 2.0 success payload", () => {
  const response = createSuccessResponse(1, { pong: true });

  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 1,
    result: { pong: true }
  });
});

test("createErrorResponse returns a JSON-RPC 2.0 error payload", () => {
  const response = createErrorResponse("abc", -32601, "Method not found");

  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: "abc",
    error: {
      code: -32601,
      message: "Method not found"
    }
  });
});

test("createErrorResponse normalizes missing ids to null", () => {
  const response = createErrorResponse(undefined, -32700, "Parse error");

  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32700,
      message: "Parse error"
    }
  });
});
