// Gate 4: Bash Risk Gate
// Classify bash commands by risk level. Deny critical, ask high, allow low.

import type { Gate, GateResult, GateContext, GateToolCall } from "./types.js";

const BASH = "bash";

// ============================================================
// CRITICAL: Always deny
// ============================================================
const CRITICAL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /rm\s+-rf\s+\//, label: "rm -rf /" },
  { pattern: /curl\b.+\|\s*(?:ba)?sh/, label: "curl pipe shell" },
  { pattern: /wget\b.+\|\s*(?:ba)?sh/, label: "wget pipe shell" },
  { pattern: /\beval\b/, label: "eval" },
  { pattern: />\s*\/dev\/sda/, label: "write to raw device" },
  { pattern: /mkfs\./, label: "mkfs" },
  { pattern: /dd\s+if=/, label: "dd" },
  { pattern: />\s*\/etc\//, label: "write to /etc" },
  { pattern: /chmod\s+777\s+\//, label: "chmod 777 on root" },
  { pattern: /chown\s+-R\s+\//, label: "chown -R on root" },
];

// ============================================================
// HIGH: Deny (non-interactive). In GUI mode: ask.
// ============================================================
const HIGH_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /rm\s+-rf/, label: "rm -rf" },
  { pattern: /git\s+reset\s+--hard/, label: "git reset --hard" },
  { pattern: /git\s+clean\s+-f[d]/, label: "git clean -f" },
  { pattern: /git\s+push\s+.*--force/, label: "git push --force" },
  { pattern: /git\s+push\s+.*-f\b/, label: "git push -f" },
  { pattern: /docker\s+rm\s+-f/, label: "docker rm -f" },
  { pattern: /docker\s+system\s+prune/, label: "docker prune" },
  { pattern: /DROP\s+(TABLE|DATABASE)/i, label: "DROP TABLE/DATABASE" },
  { pattern: /TRUNCATE\s+(TABLE\s+)?\w/i, label: "TRUNCATE" },
  { pattern: /ALTER\s+TABLE\b.+\bDROP\b/i, label: "ALTER TABLE DROP" },
  { pattern: /chmod\s+777/, label: "chmod 777" },
  { pattern: /sudo\b/, label: "sudo" },
  { pattern: /shutdown\b/, label: "shutdown" },
  { pattern: /reboot\b/, label: "reboot" },
  { pattern: /kill\s+-9/, label: "kill -9" },
  { pattern: /pkill\b/, label: "pkill" },
];

// ============================================================
// MEDIUM: Ask
// ============================================================
const MEDIUM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /git\s+push\b/, label: "git push" },
  { pattern: /npm\s+publish/, label: "npm publish" },
  { pattern: /docker\s+push/, label: "docker push" },
  { pattern: /ssh\b/, label: "ssh" },
  { pattern: /scp\b/, label: "scp" },
  { pattern: /curl\b/, label: "curl" },
  { pattern: /wget\b/, label: "wget" },
  { pattern: /pip\s+install/, label: "pip install" },
  { pattern: /npm\s+install\s+-g/, label: "npm install -g" },
  { pattern: /brew\s+install/, label: "brew install" },
];

// ============================================================
// SECRET READING: Deny
// ============================================================
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /SECRET|TOKEN|PASSWORD|API[_-]?KEY/i, label: "credential env var" },
  { pattern: /\.env/, label: ".env file" },
  { pattern: /\.aws\//, label: "AWS config" },
  { pattern: /\.ssh\//, label: "SSH keys" },
  { pattern: /\.gnupg\//, label: "GPG keys" },
  { pattern: /id_rsa/, label: "private key" },
  { pattern: /certificate/i, label: "certificate" },
  { pattern: /credential/i, label: "credential" },
];

export const bashRiskGate: Gate = {
  name: "bash-risk",

  check(ctx: GateContext, call: GateToolCall): GateResult {
    if (call.name !== BASH) {
      return { decision: "allow", gate: "bash-risk", reason: "Not a bash command" };
    }

    const command = (call.args.command as string) ?? "";

    // Check CRITICAL first
    for (const { pattern, label } of CRITICAL_PATTERNS) {
      if (pattern.test(command)) {
        return {
          decision: "deny",
          gate: "bash-risk",
          reason: `Critical risk: ${label}`,
        };
      }
    }

    // Check secret reading in command
    for (const { pattern, label } of SECRET_PATTERNS) {
      if (pattern.test(command)) {
        return {
          decision: "deny",
          gate: "bash-risk",
          reason: `Attempting to access: ${label}`,
        };
      }
    }

    // Check HIGH
    for (const { pattern, label } of HIGH_PATTERNS) {
      if (pattern.test(command)) {
        return {
          decision: "deny",
          gate: "bash-risk",
          reason: `High risk: ${label}`,
        };
      }
    }

    // Check MEDIUM
    for (const { pattern, label } of MEDIUM_PATTERNS) {
      if (pattern.test(command)) {
        return {
          decision: "ask",
          gate: "bash-risk",
          reason: `Requires approval: ${label}`,
        };
      }
    }

    return { decision: "allow", gate: "bash-risk", reason: "Safe command" };
  },
};
