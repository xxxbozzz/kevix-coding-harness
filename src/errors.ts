// Structured error hierarchy for Kevix engine.
// Every failure has a code and recoverability hint.

export type ErrorCode =
  // Provider errors
  | "PROVIDER_UNAVAILABLE"    // 5xx, network error — retryable
  | "PROVIDER_RATE_LIMITED"   // 429 — retryable with backoff
  | "PROVIDER_TIMEOUT"        // Request timeout — retryable
  | "PROVIDER_INVALID_RESPONSE" // Malformed response — may retry
  // Tool errors
  | "TOOL_FILE_NOT_FOUND"     // File missing — user fixable
  | "TOOL_PERMISSION_DENIED"  // No access — user fixable
  | "TOOL_INVALID_ARGS"       // Bad arguments — model fixable
  | "TOOL_EXECUTION_FAILED"   // Unexpected failure — may retry
  // Gate errors
  | "GATE_SCOPE_VIOLATION"    // Outside editable scope — expansion possible
  | "GATE_RED_FLAG"           // Protected file — cannot proceed
  | "GATE_DIRECTIVE_MISSING"  // No directive — cannot proceed
  | "GATE_BASH_RISK"          // Unsafe command — cannot proceed
  // Loop errors
  | "LOOP_EXHAUSTED"          // Max rounds reached — task too complex
  | "LOOP_STALLED"            // No progress — model stuck
  // Memory errors
  | "MEMORY_STORE_FAILED"     // Persistence error — recoverable
  | "MEMORY_DISTILL_FAILED";  // Distillation error — retryable

export interface KevixError extends Error {
  code: ErrorCode;
  recoverable: boolean;
  retryable: boolean;
  context?: Record<string, unknown>;
}

export class EngineError extends Error implements KevixError {
  code: ErrorCode;
  recoverable: boolean;
  retryable: boolean;
  context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { recoverable?: boolean; retryable?: boolean; context?: Record<string, unknown>; cause?: Error } = {},
  ) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.recoverable = opts.recoverable ?? true;
    this.retryable = opts.retryable ?? false;
    this.context = opts.context;
    if (opts.cause) this.cause = opts.cause;
  }
}

// ── Convenience constructors ──

export function providerUnavailable(message: string, cause?: Error): EngineError {
  return new EngineError("PROVIDER_UNAVAILABLE", message, { recoverable: true, retryable: true, cause });
}

export function providerRateLimited(message: string): EngineError {
  return new EngineError("PROVIDER_RATE_LIMITED", message, { recoverable: true, retryable: true });
}

export function toolFileNotFound(filePath: string): EngineError {
  return new EngineError("TOOL_FILE_NOT_FOUND", `File not found: ${filePath}`, { recoverable: true, retryable: false });
}

export function toolExecutionFailed(message: string, cause?: Error): EngineError {
  return new EngineError("TOOL_EXECUTION_FAILED", message, { recoverable: true, retryable: true, cause });
}

export function gateScopeViolation(file: string, editableScope: string[]): EngineError {
  return new EngineError("GATE_SCOPE_VIOLATION", `File "${file}" is outside editable scope: [${editableScope.join(", ")}]`, {
    recoverable: true, retryable: false, context: { file, editableScope },
  });
}

export function loopExhausted(rounds: number): EngineError {
  return new EngineError("LOOP_EXHAUSTED", `Worker exceeded max tool rounds (${rounds})`, { recoverable: false, retryable: false });
}

/** Classify any error — returns recoverable/retryable hints */
export function classifyError(err: unknown): { recoverable: boolean; retryable: boolean; code: ErrorCode } {
  if (err instanceof EngineError) {
    return { recoverable: err.recoverable, retryable: err.retryable, code: err.code };
  }
  const msg = String((err as Error)?.message ?? err);
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(msg)) {
    return { recoverable: true, retryable: true, code: "PROVIDER_UNAVAILABLE" };
  }
  if (/429|rate limit/i.test(msg)) {
    return { recoverable: true, retryable: true, code: "PROVIDER_RATE_LIMITED" };
  }
  if (/ENOENT|not found|no such file/i.test(msg)) {
    return { recoverable: true, retryable: false, code: "TOOL_FILE_NOT_FOUND" };
  }
  return { recoverable: false, retryable: false, code: "TOOL_EXECUTION_FAILED" };
}

// ── Legacy compatibility ──

export class ProviderError extends EngineError {
  constructor(message: string, public httpStatus?: number, public responseBody?: string) {
    const isRetryable = httpStatus ? httpStatus >= 500 || httpStatus === 429 : true;
    super(
      httpStatus === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      message,
      { recoverable: true, retryable: isRetryable, context: { httpStatus, responseBody } },
    );
    this.name = "ProviderError";
  }
}

export class GateBlockedError extends EngineError {
  constructor(gateName: string, reason: string) {
    super(
      gateName === "scope" ? "GATE_SCOPE_VIOLATION" : gateName === "red-flag" ? "GATE_RED_FLAG" : "GATE_DIRECTIVE_MISSING",
      `Gate ${gateName}: ${reason}`,
      { recoverable: gateName !== "red-flag" && gateName !== "directive", retryable: false, context: { gate: gateName, reason } },
    );
    this.name = "GateBlockedError";
  }
}

export class ToolExecutionError extends EngineError {
  constructor(toolName: string, message: string, cause?: Error) {
    super("TOOL_EXECUTION_FAILED", `${toolName}: ${message}`, { recoverable: true, retryable: true, cause });
    this.name = "ToolExecutionError";
  }
}

export class LoopExhaustedError extends EngineError {
  constructor(rounds: number) {
    super("LOOP_EXHAUSTED", `Worker exceeded max tool rounds (${rounds})`, { recoverable: false, retryable: false });
    this.name = "LoopExhaustedError";
  }
}
