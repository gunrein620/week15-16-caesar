import "dotenv/config";

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";

import {
  buildSnackJudgementContext,
  buildSnackJudgementContextFromInput,
  getCurrentRecommendedMealContext,
} from "../src/lib/ai/judgement-context";
import { prisma } from "../src/lib/prisma";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type ToolCallParams = {
  name?: string;
  arguments?: Record<string, unknown>;
};

type ToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
};

const serverInfo = {
  name: "jungle-snack-court-mcp",
  version: "0.2.0",
};

const tools = [
  {
    name: "search_snack_precedents",
    description:
      "Search similar local snack-court precedents through the same judgement context service used by the app AI judgement API.",
    inputSchema: {
      type: "object",
      properties: {
        snackName: {
          type: "string",
          description: "Snack or late-night food name.",
        },
        reason: {
          type: "string",
          description: "Reason or excuse for eating the snack.",
        },
        tags: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Optional tags from the post.",
        },
      },
      required: ["snackName", "reason"],
    },
  },
  {
    name: "search_external_snack_rag",
    description:
      "Search project-curated external RAG documents through the shared judgement context service.",
    inputSchema: {
      type: "object",
      properties: {
        snackName: {
          type: "string",
        },
        reason: {
          type: "string",
        },
        tags: {
          type: "array",
          items: {
            type: "string",
          },
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 8,
        },
      },
      required: ["snackName", "reason"],
    },
  },
  {
    name: "get_recent_meal_context",
    description:
      "Return the currently recommended Krafton Jungle meal context from the shared judgement context service.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_post_context",
    description:
      "Return compact post evidence from the shared judgement context service: post, author, tags, images, meals, votes, comments, and latest AI judgement.",
    inputSchema: {
      type: "object",
      properties: {
        postId: {
          type: "string",
        },
      },
      required: ["postId"],
    },
  },
  {
    name: "build_judgement_context",
    description:
      "Build the full evidence package used before AI judgement, including post evidence, meal context, votes, comments, local precedents, external RAG fallback, and context metadata.",
    inputSchema: {
      type: "object",
      properties: {
        postId: {
          type: "string",
        },
      },
      required: ["postId"],
    },
  },
];

const lineReader = createInterface({
  input: stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

let pendingRequests = Promise.resolve();
let shuttingDown = false;

lineReader.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  pendingRequests = pendingRequests.then(() => handleLine(line));
});
lineReader.on("close", async () => {
  await pendingRequests;
  await shutdown();
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function handleRequest(request: JsonRpcRequest) {
  if (!request.method) {
    sendError(request.id ?? null, -32600, "Invalid request");
    return;
  }

  if (request.method.startsWith("notifications/")) {
    return;
  }

  switch (request.method) {
    case "initialize":
      sendResult(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo,
      });
      return;
    case "ping":
      sendResult(request.id, {});
      return;
    case "tools/list":
      sendResult(request.id, {
        tools,
      });
      return;
    case "tools/call":
      sendResult(request.id, await callTool(readToolCallParams(request.params)));
      return;
    default:
      sendError(request.id ?? null, -32601, `Unknown method: ${request.method}`);
  }
}

async function handleLine(line: string) {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    sendError(null, -32700, "Parse error");
    return;
  }

  try {
    await handleRequest(request);
  } catch (error) {
    sendError(
      request.id ?? null,
      -32603,
      error instanceof Error ? error.message : "Internal error",
    );
  }
}

async function callTool(params: ToolCallParams): Promise<ToolResult> {
  const args = params.arguments ?? {};

  try {
    switch (params.name) {
      case "search_snack_precedents":
        return textResult(await searchSnackPrecedents(args));
      case "search_external_snack_rag":
        return textResult(await searchExternalSnackRag(args));
      case "get_recent_meal_context":
        return textResult(await getRecentMealContext());
      case "get_post_context":
        return textResult(await getPostContext(args));
      case "build_judgement_context":
        return textResult(await buildJudgementContext(args));
      default:
        return textResult(
          {
            error: `Unknown tool: ${params.name ?? "(missing name)"}`,
          },
          true,
        );
    }
  } catch (error) {
    return textResult(serializeToolError(error), true);
  }
}

