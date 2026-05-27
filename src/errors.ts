// kevix engine error types — structured, catchable

export class KevixError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(code: string, message: string, recoverable = false) {
    super(message);
    this.name = "KevixError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

/** Provider-level error: network, auth, rate limit, API error */
export class ProviderError extends KevixError {
  readonly status?: number;
  readonly responseBody?: string;

  constructor(message: string, status?: number, body?: string) {
    super("PROVIDER_ERROR", message, status ? status < 500 : true);
    this.name = "ProviderError";
    this.status = status;
    this.responseBody = body;
  }
}

/** Gate blocked a tool call */
export class GateBlockedError extends KevixError {
  readonly gateName: string;
  readonly toolName: string;

  constructor(gateName: string, toolName: string, reason: string) {
    super("GATE_BLOCKED", reason, true);
    this.name = "GateBlockedError";
    this.gateName = gateName;
    this.toolName = toolName;
  }
}

/** Tool execution failed at runtime */
export class ToolExecutionError extends KevixError {
  readonly toolName: string;
  readonly toolArgs: Record<string, unknown>;

  constructor(toolName: string, args: Record<string, unknown>, cause: string) {
    super("TOOL_ERROR", cause, true);
    this.name = "ToolExecutionError";
    this.toolName = toolName;
    this.toolArgs = args;
  }
}

/** Agent loop exhausted max tool rounds */
export class LoopExhaustedError extends KevixError {
  readonly rounds: number;

  constructor(rounds: number) {
    super("LOOP_EXHAUSTED", `Worker exceeded max tool rounds (${rounds})`, false);
    this.name = "LoopExhaustedError";
    this.rounds = rounds;
  }
}
