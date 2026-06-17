import { createServer } from "node:http";
import { prisma } from "@junglebob/db";
import {
  JsonRpcError,
  createErrorResponse,
  createSuccessResponse,
  parseJsonRpcRequest,
  type JsonRpcId
} from "./json-rpc.ts";
import { handleRpcMethod } from "./rpc-methods.ts";
import type { McpToolLogStore } from "./tools.ts";

const logStore: McpToolLogStore = {
  async create(input) {
    return prisma.mcpCallLog.create({
      data: {
        toolName: input.toolName,
        input: jsonValue(input.input)
      },
      select: {
        id: true
      }
    });
  },
  async update(id, data) {
    await prisma.mcpCallLog.update({
      where: { id },
      data: {
        status: data.status,
        output: data.output === undefined ? undefined : jsonValue(data.output),
        error: data.error
      }
    });
  }
};

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/rpc") {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: "not found" }));
    return;
  }

  let id: JsonRpcId | undefined;

  try {
    const body = await readBody(request);
    const payload = JSON.parse(body) as unknown;
    const rpcRequest = parseJsonRpcRequest(payload);
    id = rpcRequest.id;

    const result = await handleRpcMethod(rpcRequest.method, rpcRequest.params, { logStore });
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(createSuccessResponse(id, result)));
  } catch (error) {
    const rpcError =
      error instanceof JsonRpcError
        ? error
        : error instanceof SyntaxError
          ? new JsonRpcError(-32700, "Parse error")
          : new JsonRpcError(-32603, "Internal error");

    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(createErrorResponse(id, rpcError.code, rpcError.message)));
  }
});

const port = Number(process.env.MCP_SERVER_PORT ?? 4001);

server.listen(port, () => {
  console.log(`정글밥 MCP server listening on http://localhost:${port}/rpc`);
});

function readBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", reject);
  });
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}
