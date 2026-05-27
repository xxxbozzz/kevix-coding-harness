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
    // For bash, check the command against successChecks whitelist
    if (call.name === BASH) {
      return checkBashScope(ctx.projectRoot, call.args.command as string, ctx.scopeContract);
    }

    if (!WRITE_TOOLS.has(call.name)) {
      return { decision: "allow", gate: "scope", reason: "Not a write tool" };
    }

    const filePath = call.args.file_path as string | undefined;
    if (!filePath) {
      return { decision: "allow", gate: "scope", reason: "No file_path" };
    }

    // P56.1: Enforce editableScope contract
    if (ctx.scopeContract) {
      if (ctx.scopeContract.editableScope.length === 0) {
        return {
          decision: "deny",
          gate: "scope",
          reason: "Editable scope is empty — no files can be written",
          scopeExpansion: { file: filePath, editableScope: [] },
        };
      }
      const allowed = ctx.scopeContract.editableScope.some((scopeFile) => {
        const resolved = resolve(ctx.projectRoot, filePath);
        const scopeResolved = resolve(ctx.projectRoot, scopeFile);
        return resolved === scopeResolved;
      });
      if (!allowed) {
        return {
          decision: "deny",
          gate: "scope",
          reason: `File "${filePath}" is not in editable scope. Allowed: ${ctx.scopeContract.editableScope.join(", ")}`,
          scopeExpansion: { file: filePath, editableScope: ctx.scopeContract.editableScope },
        };
      }
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

function checkBashScope(projectRoot: string, command: string, scopeContract?: import("../types.js").ScopeContract): GateResult {
  // P56.1: Whitelist successChecks — reject compound commands
  if (scopeContract && scopeContract.successChecks.length > 0) {
    const trimmed = command.trim();
    // Reject shell compound commands (&&, ;, |, ||) — prevent injection
    if (/[;&|]/.test(trimmed) && !trimmed.startsWith("npm test --")) {
      // Check if it's a compound: split and verify each segment
      const segments = trimmed.split(/\s*[;&|]{1,2}\s*/);
      const allAreSuccessChecks = segments.every((seg) =>
        scopeContract.successChecks.some((check) => seg === check || seg.startsWith(check))
      );
      if (!allAreSuccessChecks) {
        return {
          decision: "deny",
          gate: "scope",
          reason: `Compound bash command contains non-successCheck segments: "${trimmed}"`,
        };
      }
      // All segments are successChecks — allow
      return { decision: "allow", gate: "scope", reason: "Compound success check commands" };
    }
    const isSuccessCheck = scopeContract.successChecks.some((check) => trimmed === check || trimmed.startsWith(check));
    if (isSuccessCheck) {
      return { decision: "allow", gate: "scope", reason: "Success check command" };
    }
  }
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
