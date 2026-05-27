import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ToolDefinition, ToolResult } from "../types.js";

export const writeDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "write",
    description:
      "Write a file to the local filesystem. Creates parent directories if needed. Overwrites existing files.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to write",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  },
};

export async function executeWrite(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = resolve(args.file_path as string);
  const content = args.content as string;

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf-8");
    return {
      tool_call_id: "",
      content: `Wrote ${content.length} bytes to ${filePath}`,
    };
  } catch (e: unknown) {
    return {
      tool_call_id: "",
      content: `Error writing file: ${(e as Error).message}`,
      is_error: true,
    };
  }
}
