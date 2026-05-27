// Gate 3: Scope Gate
// Tool calls must stay within project root. Sensitive system paths are denied.

import { resolve, relative, normalize, sep } from "node:path";
import type { Gate, GateResult, GateContext, GateToolCall } from "./types.js";

const WRITE_TOOLS = new Set(["write", "edit"]);
const BASH = "bash";

const DENY_PATHS = [
  /^\/etc\//,
  /^\/usr\//,
  /^\/bin\//,
  /^\/sbin\//,
  /^\/boot\//,
  /^\/dev\//,
  /^\/sys\//,
  /^\/proc\//,
  /\.ssh\//,
  /\.aws\//,
  /\.gnupg\//,
  /\/\.git\/config$/,
  /\.env$/,
  /\.env\..*$/,
  /credentials$/,
  /\.pem$/,
];

const ASK_PATHS = [
  /node_modules\//,
  /\.venv\//,
  /venv\//,
  /__pycache__\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /\.cache\//,
];

export const scopeGate: Gate = {
  name: "scope",

  check(ctx: GateContext, call: GateToolCall): GateResult {
    // For bash, check the command for file paths
    if (call.name === BASH) {
      return checkBashScope(ctx.projectRoot, call.args.command as string);
    }

    if (!WRITE_TOOLS.has(call.name)) {
      return { decision: "allow", gate: "scope", reason: "Not a write tool" };
    }

    const filePath = call.args.file_path as string | undefined;
    if (!filePath) {
      return { decision: "allow", gate: "scope", reason: "No file_path" };
    }

    return checkFilePath(ctx.projectRoot, filePath);
  },
};

function stripTrailingSlashes(p: string): string {
  const stripped = p.replace(/[\/\\]+$/, '');
  return stripped === '' ? '/' : stripped;
}

function checkFilePath(projectRoot: string, filePath: string): GateResult {
  const resolved = resolve(projectRoot, filePath);
  const normalized = normalize(resolved);
  const normalizedRoot = normalize(resolve(projectRoot));
  const cleanRoot = stripTrailingSlashes(normalizedRoot);

  // Must be inside project root
  const prefix = cleanRoot === '/' ? '/' : cleanRoot + '/';
  if (normalized !== cleanRoot && !normalized.startsWith(prefix)) {
    return {
      decision: "deny",
      gate: "scope",
      reason: `File "${filePath}" is outside project root "${projectRoot}"`,
    };
  }

  // Check deny paths
  for (const pattern of DENY_PATHS) {
    if (pattern.test(normalized)) {
      return {
        decision: "deny",
        gate: "scope",
        reason: `Path "${filePath}" matches sensitive pattern: ${pattern}`,
      };
    }
  }

  // Check ask paths (dependency directories)
  for (const pattern of ASK_PATHS) {
    if (pattern.test(normalized)) {
      return {
        decision: "ask",
        gate: "scope",
        reason: `Path "${filePath}" is in a dependency directory`,
      };
    }
  }

  return { decision: "allow", gate: "scope", reason: "Within scope" };
}

function checkBashScope(projectRoot: string, command: string): GateResult {
  // Scan command for file path arguments that might be outside scope
  // This is a best-effort check — bash commands are hard to fully parse
  const pathArgs = command.match(/(?:\/[\w.-]+)+/g) ?? [];

  for (const pathArg of pathArgs) {
    // Skip common flags
    if (pathArg.startsWith("/dev/") || pathArg === "/usr/bin/env") continue;

    const resolved = resolve(projectRoot, pathArg);
    const normalized = normalize(resolved);
    const normalizedRoot = normalize(resolve(projectRoot));

    if (!normalized.startsWith(normalizedRoot + "/") && normalized !== normalizedRoot) {
      // Only flag if it looks like a write operation
      if (/rm\b|mv\b|cp\b|>|tee\b|dd\b/.test(command)) {
        return {
          decision: "deny",
          gate: "scope",
          reason: `Bash command references path outside project: "${pathArg}"`,
        };
      }
    }
  }

  return { decision: "allow", gate: "scope", reason: "Bash within scope" };
}
