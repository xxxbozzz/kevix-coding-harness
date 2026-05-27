import type { GateContext, GateToolCall } from "../types.js";

export function makeCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    directive: null,
    mode: "auto",
    projectRoot: "/tmp/test-project",
    probeCompleted: false,
    verifierVerdict: null,
    revisionCount: 0,
    maxRevisions: 2,
    needProbe: null,
    problemText: "Fix a bug in the login form validation",
    ...overrides,
  };
}

export function makeCall(
  name: string,
  args: Record<string, unknown> = {},
): GateToolCall {
  return { name, args };
}
