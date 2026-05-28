// Edit tool — Aider-inspired multi-strategy matching
//
// Strategies tried in order:
// 1. Exact match (original behavior)
// 2. Trimmed match (strip leading/trailing whitespace from old_string)
// 3. Normalized match (consistent indentation, tabs→spaces)
//
// Fails with actionable error when no strategy works.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolDefinition, ToolResult } from "../types.js";

export const editDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "edit",
    description:
      "Perform exact string replacements in an existing file. Fails if old_string is not unique. Use replace_all to replace all occurrences.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to modify" },
        old_string: { type: "string", description: "The text to replace (must be unique)" },
        new_string: { type: "string", description: "The text to replace it with" },
        replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
};

interface EditError {
  kind: "file_missing" | "not_found" | "not_unique" | "same_string" | "io_error";
  message: string;
  context?: string;
}

function makeErr(kind: EditError["kind"], message: string, context?: string): EditError {
  return { kind, message, context };
}

/** Find matching positions using multiple strategies. Returns [index, strategy_name] or null. */
function tryMatch(content: string, oldStr: string): [number, string] | null {
  // Strategy 1: exact
  const exact = content.indexOf(oldStr);
  if (exact !== -1) return [exact, "exact"];

  // Strategy 2: trimmed (ignore surrounding whitespace in oldStr)
  const trimmed = oldStr.trim();
  if (trimmed !== oldStr) {
    const idx = content.indexOf(trimmed);
    if (idx !== -1 && !isNotUnique(content, trimmed, idx)) return [idx, "trimmed"];
  }

  // Strategy 3: normalized indentation
  const normalized = normalizeIndent(oldStr);
  if (normalized !== oldStr && normalized !== trimmed) {
    const idx = content.indexOf(normalized);
    if (idx !== -1 && !isNotUnique(content, normalized, idx)) return [idx, "normalized"];
  }

  return null;
}

function isNotUnique(content: string, str: string, firstIdx: number): boolean {
  return content.indexOf(str, firstIdx + 1) !== -1;
}

function normalizeIndent(text: string): string {
  // Detect indentation style from the content:
  // 1. tabs → 4 spaces
  // 2. collapse extra indentation
  let normalized = text.replace(/\t/g, "    ");
  // Detect leading whitespace pattern and normalize inconsistent indentation
  const lines = normalized.split("\n");
  const indentCounts = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^ */)?.[0]?.length ?? 0);
  if (indentCounts.length < 2) return text; // can't normalize single line
  
  const minIndent = Math.min(...indentCounts) || 0;
  if (minIndent > 0) {
    normalized = lines.map((l) => l.startsWith(" ".repeat(minIndent)) ? l.slice(minIndent) : l).join("\n");
  }
  return normalized;
}

function formatFileContext(content: string, oldStr: string): string {
  const lines = content.split("\n");
  // Try to find the oldStr and report line numbers
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(oldStr.split("\n")[0] ?? "")) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 3);
      return `near line ${i + 1}:\n${lines.slice(start, end).map((l, j) => `${start + j + 1}: ${l}`).join("\n")}`;
    }
  }
  return `file has ${lines.length} lines`;
}

function describeMismatch(content: string, oldStr: string): string {
  // Find the closest matching line
  const oldLines = oldStr.trim().split("\n");
  const firstLine = oldLines[0] ?? "";
  const contentLines = content.split("\n");
  
  for (let i = 0; i < contentLines.length; i++) {
    const cl = contentLines[i]!.trim();
    if (similarity(cl, firstLine) > 0.6) {
      return `Found similar line ${i + 1}: "${cl.slice(0, 80)}". Did you mean this?`;
    }
  }
  return "No similar lines found in file";
}

function similarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer[i] === shorter[i]) matches++;
  }
  return matches / longer.length;
}

export async function executeEdit(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = resolve(args.file_path as string);
  const oldStr = args.old_string as string;
  const newStr = args.new_string as string;
  const replaceAll = (args.replace_all as boolean) ?? false;

  if (oldStr === newStr) {
    return { tool_call_id: "", content: "Error: old_string and new_string are identical — no change needed", is_error: true };
  }

  if (!existsSync(filePath)) {
    return { tool_call_id: "", content: `Error: file not found: ${filePath}`, is_error: true };
  }

  try {
    const content = readFileSync(filePath, "utf-8");

    if (replaceAll) {
      const count = countOccurrences(content, oldStr);
      if (count === 0) {
        return { tool_call_id: "", content: `Error: old_string not found in ${filePath}\n${formatFileContext(content, oldStr)}`, is_error: true };
      }
      const updated = content.replaceAll(oldStr, newStr);
      writeFileSync(filePath, updated, "utf-8");
      return { tool_call_id: "", content: `Replaced ${count} occurrences in ${filePath}`, is_error: false };
    }

    // Multi-strategy match
    const match = tryMatch(content, oldStr);
    if (!match) {
      const ctx = formatFileContext(content, oldStr);
      const hint = describeMismatch(content, oldStr);
      return {
        tool_call_id: "",
        content: `Error: old_string not found in ${filePath}. ${hint}\n${ctx}`,
        is_error: true,
      };
    }

    const [idx, strategy] = match;
    const matchedStr = strategy === "exact" ? oldStr : (strategy === "trimmed" ? oldStr.trim() : normalizeIndent(oldStr));

    if (isNotUnique(content, matchedStr, idx)) {
      return {
        tool_call_id: "",
        content: `Error: old_string matches multiple locations in ${filePath}. Add more surrounding context to make it unique.`,
        is_error: true,
      };
    }

    const updated = content.slice(0, idx) + newStr + content.slice(idx + matchedStr.length);
    writeFileSync(filePath, updated, "utf-8");
    const strategyNote = strategy === "exact" ? "" : ` (${strategy} match)`;
    return { tool_call_id: "", content: `Replaced 1 occurrence in ${filePath}${strategyNote}`, is_error: false };
  } catch (e: unknown) {
    return { tool_call_id: "", content: `Error editing file: ${(e as Error).message}`, is_error: true };
  }
}

function countOccurrences(content: string, str: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = content.indexOf(str, idx)) !== -1) {
    count++;
    idx += str.length || 1;
  }
  return count;
}
