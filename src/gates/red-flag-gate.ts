// Gate 2: Red Flag Gate
// Files listed in the directive's Red Flags section must not be modified.

import { resolve, relative, sep } from "node:path";
import type { Gate, GateResult, GateContext, GateToolCall } from "./types.js";

const WRITE_TOOLS = new Set(["write", "edit"]);

export const redFlagGate: Gate = {
  name: "red-flag",

  check(ctx: GateContext, call: GateToolCall): GateResult {
    if (!WRITE_TOOLS.has(call.name)) {
      return { decision: "allow", gate: "red-flag", reason: "Not a write tool" };
    }

    if (!ctx.directive) {
      return { decision: "allow", gate: "red-flag", reason: "No directive to check" };
    }

    const filePath = call.args.file_path as string | undefined;
    if (!filePath) {
      return { decision: "allow", gate: "red-flag", reason: "No file_path arg" };
    }

    const patterns = parseRedFlags(ctx.directive.red_flags);
    const resolvedPath = resolve(ctx.projectRoot, filePath);
    const relativePath = relative(ctx.projectRoot, resolvedPath);

    // Whitelist: files explicitly targeted by the task are NOT Red Flags
    const isTargeted = (ctx.targetFiles ?? []).some((tf) =>
      relativePath.includes(tf.replace(/^src\//, "").replace(/^tests?\//, "")) ||
      tf.includes(relativePath)
    );
    if (isTargeted) {
      return { decision: "allow", gate: "red-flag", reason: "File is in task scope (whitelisted from Red Flags)" };
    }

    for (const pattern of patterns) {
      if (matchPath(relativePath, resolvedPath, pattern)) {
        return {
          decision: "deny",
          gate: "red-flag",
          reason: `File "${filePath}" is in Red Flags: "${pattern}"`,
        };
      }
    }

    return { decision: "allow", gate: "red-flag", reason: "File not in red flags" };
  },
};

// Parse Red Flags text to extract file paths/patterns
function parseRedFlags(text: string): string[] {
  const patterns: string[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // First, extract all backtick-wrapped paths (e.g., `src/file.ts`)
    // These may appear inline or on separate lines.
    const backtickRegex = /`([^`]+)`/g;
    let match: RegExpExecArray | null;

    while ((match = backtickRegex.exec(trimmed)) !== null) {
      const path = match[1]!.trim();
      if (path) {
        patterns.push(path);
      }
    }

    // Remove all backtick-wrapped sections and backticks from the line,
    // then process the remaining text with the original logic.
    const withoutBacktickPaths = trimmed
      .replace(/`[^`]+`/g, "")
      .replace(/`/g, "")
      .trim();

    if (!withoutBacktickPaths) continue;

    // Original logic: strip list markers
    const cleaned = withoutBacktickPaths
      .replace(/^[-*•]\s*/, "")
      .trim();

    if (!cleaned) continue;

    // Clean path: strip trailing comments and parenthetical notes
    const pathOnly = cleaned
      .replace(/\s*\(.*\)\s*$/, "")  // trailing (comment)
      .replace(/\s*#.*$/, "")         // trailing # comment
      .replace(/\s*--.*$/, "")        // trailing -- comment
      .replace(/\s*\/\/.*$/, "")      // trailing // comment
      .trim();

    if (!pathOnly) continue;

    // Check if it looks like a path or glob
    if (
      pathOnly.includes("/") ||
      pathOnly.includes("*") ||
      pathOnly.match(/^[\w.-]+\.[\w]+$/) || // filename.ext
      pathOnly.match(/^[!]?[~.]?\/.+/) // paths like ./foo or ~/bar
    ) {
      patterns.push(pathOnly);
    }
  }

  return patterns;
}

/**
 * Match a file path against a glob-like pattern.
 *
 * The matching algorithm uses several strategies, tried in order:
 *
 * 1. **Normalize**: The relative path is normalized to use forward slashes
 *    (`/`) via `relative.replaceAll(sep, "/")`, making it OS-independent.
 *
 * 2. **Exact match**: If the normalized path or absolute path equals the
 *    pattern literally, it's a match.
 *
 * 3. **Suffix match**: If the normalized path ends with `"/" + pattern`
 *    (e.g., pattern `"config.ts"` matches `"src/config.ts"`), it's a match.
 *
 * 4. **Glob-to-regex**: If the pattern contains `*`, it is converted into a
 *    regular expression:
 *    - Literal dots (`.`) are escaped to `\\.` so they match actual periods
 *      rather than "any character".
 *    - `**` (double star) is first replaced with a placeholder
 *      (`___DOUBLESTAR___`), then single `*` is replaced with `[^/]*`
 *      (match any characters except `/`), and finally the placeholder is
 *      restored as `.*` (match any characters including `/`). This two-pass
 *      approach ensures `**` matches across directory boundaries (recursive
 *      matching) while `*` stays within a single path segment.
 *    - The resulting regex is anchored with `^` and `$` and tested against
 *      the normalized path.
 *
 * 5. **Substring fallback**: If none of the above match, a simple
 *    `normalized.includes(pattern)` check catches patterns that appear
 *    anywhere inside the path (e.g., `"auth"` matches `"src/auth/login.ts"`).
 *
 * Wildcard reference:
 * - `*`  — Matches any sequence of characters within a single path segment
 *          (does not cross `/` directory separators).
 * - `**` — Matches any sequence of characters across directory boundaries
 *          (recursive, matches zero or more directories).
 * - `?`  — (Not currently implemented) Would match a single character
 *          except the directory separator `/`.
 *
 * @returns `true` if the path matches the pattern, `false` otherwise.
 */
function matchPath(relative: string, absolute: string, pattern: string): boolean {
  // Normalize
  const normalized = relative.replaceAll(sep, "/");

  // Exact match
  if (normalized === pattern || absolute === pattern) return true;

  // Ends-with match (e.g., "config.ts" matches "src/config.ts")
  if (normalized.endsWith("/" + pattern) || normalized === pattern) return true;

  // Glob **/ prefix (e.g., "**/auth/*" matches "src/auth/login.ts")
  if (pattern.includes("*")) {
    const regex = new RegExp(
      "^" +
      pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, "___DOUBLESTAR___")
        .replace(/\*/g, "[^/]*")
        .replace(/___DOUBLESTAR___/g, ".*") +
        "$",
    );
    return regex.test(normalized);
  }

  // Substring match (pattern appears anywhere in path)
  if (normalized.includes(pattern)) return true;

  return false;
}
