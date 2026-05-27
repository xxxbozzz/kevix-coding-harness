import { execSync } from "node:child_process";
import type { ToolDefinition, ToolResult } from "../types.js";

export const bashDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "bash",
    description:
      "Execute a bash shell command. Returns stdout and stderr. Use for running tests, git operations, build commands, and file system operations.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in milliseconds (default: 120000)",
        },
      },
      required: ["command"],
    },
  },
};

function normalizeThrown(thrown: unknown): { message: string; stack?: string } {
  // 1. Native Error
  if (thrown instanceof Error) {
    return {
      message: thrown.message,
      stack: thrown.stack,
    };
  }

  // 2. String or number
  if (typeof thrown === "string" || typeof thrown === "number") {
    const synthetic = new Error();
    // Trim the top frame pointing into this helper; keep the rest
    const syntheticStack = synthetic.stack ?? "";
    const stackLines = syntheticStack.split("\n");
    // Remove the first line ("Error") and the frame for this normalizeThrown function
    const trimmed = stackLines.length > 2 ? stackLines.slice(2).join("\n") : syntheticStack;
    return {
      message: String(thrown),
      stack: trimmed || undefined,
    };
  }

  // 3. Non-Error object
  if (thrown !== null && typeof thrown === "object") {
    const obj = thrown as Record<string, unknown>;
    const message: string =
      typeof obj.message === "string"
        ? obj.message
        : JSON.stringify(thrown);
    const stack: string | undefined =
      typeof obj.stack === "string"
        ? obj.stack
        : (() => {
            const synthetic = new Error();
            const syntheticStack = synthetic.stack ?? "";
            const stackLines = syntheticStack.split("\n");
            const trimmed = stackLines.length > 2 ? stackLines.slice(2).join("\n") : syntheticStack;
            return trimmed || undefined;
          })();
    return { message, stack };
  }

  // 4. null, undefined, or other primitives
  const synthetic = new Error();
  const syntheticStack = synthetic.stack ?? "";
  const stackLines = syntheticStack.split("\n");
  const trimmed = stackLines.length > 2 ? stackLines.slice(2).join("\n") : syntheticStack;
  return {
    message: "Unknown error",
    stack: trimmed || undefined,
  };
}

export async function executeBash(args: Record<string, unknown>): Promise<ToolResult> {
  const command = args.command as string;
  const timeout = (args.timeout_ms as number) ?? 120_000;

  try {
    const stdout = execSync(command, {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    return {
      tool_call_id: "",
      content: stdout.slice(0, 50_000), // truncate for safety
    };
  } catch (e: unknown) {
    const thrown = e;
    const err = thrown as { stdout?: string; stderr?: string; message?: string };
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
    const normalized = normalizeThrown(thrown);
    return {
      tool_call_id: "",
      content: output.slice(0, 50_000),
      is_error: true,
      error: normalized,
    };
  }
}
