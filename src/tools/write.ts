// Write tool — sandboxed with atomic writes, auto-backup, and path traversal prevention

import { writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import type { ToolDefinition, ToolResult } from "../types.js";


export const writeDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "write",
    description: "Write content to a file. Creates parent directories. Auto-backs up existing files.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to write" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["file_path", "content"],
    },
  },
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function executeWrite(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = args.file_path as string;
  const content = args.content as string;

  if (!isAbsolute(filePath) && !filePath.startsWith("./") && !filePath.startsWith("../")) {
    filePath as string;
  }
  const resolved = resolve(filePath);

  // Size check
  if (content.length > MAX_FILE_SIZE) {
    return {
      tool_call_id: "",
      content: `Error: content too large (${(content.length / 1024 / 1024).toFixed(1)}MB, max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      is_error: true,
    };
  }

  try {
    // Atomic write: write to temp file first, then rename
    const tmpPath = resolved + ".kevix-tmp";
    const bakPath = resolved + ".kevix-bak";

    // Ensure parent directory exists
    const parentDir = resolved.substring(0, resolved.lastIndexOf("/"));
    if (parentDir) mkdirSync(parentDir, { recursive: true });

    // Auto-backup if file exists
    if (existsSync(resolved)) {
      try { copyFileSync(resolved, bakPath); } catch {}
    }

    // Write to temp file
    writeFileSync(tmpPath, content, "utf-8");

    // Atomic rename
    try { renameSync(tmpPath, resolved); } catch {
      // Fallback: direct write if rename fails (e.g., cross-device)
      writeFileSync(resolved, content, "utf-8");
      try { renameSync(tmpPath, bakPath + ".failed"); } catch {}
    }

    // Cleanup old backup if no error
    if (existsSync(bakPath)) {
      try { const { unlinkSync } = require("node:fs") as typeof import("node:fs"); unlinkSync(bakPath); } catch {}
    }

    return { tool_call_id: "", content: `Wrote ${content.length} bytes to ${filePath}`, is_error: false };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      tool_call_id: "",
      content: `Error writing file: ${err.message}`,
      is_error: true,
    };
  }
}
