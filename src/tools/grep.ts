// Grep tool — Node-native implementation (no shell dependency)

import { readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import type { ToolDefinition, ToolResult } from "../types.js";

export const grepDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "grep",
    description:
      "Search for a regex pattern in files. Returns matching lines with file paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The regex pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory or file to search in (default: current directory)",
        },
        include: {
          type: "string",
          description: "File extension filter, e.g. '.ts' or '.py'",
        },
      },
      required: ["pattern"],
    },
  },
};

const MAX_LINES = 500;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_FILES = 200;

export async function executeGrep(args: Record<string, unknown>): Promise<ToolResult> {
  const pattern = args.pattern as string;
  const searchPath = resolve(args.path as string ?? ".");
  const include = args.include as string | undefined;

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "g");
  } catch {
    return { tool_call_id: "", content: `Invalid regex: ${pattern}`, is_error: true };
  }

  const results: string[] = [];
  const stat = statSync(searchPath, { throwIfNoEntry: false });
  if (!stat) return { tool_call_id: "", content: `Path not found: ${searchPath}` };

  const files = stat.isDirectory()
    ? collectFiles(searchPath, include)
    : [searchPath];

  let totalLines = 0;

  for (let i = 0; i < Math.min(files.length, MAX_FILES); i++) {
    if (totalLines >= MAX_LINES) {
      results.push(`... (truncated, ${files.length - i} files remaining)`);
      break;
    }

    const file = files[i]!;
    try {
      const st = statSync(file);
      if (st.size > MAX_FILE_SIZE) continue;

      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const relPath = relative(process.cwd(), file);

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        if (totalLines >= MAX_LINES) break;
        const line = lines[lineNum];
        if (regex.test(line!)) {
          regex.lastIndex = 0; // reset for next test
          results.push(`${relPath}:${lineNum + 1}:${line}`);
          totalLines++;
        }
      }
    } catch {
      // skip files we can't read
    }
  }

  return {
    tool_call_id: "",
    content: results.length > 0 ? results.join("\n") : "No matches found.",
  };
}

function collectFiles(dir: string, include?: string): string[] {
  const results: string[] = [];

  function walk(current: string, depth: number) {
    if (depth > 20) return; // max depth
    try {
      const entries = readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_FILES) return;
        const full = join(current, entry.name);

        // Skip hidden dirs and node_modules
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "__pycache__") continue;
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          if (include && !entry.name.endsWith(include)) continue;
          results.push(full);
        }
      }
    } catch {
      // skip dirs we can't read
    }
  }

  walk(dir, 0);
  return results;
}
