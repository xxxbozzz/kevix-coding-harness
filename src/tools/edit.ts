import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolDefinition, ToolResult } from "../types.js";

export const editDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "edit",
    description:
      "Perform exact string replacements in an existing file. Fails if old_string is not unique in the file. Use replace_all to replace all occurrences.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to modify",
        },
        old_string: {
          type: "string",
          description: "The text to replace (must be unique in file)",
        },
        new_string: {
          type: "string",
          description: "The text to replace it with",
        },
        replace_all: {
          type: "boolean",
          description: "Replace all occurrences (default: false)",
        },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
};

export async function executeEdit(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = resolve(args.file_path as string);
  const oldStr = args.old_string as string;
  const newStr = args.new_string as string;
  const replaceAll = (args.replace_all as boolean) ?? false;

  if (!existsSync(filePath)) {
    return { tool_call_id: "", content: `Error: file not found: ${filePath}`, is_error: true };
  }

  try {
    const content = readFileSync(filePath, "utf-8");

    if (replaceAll) {
      const count = content.split(oldStr).length - 1;
      if (count === 0) {
        return { tool_call_id: "", content: `Error: old_string not found in ${filePath}`, is_error: true };
      }
      const updated = content.replaceAll(oldStr, newStr);
      writeFileSync(filePath, updated, "utf-8");
      return { tool_call_id: "", content: `Replaced ${count} occurrences in ${filePath}` };
    }

    const firstIndex = content.indexOf(oldStr);
    if (firstIndex === -1) {
      return { tool_call_id: "", content: `Error: old_string not found in ${filePath}`, is_error: true };
    }
    if (content.indexOf(oldStr, firstIndex + 1) !== -1) {
      return {
        tool_call_id: "",
        content: `Error: old_string is not unique in ${filePath}. Use replace_all or provide more context.`,
        is_error: true,
      };
    }

    const updated = content.slice(0, firstIndex) + newStr + content.slice(firstIndex + oldStr.length);
    writeFileSync(filePath, updated, "utf-8");
    return { tool_call_id: "", content: `Replaced 1 occurrence in ${filePath}` };
  } catch (e: unknown) {
    return { tool_call_id: "", content: `Error editing file: ${(e as Error).message}`, is_error: true };
  }
}
