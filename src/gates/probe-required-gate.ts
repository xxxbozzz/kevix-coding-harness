// Gate 6: Probe Required Gate
// Tasks with wire-level risk must complete probe verification before finishing.
// Applies to probe mode and auto mode when need_probe=true.

import type { Gate, GateResult, GateContext, GateToolCall } from "./types.js";

const WIRE_KEYWORDS = [
  "api", "endpoint", "route", "request", "response", "http", "rest", "rpc",
  "database", "db", "sql", "query", "schema", "migration",
  "serialize", "deserialize", "marshal", "unmarshal", "encode", "decode",
  "bytes", "charset", "utf", "unicode", "encoding",
  "webhook", "callback", "event", "message", "queue", "pubsub",
  "concurrency", "race condition", "lock", "mutex", "thread", "async",
  "timeout", "retry",
  "network", "socket", "tcp", "udp", "tls",
  "token", "auth", "jwt", "oauth", "session",
  "cache", "redis", "memcache",
  "file upload", "download", "stream",
];

export const probeRequiredGate: Gate = {
  name: "probe-required",

  check(ctx: GateContext, _call: GateToolCall): GateResult {
    const hasWireRisk = detectWireRisk(ctx.problemText);

    // No wire risk → probe not required
    if (!hasWireRisk) {
      return { decision: "allow", gate: "probe-required", reason: "No wire-level risk detected" };
    }

    // Probe mode: must complete verification
    if (ctx.mode === "probe" && !ctx.probeCompleted) {
      return {
        decision: "deny",
        gate: "probe-required",
        reason: "Probe mode requires verification for wire-level changes. Probe verify phase not completed.",
      };
    }

    // Auto mode: if assess triggered probe, must complete it
    if (ctx.mode === "auto" && ctx.needProbe === true && !ctx.probeCompleted) {
      return {
        decision: "deny",
        gate: "probe-required",
        reason: "Auto-assess triggered probe for wire-level risks. Probe verify phase not completed.",
      };
    }

    return { decision: "allow", gate: "probe-required", reason: "Probe requirements satisfied" };
  },
};

function detectWireRisk(text: string): boolean {
  const lower = text.toLowerCase();
  return WIRE_KEYWORDS.some((kw) => lower.includes(kw));
}
