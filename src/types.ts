// ============================================================
// @kevix/engine — Core Types
// ============================================================

// --- Provider Types ---

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  // DeepSeek-specific: reasoning content (R1 style)
  reasoning_content?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  is_error?: boolean;
  error?: { message: string; stack?: string };
}

export interface LLMRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  max_tokens?: number;
  // Force JSON output (DeepSeek supports response_format)
  response_format?: { type: "json_object" } | { type: "text" };
}

export interface LLMResponse {
  message: ChatMessage;
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  usage: TokenUsage;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  // DeepSeek-specific cache metrics
  prompt_cache_hit_tokens: number;
  prompt_cache_miss_tokens: number;
  // Convenience derived values
  total_tokens: number;
  cache_hit_ratio: number; // 0-100
}

/// SSE streaming event from DeepSeek
export interface StreamDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: Partial<ToolCall>[];
  finish_reason?: string;
}

// --- Agent Loop Types ---

export type LoopState =
  | "idle"
  | "running"
  | "waiting_tools"
  | "paused" // User approval gate
  | "done"
  | "error";

export interface LoopStep {
  step_id: string;
  messages: ChatMessage[];
  tool_results?: ToolResult[];
  response: LLMResponse | null;
  error?: string;
}

// --- PEAN Types ---

export type PEANMode = "memory" | "probe" | "auto";

export type PEANPhase =
  | "controller"
  | "probe_plan"
  | "worker"
  | "probe_verify"
  | "assess"
  | "done";

export interface PEAState {
  mode: PEANMode;
  phase: PEANPhase;
  controller_started_at?: number;
  directive?: PEANDirective;
  patch?: string;
  probe_plan?: ProbeRisk[];
  probe_verify?: ProbeVerifyReport;
  assess?: AutoAssessResult;
  revision_count: number;
}

/** PEAN Product Controller directive (6-section format) */
export interface PEANDirective {
  product_intent: string;
  hidden_semantics: string;
  acceptance_tests: string;
  implementation_constraints: string;
  red_flags: string;
  worker_directive: string;
  raw: string; // original markdown
}

/** Single wire-level risk from probe plan */
export interface ProbeRisk {
  id: string;
  category: "encoding" | "coercion" | "serialization" | "api_boundary" | "state_machine";
  description: string;
  location: string; // file:line or "N/A"
  severity: "low" | "medium" | "high" | "critical";
}

/** Probe verification report */
export interface ProbeVerifyReport {
  risks_checked: number;
  risks_triggered: number;
  findings: ProbeFinding[];
  verdict: "clean" | "needs_revision";
  revised_patch?: string;
}

export interface ProbeFinding {
  risk_id: string;
  status: "pass" | "fail" | "uncertain";
  trace: string; // line-by-line trace
  recommendation?: string;
}

/** Auto mode self-assess result */
export interface AutoAssessResult {
  need_probe: boolean;
  reason: string;
}

// --- Engine Events ---

export type EngineEvent =
  | { type: "step_start"; phase: PEANPhase; timestamp: number }
  | { type: "step_complete"; phase: PEANPhase; duration_ms: number }
  | { type: "api_call"; request_index: number; usage: TokenUsage }
  | { type: "log"; level: "info" | "warn" | "error"; text: string }
  | { type: "directive"; directive: PEANDirective }
  | { type: "decision"; need_probe: boolean; reason: string }
  | { type: "result"; summary: TaskSummary }
  | { type: "error"; message: string; phase?: PEANPhase }
  | { type: "done"; exit_code: number }
  | { type: "approval_required"; directive: PEANDirective }
  | { type: "state_snapshot"; snapshot: EngineStateSnapshot }
  | { type: "escalate"; issues: string[]; cycles: number }
  | { type: "advisory"; signal: string; suggestion: string; data: Record<string, unknown> }
  | { type: "risk_hint"; findings: Array<{ file: string; gate?: string; category?: string; description: string }> }
  | { type: "tradeoff_required"; evidence: TradeoffEvidence; options: TradeoffOption[] }
  | { type: "streaming"; text: string }
  | { type: "tool_call"; name: string; call_id: string; args_preview: string }
  | { type: "tool_start"; name: string; args: string }
  | {
      type: "tool_result";
      name: string;
      content: string;
      is_error: boolean;
      call_id?: string;
      content_preview?: string;
      duration_ms?: number;
      added_lines?: number;
      removed_lines?: number;
    };

export interface TradeoffEvidence {
  gateCount: number;
  cacheTrend: "stable" | "declining";
  cacheHitValues: number[];
  graphFindings: Array<{ file: string; description: string }>;
  activeSignals: string[]; // which signals triggered this
}

export interface TradeoffOption {
  id: "A" | "B" | "C";
  label: string;
  description: string;
  mode: "memory" | "probe" | "pause";
}

export type TradeoffChoice = "A" | "B" | "C";

export interface EngineStateSnapshot {
  taskId: string;
  mode: PEANMode;
  directive: string | null;
  phasesCompleted: PEANPhase[];
  tokenUsage: TokenUsage;
  gateEvents: string[];
  patch: string | null;
  timestamp: number;
}

export type ApprovalAction = "approve" | "revise" | "reject";

export interface ReviewResult {
  verdict: "PASS" | "BLOCKED";
  issues: string[];
  evidence: string[];
  required_fixes: string;
}

export interface TaskSummary {
  mode: PEANMode;
  task_id: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  cache_hit_ratio_pct: number;
  request_count: number;
  directive_path?: string;
  patch_path?: string;
  phases_completed: PEANPhase[];
  /** If approval was rejected, this is set */
  rejected?: boolean;
  /** If review loop escalated after max cycles */
  escalated?: boolean;
  /** Review issues collected during review loop */
  review_issues?: string[];
  /** Resume a paused task (only present when approvalMode=manual) */
  resume?: (action: ApprovalAction, revisedDirective?: string) => Promise<TaskSummary>;
}

// --- Engine Config ---

export interface KevixEngineOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  defaultMode?: PEANMode;
  outputDir?: string;
  maxRevisionRounds?: number;
  onEvent?: (event: EngineEvent) => void;
}

// --- Session Types ---

export interface SessionState {
  session_id: string;
  created_at: number;
  messages: ChatMessage[];
  token_usage: TokenUsage;
  pean_state: PEAState | null;
}

// --- Tool Types ---

export interface ToolHandler {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
