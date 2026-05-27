// Glob tool — Node-native implementation (no shell dependency)

import { readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import type { ToolDefinition, ToolResult } from "../types.js";

export const globDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "glob",
    description:
      "Find files matching a glob pattern. Returns sorted list of matching file paths.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern, e.g. 'src/**/*.ts' or '*.py'",
        },
        path: {
          type: "string",
          description: "Base directory to search in (default: current directory)",
        },
      },
      required: ["pattern"],
    },
  },
};

const MAX_RESULTS = 200;
const MAX_DEPTH = 20;

export async function executeGlob(args: Record<string, unknown>): Promise<ToolResult> {
  const pattern = args.pattern as string;
  const basePath = resolve(args.path as string ?? ".");
  const regex = globToRegex(pattern);

  const results: string[] = [];

  function walk(current: string, depth: number) {
    if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;
    try {
      const entries = readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) return;
        const full = join(current, entry.name);
        const rel = relative(basePath, full);

        if (entry.isDirectory()) {
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "__pycache__") continue;
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          if (regex.test(rel) || regex.test(entry.name)) {
            results.push(rel);
          }
        }
      }
    } catch {
      // skip dirs we can't read
    }
  }

  walk(basePath, 0);
  results.sort();

  return {
    tool_call_id: "",
    content: results.length > 0 ? results.join("\n") : "No files found.",
  };
}

/**
 * Convert a simple glob pattern to a regex.
 * Supports: ** (any depth), * (single segment), ? (single char)
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = "";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*" && pattern[i + 1] === "*") {
      // ** matches any depth including /
      regexStr += ".*";
      i += 2;
      // skip trailing /
      if (pattern[i] === "/") i++;
    } else if (ch === "*") {
      // * matches anything except /
      regexStr += "[^/]*";
      i++;
    } else if (ch === "?") {
      regexStr += "[^/]";
      i++;
    } else if (ch === ".") {
      regexStr += "\\.";
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }

  return new RegExp("^" + regexStr + "$");
}
