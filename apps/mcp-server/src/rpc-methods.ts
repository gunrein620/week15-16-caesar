import { JsonRpcError } from "./json-rpc.ts";
import { TOOL_DEFINITIONS, runLoggedMcpTool, runMcpTool, type ToolDependencies } from "./tools.ts";

export async function handleRpcMethod(
  method: string,
  params?: unknown,
  dependencies: ToolDependencies = {}
): Promise<unknown> {
  if (method === "ping") {
    return { pong: true };
  }

  if (method === "tools/list") {
    return { tools: TOOL_DEFINITIONS };
  }

  if (method.startsWith("tools/")) {
    const toolName = method.slice("tools/".length);

    if (!toolName) {
      throw new JsonRpcError(-32602, "tool name is required");
    }

    try {
      if (toolName === "import_slack_menu_history") {
        return await runMcpTool(toolName, params, dependencies);
      }

      return await runLoggedMcpTool(toolName, params, dependencies);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed";
      throw new JsonRpcError(-32603, message);
    }
  }

  throw new JsonRpcError(-32601, "Method not found");
}
