import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolDefinition, ToolResult } from "../types.js";

export const readDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "read",
    description:
      "Read the contents of a file. Returns the file content with line numbers. Use for understanding code before editing.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to read",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (1-based, default: 1)",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read (default: 500)",
        },
      },
      required: ["file_path"],
    },
  },
};

export async function executeRead(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = resolve(args.file_path as string);
  const offset = (args.offset as number) ?? 1;
  const limit = (args.limit as number) ?? 500;

  if (!existsSync(filePath)) {
    return { tool_call_id: "", content: `Error: file not found: ${filePath}`, is_error: true };
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const start = Math.max(0, offset - 1);
    const end = Math.min(lines.length, start + limit);
    const selected = lines.slice(start, end);

    const output = selected
      .map((line, i) => `${String(start + i + 1).padStart(6, " ")}\t${line}`)
      .join("\n");

    return {
      tool_call_id: "",
      content: output || "(empty file)",
    };
  } catch (e: unknown) {
    return {
      tool_call_id: "",
      content: `Error reading file: ${(e as Error).message}`,
      is_error: true,
    };
  }
}