async function searchSnackPrecedents(args: Record<string, unknown>) {
  const query = readSnackQuery(args);
  const context = await buildSnackJudgementContextFromInput(query, {
    includeExternalRag: false,
  });

  return {
    source: "shared-judgement-context",
    contextVersion: context.contextVersion,
    query,
    shouldUseExternalRag: context.ragPolicy.externalRagNeeded,
    precedents: context.similarPrecedents,
  };
}

async function searchExternalSnackRag(args: Record<string, unknown>) {
  const query = readSnackQuery(args);
  const limit = readOptionalInteger(args.limit, 4);
  const context = await buildSnackJudgementContextFromInput(query, {
    forceExternalRag: true,
    externalRagLimit: limit,
  });

  return {
    source: "shared-judgement-context",
    contextVersion: context.contextVersion,
    query,
    contexts: context.externalRagContexts,
  };
}

async function getRecentMealContext() {
  const meal = await getCurrentRecommendedMealContext();

  if (!meal) {
    return {
      meal: null,
      message: "No cached meal menu is available.",
    };
  }

  return {
    meal,
  };
}

async function getPostContext(args: Record<string, unknown>) {
  const postId = readString(args.postId, "postId");
  const context = await buildSnackJudgementContext(postId, {
    includeExternalRag: false,
  });

  if (!context) {
    return {
      post: null,
      message: `Post ${postId} was not found.`,
    };
  }

  return {
    source: "shared-judgement-context",
    contextVersion: context.contextVersion,
    post: context.post,
    mealContext: context.mealContext,
    voteSummary: context.voteSummary,
    highlightComments: context.highlightComments,
    latestAiJudgement: context.latestAiJudgement,
    currentRecommendedMeal: context.currentRecommendedMeal,
    ragPolicy: context.ragPolicy,
  };
}

async function buildJudgementContext(args: Record<string, unknown>) {
  const postId = readString(args.postId, "postId");
  const context = await buildSnackJudgementContext(postId);

  if (!context) {
    return {
      context: null,
      message: `Post ${postId} was not found.`,
    };
  }

  return {
    source: "shared-judgement-context",
    context,
  };
}

function readSnackQuery(args: Record<string, unknown>) {
  return {
    snackName: readString(args.snackName, "snackName"),
    reason: readString(args.reason, "reason"),
    tags: readStringArray(args.tags),
  };
}

function readToolCallParams(params: unknown): ToolCallParams {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("tools/call params must be an object.");
  }

  return params as ToolCallParams;
}

function readString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readOptionalInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(8, Math.trunc(value)));
}

function textResult(value: unknown, isError = false): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, jsonReplacer, 2),
      },
    ],
    isError,
  };
}

function serializeToolError(error: unknown) {
  const object = error && typeof error === "object" ? (error as Record<string, unknown>) : {};

  return {
    error: error instanceof Error ? error.message : "Tool execution failed.",
    code: typeof object.code === "string" ? object.code : null,
    meta: object.meta ?? null,
    hint:
      "Check DATABASE_URL and make sure PostgreSQL is running before using DB-backed MCP tools.",
  };
}

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

function sendResult(id: JsonRpcRequest["id"], result: unknown) {
  if (id === undefined) {
    return;
  }

  writeMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
}

function sendError(id: JsonRpcRequest["id"], code: number, message: string) {
  if (id === undefined) {
    return;
  }

  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  });
}

function writeMessage(message: unknown) {
  stdout.write(`${JSON.stringify(message)}\n`);
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await prisma.$disconnect();
  process.exit(0);
}
