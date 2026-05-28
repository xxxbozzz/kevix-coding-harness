// PEAN Agent Loop — DeepSeek-Native Harness Engine
//
// Each PEAN phase runs with its OWN system prompt.
// This is PEAN's structured methodology: different roles, different thinking.
// Cache efficiency comes from DeepSeek-native API calls, not prompt merging.

import { resolve as pathResolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ToolDefinition, LLMResponse, ToolCall, ToolResult } from "../types.js";
import type { PEANMode, PEANPhase, EngineEvent, TaskSummary } from "../types.js";
import {
  createModeState, nextPhase, markPhaseComplete, parseDirective, sanitizeDirectiveForProblem, handleAssessDecision,
  type ModeState,
} from "../pean/mode-router.js";
import {
  buildControllerPrompt, buildWorkerPrompt, buildProbePlanPrompt,
  buildProbeVerifyPrompt, buildAssessPrompt, extractPatch, extractJson, extractJsonArray,
} from "../pean/prompts.js";
import type { AutoAssessResult, ProbeRisk, ProbeVerifyReport } from "../types.js";
import {
  createSession, buildMessages, appendUserMessage, appendAssistantMessage,
  CONTROLLER_SYSTEM, WORKER_SYSTEM, PROBE_PLAN_SYSTEM, PROBE_VERIFY_SYSTEM, AUTO_ASSESS_SYSTEM, REVIEW_SYSTEM,
  type SessionMessages,
} from "../provider/pean-system.js";
import { checkBeforeToolUseStrict, checkBeforeCompleteStrict } from "../gates/registry.js";
import type { GateContext } from "../gates/types.js";
import { LoopExhaustedError } from "../errors.js";
import type { ApprovalAction, PEANDirective, EngineStateSnapshot } from "../types.js";

export interface LLMProvider {
  call(params: {
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" } | { type: "text" };
  }): Promise<LLMResponse>;
}

export interface ToolExecutor {
  execute(call: ToolCall): Promise<ToolResult>;
  definitions: ToolDefinition[];
}

export interface AgentLoopOptions {
  provider: LLMProvider;
  tools: ToolExecutor;
  mode: PEANMode;
  problem: string;
  hints?: string;
  taskId: string;
  maxToolRounds?: number;
  onEvent?: (event: EngineEvent) => void;
  /** If "manual", pause after Controller for user approval */
  approvalMode?: "auto" | "manual";
  /** Called when approval is needed. Return "approve" or "reject". */
  onApprovalRequired?: (directive: PEANDirective) => Promise<ApprovalAction>;
  /** Separate provider for review phase (defaults to main provider) */
  reviewProvider?: LLMProvider;
  /** Optional review graph for historical risk lookup */
  graph?: import("../graph/types.js").ReviewGraph;
  /** Optional graph builder — auto-populates graph during run */
  graphBuilder?: import("../graph/builder.js").GraphBuilder;
  /** Called when tradeoff required — user chooses A/B/C */
  onTradeoffRequired?: (evidence: import("../types.js").TradeoffEvidence, options: import("../types.js").TradeoffOption[]) => Promise<import("../types.js").TradeoffChoice>;
  /** P56: Formal task boundary contract — gates enforce editable scope */
  scopeContract?: import("../types.js").ScopeContract;
  /** P56.2: Called when Worker tries to write outside editableScope */
  onScopeExpansionRequired?: (request: {
    file: string;
    reason: string;
    editableScope: string[];
  }) => Promise<"approve" | "reject">;
  /** P58: Memory sandbox — engine writes raw task evidence after completion. */
  memoryStore?: import("../memory/store.js").SandboxStore;
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<TaskSummary> {
  const { provider, tools, mode, problem, hints, taskId, onEvent } = options;
  const maxToolRounds = options.maxToolRounds ?? 30;
  const emit = (e: EngineEvent) => onEvent?.(e);

  const state = createModeState(mode);
  const requestCount = { value: 0 };
  const gateEvents: string[] = [];
  const cacheHitValues: number[] = [];
  const phasesCompleted: PEANPhase[] = [];
  // P56.3: Scope contract tracking
  const filesChanged: string[] = [];
  const toolTimeline: Array<{ name: string; filePath?: string; command?: string; blocked?: boolean; durationMs?: number; addedLines?: number; removedLines?: number }> = [];
  const scopeExpansionRequests = { value: 0 };
  const expandedScope: string[] = [];
  const testsPassedRef = { value: undefined as boolean | undefined };

  const emitSnapshot = () => {
    const snapshot = {
      taskId,
      mode,
      directive: directive || null,
      phasesCompleted: [...phasesCompleted],
      tokenUsage: (provider as any).totalUsage ?? { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0, total_tokens: 0, cache_hit_ratio: 0 },
      gateEvents: [...gateEvents],
      patch: finalPatch || null,
      timestamp: Date.now(),
    };
    emit({ type: "state_snapshot", snapshot });
    // Feed graph builder
    options.graphBuilder?.handleEvent({ type: "state_snapshot", snapshot }, taskId, problem, mode);
  };

  let directive = "";
  let patch = "";
  let probePlan = "";
  let rejected = false;
  let riskList: ProbeRisk[] = [];
  let assessResult: AutoAssessResult | null = null;
  let reviewIssues: string[] = [];
  let escalated = false;
  let finalPatch = "";

  // ==========================================
  // Phase runners — each creates its own session
  // ==========================================

  const runController = async (): Promise<void> => {
    emit({ type: "step_start", phase: "controller", timestamp: Date.now() });
    const t0 = Date.now();

    // Graph-based risk hint: check historical findings for this task
    if (options.graph) {
      const { findByFile } = await import("../graph/query.js");
      const projectFiles = await findRelevantFiles(problem);
      for (const file of projectFiles) {
        const { gateEvents, findings } = findByFile(options.graph, file);
        if (gateEvents.length > 0 || findings.length > 0) {
          const allFindings = [
            ...gateEvents.map((g) => ({ file, gate: g.gateName, description: g.reason })),
            ...findings.map((f) => ({ file, category: f.category, description: f.description })),
          ];
          if (allFindings.length > 0) {
            emit({ type: "risk_hint", findings: allFindings });
          }
        }
      }
    }

    const session = createSession(CONTROLLER_SYSTEM, []); // no tools for controller
    const msg = buildControllerPrompt(problem, hints);
    appendUserMessage(session, msg);

    const resp = await callLLMStream(provider, session, [], requestCount, emit, { temperature: 0.3 });
    directive = resp.message.content ?? "";

    const parsed = sanitizeDirectiveForProblem(parseDirective(directive), problem);
    directive = replaceDirectiveSection(directive, "Red Flags", parsed.red_flags);
    emit({ type: "directive", directive: parsed });

    markPhaseComplete(state);
    phasesCompleted.push("controller");
    emitSnapshot();
    emit({ type: "step_complete", phase: "controller", duration_ms: Date.now() - t0 });

    // Approval gate — pause for user review
    if (options.approvalMode === "manual" && options.onApprovalRequired) {
      emit({ type: "approval_required", directive: parsed });
      const action = await options.onApprovalRequired(parsed);
      if (action === "reject") {
        rejected = true;
        return;
      }
      // "approve": continue to Worker
    }
  };

  const runProbePlan = async (): Promise<void> => {
    emit({ type: "step_start", phase: "probe_plan", timestamp: Date.now() });
    const t0 = Date.now();

    const session = createSession(PROBE_PLAN_SYSTEM, []);
    const msg = buildProbePlanPrompt(directive, problem);
    appendUserMessage(session, msg);

    const resp = await callLLM(provider, session, [], requestCount, {
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    probePlan = resp.message.content ?? "";
    riskList = extractJsonArray<ProbeRisk>(probePlan) ?? [];

    markPhaseComplete(state);
    phasesCompleted.push("probe_plan");
    emitSnapshot();
    emit({ type: "step_complete", phase: "probe_plan", duration_ms: Date.now() - t0 });
  };

  const gateDataRef: { current: ToolLoopGateData | null } = { current: null };

  const runWorker = async (): Promise<void> => {
    emit({ type: "step_start", phase: "worker", timestamp: Date.now() });
    const t0 = Date.now();

    const session = createSession(WORKER_SYSTEM, tools.definitions);
    const msg = buildWorkerPrompt(directive, problem, mode);
    appendUserMessage(session, msg);

    gateDataRef.current = { directive, mode, assessResult, state, problem, gateEvents, cacheHitValues, emit, onTradeoffRequired: options.onTradeoffRequired, graph: options.graph, tradeoffResult: null, scopeContract: options.scopeContract, onScopeExpansionRequired: options.onScopeExpansionRequired, filesChanged, scopeExpansionRequests, expandedScope, toolTimeline, testsPassed: testsPassedRef };
    const result = await runToolLoop(provider, session, tools, maxToolRounds, emit, requestCount, gateDataRef.current!);
    patch = extractPatch(result.finalContent) ?? result.finalContent;

    markPhaseComplete(state);
    phasesCompleted.push("worker");
    finalPatch = patch;
    emitSnapshot();
    emit({ type: "step_complete", phase: "worker", duration_ms: Date.now() - t0 });
  };

  const runProbeVerify = async (): Promise<void> => {
    emit({ type: "step_start", phase: "probe_verify", timestamp: Date.now() });
    const t0 = Date.now();

    const session = createSession(PROBE_VERIFY_SYSTEM, []);
    const msg = buildProbeVerifyPrompt(patch, probePlan);
    appendUserMessage(session, msg);

    const resp = await callLLM(provider, session, [], requestCount, { temperature: 0.1 });
    const verifyText = resp.message.content ?? "";
    const report = extractJson<ProbeVerifyReport>(verifyText);
    appendAssistantMessage(session, verifyText);

    if (report?.verdict === "needs_revision") {
      state.last_verdict_clean = false;
      if (report.revised_patch) {
        patch = extractPatch(report.revised_patch) ?? report.revised_patch;
        finalPatch = patch;
      } else {
        emit({ type: "log", level: "warn", text: "Verifier needs_revision but no revised patch provided" });
      }
      state.revision_count++;
    } else {
      state.last_verdict_clean = true;
    }

    markPhaseComplete(state);
    phasesCompleted.push("probe_verify");
    emitSnapshot();
    emit({ type: "step_complete", phase: "probe_verify", duration_ms: Date.now() - t0 });
  };

  const runAssess = async (): Promise<void> => {
    emit({ type: "step_start", phase: "assess", timestamp: Date.now() });
    const t0 = Date.now();

    const session = createSession(AUTO_ASSESS_SYSTEM, []);

    // Query graph for historical risk data if available
    let graphCtx: string | undefined;
    if (options.graph) {
      const { findByFile } = await import("../graph/query.js");
      const { getStats } = await import("../graph/query.js");
      const files = await findRelevantFiles(problem);
      const parts: string[] = [];
      for (const file of files) {
        const { gateEvents, findings } = findByFile(options.graph, file);
        if (gateEvents.length > 0) {
          parts.push(`- File "${file}" had ${gateEvents.length} gate event(s) in past tasks`);
        }
        if (findings.length > 0) {
          parts.push(`- File "${file}" had ${findings.length} review finding(s) in past tasks`);
        }
      }
      const stats = getStats(options.graph);
      if (stats.escalateRate > 0) {
        parts.push(`- Project escalate rate: ${(stats.escalateRate * 100).toFixed(0)}%`);
      }
      if (parts.length > 0) {
        graphCtx = parts.join("\n");
      }
    }

    const msg = buildAssessPrompt(patch, problem, graphCtx);
    appendUserMessage(session, msg);

    const resp = await callLLM(provider, session, [], requestCount, {
      temperature: 0,
      response_format: { type: "json_object" },
    });
    assessResult = extractJson<AutoAssessResult>(resp.message.content ?? "");

    if (assessResult) {
      emit({ type: "decision", need_probe: assessResult.need_probe, reason: assessResult.reason });
    }

    markPhaseComplete(state);
    phasesCompleted.push("assess");
    emitSnapshot();
    emit({ type: "step_complete", phase: "assess", duration_ms: Date.now() - t0 });
  };

  const runReview = async (): Promise<"PASS" | "BLOCKED"> => {
    emit({ type: "step_start", phase: "worker", timestamp: Date.now() }); // reuse worker event for simplicity
    const t0 = Date.now();

    const session = createSession(REVIEW_SYSTEM, []);
    const reviewMsg = `## Directive\n\n${directive}\n\n## Patch to Review\n\n\`\`\`diff\n${finalPatch}\n\`\`\`\n\nAudit this patch against the directive. Output verdict and issues.`;
    appendUserMessage(session, reviewMsg);

    const reviewLLM = options.reviewProvider ?? provider;
    const resp = await callLLM(reviewLLM, session, [], requestCount, { temperature: 0.2 });
    const reviewText = resp.message.content ?? "";
    appendAssistantMessage(session, reviewText);

    // Parse review output — try JSON first, fall back to markdown
    const jsonReport = extractJson<{ verdict: string; issues?: Array<{ description: string }> }>(reviewText);
    let verdict: "PASS" | "BLOCKED";
    const issues: string[] = [];

    if (jsonReport?.verdict) {
      verdict = jsonReport.verdict === "PASS" ? "PASS" : "BLOCKED";
      for (const issue of jsonReport.issues ?? []) {
        if (issue.description) issues.push(issue.description);
      }
    } else {
      // Fallback: old markdown format
      const verdictMatch = reviewText.match(/Verdict:\s*(PASS|BLOCKED)/i);
      verdict = verdictMatch?.[1]?.toUpperCase() === "PASS" ? "PASS" : "BLOCKED";
      const issueSection = reviewText.match(/Issues Found[:\s]*\n([\s\S]*?)(?=\n##|\n\*\*|$)/i);
      if (issueSection) {
        for (const line of issueSection[1]!.split("\n")) {
          const m = line.match(/^\d+\.\s+(.+)/);
          if (m?.[1] && !m[1].includes("None")) issues.push(m[1].trim());
        }
      }
    }

    if (verdict === "BLOCKED" && issues.length > 0) {
      reviewIssues.push(...issues);
      emit({ type: "log", level: "warn", text: `Review BLOCKED: ${issues.length} issue(s) found` });
    } else {
      emit({ type: "log", level: "info", text: "Review PASS" });
    }

    emit({ type: "step_complete", phase: "worker", duration_ms: Date.now() - t0 });
    return verdict;
  };

  // ==========================================
  // State machine driver
  // ==========================================

  let currentPhase: PEANPhase | "done" = "controller";
  let currentMode: PEANMode = mode;

  // P56.4: Wiki-driven routing for auto mode
  if (currentMode === "auto" && options.memoryStore) {
    const { routeAutoMode } = await import("../memory/router.js");
    const route = routeAutoMode(problem, options.memoryStore);
    if (route) {
      emit({ type: "log", level: "info", text: `Wiki route: ${route.reason}` });
      if (route.mode === "probe") {
        currentMode = "probe";
        state.mode = "probe";
      }
    }
  }

  while (currentPhase !== "done") {
    state.phase = currentPhase;

    switch (currentPhase) {
      case "controller":
        await runController();
        if (rejected) { currentPhase = "done"; continue; }
        break;
      case "probe_plan":   await runProbePlan(); break;
      case "worker": {
        await runWorker();
        // Runtime control plane: handle tradeoff result
        if (gateDataRef.current?.tradeoffResult?.choice === "B") {
          gateDataRef.current.tradeoffResult = null;
          if (currentMode === "memory") {
            emit({ type: "log", level: "info", text: "Tradeoff: switching to probe mode" });
            currentMode = "probe";
            state.mode = "probe";
            currentPhase = "probe_plan";
            continue;
          }
        }
        if (gateDataRef.current?.tradeoffResult?.choice === "C") {
          gateDataRef.current.tradeoffResult = null;
          emit({ type: "log", level: "warn", text: "Tradeoff: user requested pause" });
          escalated = true;
          currentPhase = "done";
          continue;
        }
        // Review loop: memory and auto modes review after every worker run
        if (currentMode !== "probe") {
          const verdict = await runReview();
          if (verdict === "BLOCKED") {
            state.revision_count++;
            if (state.revision_count >= state.max_revisions) {
              escalated = true;
              emit({ type: "escalate", issues: reviewIssues, cycles: state.revision_count });
              currentPhase = "done";
              continue;
            }
            // Back to worker for revision
            state.worker_done = false;
            continue;
          }
        }
        break;
      }
      case "probe_verify": await runProbeVerify(); break;
      case "assess": {
        await runAssess();
        const ar = assessResult as AutoAssessResult | null;
        if (ar?.need_probe) {
          handleAssessDecision(state, ar);
          currentPhase = "probe_plan";
          continue;
        }
        break;
      }
    }

    const next = nextPhase(state);
    currentPhase = next ?? "done";
  }

  // ==========================================
  // Summary — with BeforeComplete gate check
  // ==========================================

  const gateCtx = buildGateContext(directive, mode, assessResult, state, problem, options.scopeContract);
  const completeCheck = checkBeforeCompleteStrict(gateCtx);
  if (completeCheck) {
    emit({ type: "log", level: "error", text: `Completion blocked by ${completeCheck.gate}: ${completeCheck.reason}` });
    emit({ type: "error", message: completeCheck.reason, phase: state.phase });
  }

  // Save graph if builder provided (write relative to CWD but always save)
  if (options.graphBuilder) {
    options.graphBuilder.toGraph(); // ensure graph is built
  }

  // P56.3: Compute scopeRespected before return
  let scopeRespected: boolean | undefined;
  if (options.scopeContract) {
    const finalEditable = [...options.scopeContract.editableScope, ...expandedScope];
    scopeRespected = filesChanged.length === 0 || filesChanged.every((f: string) => {
      const abs = pathResolve(process.cwd(), f);
      return finalEditable.some((s) => pathResolve(process.cwd(), s) === abs);
    });
  }

  // P58: Capture raw memory evidence to sandbox (best-effort)
  if (options.memoryStore) {
    try {
      const now = new Date();
      const record = {
        id: randomUUID(),
        taskId,
        projectId: "kevix-engine",
        createdAt: now.toISOString(),
        expiresAt: "", // store auto-sets
        problem,
        mode,
        scopeContract: options.scopeContract,
        phases: phasesCompleted,
        toolTimeline: [...toolTimeline],
        gateEvents: [...gateEvents],
        reviewFindings: reviewIssues,
        outcome: {
          scopeRespected,
          scopeExpansionRequests: scopeExpansionRequests.value,
          expandedScope: [...expandedScope],
          filesChanged: [...filesChanged],
          testsPassed: testsPassedRef.value,
          reviewVerdict: reviewIssues.length > 0 ? "BLOCKED" as const : "PASS" as const,
          escalated: escalated || false,
        },
        tags: extractTags(problem, options.scopeContract),
      };
      options.memoryStore.saveRecord(record as any);
    } catch (e: any) {
      emit({ type: "log", level: "warn", text: `Memory capture failed: ${e.message}` });
    }
  }

  return {
    mode,
    task_id: taskId,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    cache_hit_ratio_pct: 0,
    request_count: requestCount.value,
    patch_path: finalPatch ? "(output)" : undefined,
    directive_path: directive ? "(output)" : undefined,
    escalated: escalated || undefined,
    review_issues: reviewIssues.length > 0 ? reviewIssues : undefined,
    phases_completed: phasesCompleted,
    scopeRespected,
    scopeExpansionRequests: scopeExpansionRequests.value,
    expandedScope,
    filesChanged,
  };
}

// ============================================================
// LLM call helper
// ============================================================

async function callLLMStream(
  provider: LLMProvider,
  session: SessionMessages,
  tools: ToolDefinition[],
  requestCount: { value: number },
  emit: (e: EngineEvent) => void,
  overrides?: { temperature?: number; max_tokens?: number; response_format?: { type: "json_object" } | { type: "text" } },
): Promise<LLMResponse> {
  const messages = buildMessages(session);
  // Try streaming, fall back to regular call
  try {
    if (typeof (provider as any).stream === "function") {
      let content = "";
      let reasoning = "";
      let rawToolCalls: Record<number, { name: string; arguments: string }> = {};
      let finishReason = "";
      let lastUsage: any = null;

      for await (const delta of (provider as any).stream({
        messages,
        tools,
        ...(overrides?.temperature !== undefined ? { temperature: overrides.temperature } : {}),
        ...(overrides?.max_tokens ? { max_tokens: overrides.max_tokens } : {}),
      })) {
        if (delta.content) {
          content += delta.content;
          emit({ type: "streaming", text: delta.content });
        }
        if (delta.reasoning_content) reasoning += delta.reasoning_content;
        if (delta.tool_calls) rawToolCalls = delta.tool_calls;
        if (delta.finish_reason) finishReason = delta.finish_reason;
        if (delta.usage) lastUsage = delta.usage;
      }

      requestCount.value++;
      const message: any = { role: "assistant", content: content || null };
      if (reasoning) message.reasoning_content = reasoning;
      if (Object.keys(rawToolCalls).length > 0) {
        message.tool_calls = Object.entries(rawToolCalls).map(([id, tc]) => ({
          id: `call_${id}`,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      const finish_reason = finishReason === "tool_calls" ? "tool_calls" : finishReason === "stop" ? "stop" : finishReason === "length" ? "length" : "stop";
      return {
        message,
        finish_reason: finish_reason as any,
        usage: lastUsage ?? { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0, total_tokens: 0, cache_hit_ratio: 0 },
      };
    }
  } catch {}
  // Fallback to non-streaming
  return callLLM(provider, session, tools, requestCount, overrides);
}

async function callLLM(
  provider: LLMProvider,
  session: SessionMessages,
  tools: ToolDefinition[],
  requestCount: { value: number },
  overrides?: {
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" } | { type: "text" };
  },
): Promise<LLMResponse> {
  const messages = buildMessages(session);
  const resp = await provider.call({ messages, tools, ...overrides });
  requestCount.value++;
  return resp;
}

// ============================================================
// Tool-calling loop (Worker phase only)
// ============================================================

interface ToolLoopGateData {
  directive: string;
  mode: PEANMode;
  assessResult: AutoAssessResult | null;
  state: ModeState;
  problem: string;
  gateEvents: string[];
  cacheHitValues: number[];
  emit: (e: EngineEvent) => void;
  onTradeoffRequired?: (evidence: import("../types.js").TradeoffEvidence, options: import("../types.js").TradeoffOption[]) => Promise<import("../types.js").TradeoffChoice>;
  graph?: import("../graph/types.js").ReviewGraph;
  tradeoffResult?: { choice: "A" | "B" | "C" } | null;
  scopeContract?: import("../types.js").ScopeContract;
  onScopeExpansionRequired?: (request: { file: string; reason: string; editableScope: string[]; }) => Promise<"approve" | "reject">;
  // P56.3: Scope tracking
  filesChanged: string[];
  scopeExpansionRequests: { value: number };
  expandedScope: string[];
  toolTimeline: Array<{ name: string; filePath?: string; command?: string; blocked?: boolean; durationMs?: number; addedLines?: number; removedLines?: number }>;
  testsPassed: { value: boolean | undefined };
}

async function runToolLoop(
  provider: LLMProvider,
  session: SessionMessages,
  tools: ToolExecutor,
  maxRounds: number,
  emit: (e: EngineEvent) => void,
  requestCount: { value: number },
  gateData: ToolLoopGateData,
): Promise<{ finalContent: string }> {
  let stallRounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    const messages = buildMessages(session);
    const resp = await provider.call({
      messages,
      tools: tools.definitions,
      temperature: 0.2,
    });
    requestCount.value++;

    const msg = resp.message;
    emit({
      type: "api_call",
      request_index: requestCount.value,
      usage: resp.usage,
    });
    gateData.cacheHitValues.push(resp.usage.cache_hit_ratio);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { finalContent: msg.content ?? "" };
    }

    // Append assistant turn with tool calls (preserve reasoning_content for DeepSeek)
    session.conversation.push({
      role: "assistant",
      content: msg.content,
      tool_calls: msg.tool_calls,
      ...(msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}),
    });

    // Execute tools with gate checks
    let productiveThisRound = false;
    const results: ToolResult[] = [];
    for (const tc of msg.tool_calls) {
      const toolName = tc.function.name;
      const startedAt = Date.now();
      const tlEntry = { name: toolName, filePath: undefined as string | undefined, command: undefined as string | undefined, blocked: false, durationMs: 0, addedLines: 0 as number | undefined, removedLines: 0 as number | undefined };
      emit({
        type: "tool_call",
        name: toolName,
        call_id: tc.id,
        args_preview: previewText(tc.function.arguments, 180),
      });

      // Build gate context and check
      const gateCtx = buildGateContext(gateData.directive, gateData.mode, gateData.assessResult, gateData.state, gateData.problem, gateData.scopeContract);
      const args = safeParseArgs(tc.function.arguments);
      tlEntry.filePath = (args.file_path ?? args.path) as string | undefined;
      tlEntry.command = (args.command ?? args.cmd) as string | undefined;
      const gateCheck = checkBeforeToolUseStrict(gateCtx, {
        name: toolName,
        args,
      });

      if (gateCheck) {
        const content = `[PEAN Gate: ${gateCheck.gate}] ${gateCheck.reason}`;
        results.push({
          tool_call_id: tc.id,
          content,
          is_error: true,
        });
        emit({
          type: "tool_result",
          name: toolName,
          call_id: tc.id,
          content: content.slice(0, 1000),
          content_preview: previewText(content, 180),
          is_error: true,
          duration_ms: Date.now() - startedAt,
        });
        emit({ type: "log", level: "warn", text: `Gate blocked ${toolName}: ${gateCheck.reason}` });
        gateData.gateEvents.push(`[${gateCheck.gate}] ${toolName}: ${gateCheck.reason}`);
        // P58.1: Record blocked tool in timeline
        tlEntry.blocked = true;
        tlEntry.durationMs = Date.now() - startedAt;
        gateData.toolTimeline.push({ ...tlEntry });
        // P56.2: Emit scope_expansion_required and handle expansion callback
        // P56.2: scope_expansion_required + expansion callback
        if (gateCheck.scopeExpansion) {
          gateData.scopeExpansionRequests.value++;
          gateData.emit({
            type: "scope_expansion_required",
            file: gateCheck.scopeExpansion.file,
            reason: gateCheck.reason,
            editableScope: gateCheck.scopeExpansion.editableScope,
          });
          if (gateData.onScopeExpansionRequired && gateData.scopeContract) {
            const decision = await gateData.onScopeExpansionRequired({
              file: gateCheck.scopeExpansion.file,
              reason: gateCheck.reason,
              editableScope: [...gateData.scopeContract.editableScope],
            });
            if (decision === "approve") {
              gateData.scopeContract.editableScope.push(gateCheck.scopeExpansion.file);
              gateData.expandedScope.push(gateCheck.scopeExpansion.file);
              gateData.emit({ type: "log", level: "info", text: `Scope expanded: ${gateCheck.scopeExpansion.file}` });
              continue;
            }
          }
        }
        // Runtime control plane: check if tradeoff needed
        if (gateData.onTradeoffRequired) {
          const tradeoffCheck = checkTradeoffSignals(gateData, gateData.graph, true);
          if (tradeoffCheck) {
            const evidence = tradeoffCheck.evidence;
            const opts = tradeoffCheck.options;
            gateData.emit({ type: "tradeoff_required", evidence, options: opts });
            const choice = await gateData.onTradeoffRequired(evidence, opts);
            gateData.tradeoffResult = { choice };
            if (choice === "B") {
              gateData.emit({ type: "log", level: "info", text: "User chose probe — exiting tool loop to upgrade mode" });
              return { finalContent: "Tradeoff: switching to probe mode." };
            } else if (choice === "C") {
              gateData.emit({ type: "log", level: "warn", text: "User requested pause — exiting tool loop" });
              return { finalContent: "Tradeoff: user requested pause." };
            }
          }
        }
        continue;
      }

      emit({ type: "tool_start", name: toolName, args: previewText(tc.function.arguments, 180) });
      // P56.3: Track files changed
      if (toolName === "write" || toolName === "edit") {
        try {
          const a = safeParseArgs(tc.function.arguments);
          const fp = a.file_path as string | undefined;
          if (fp && !gateData.filesChanged.includes(fp)) gateData.filesChanged.push(fp);
        } catch {}
      }

      const result = await tools.execute(tc);
      productiveThisRound = true;
      result.tool_call_id = tc.id;
      // Detect test pass/fail from bash output
      if (toolName === "bash" && result.content) {
        const lower = result.content.toLowerCase();
        const hasFailures = (/\bfail(?:ed|ing)?\b/i.test(lower) && lower.indexOf("0 failed") < 0 && lower.indexOf("0 failing") < 0) || /assertionerror|\berror\b/i.test(lower);
        const hasPasses = /\d+\s+pass|tests\s+pass|all\s+tests|\bok\b/i.test(lower);
        if (hasPasses && !hasFailures) {
          gateData.testsPassed.value = true;
        } else if (hasFailures) {
          gateData.testsPassed.value = false;
        }
      }
      const diffStats = (toolName === "edit" || toolName === "write")
        ? computeDiff(result.content, toolName, args) : null;
      emit({
        type: "tool_result",
        name: toolName,
        call_id: tc.id,
        content: result.content.slice(0, 1000),
        content_preview: previewText(result.content, 180),
        is_error: result.is_error ?? false,
        duration_ms: Date.now() - startedAt,
        ...(diffStats ?? {}),
      });
      // P58.1: Record successful tool in timeline
      tlEntry.durationMs = Date.now() - startedAt;
      if (diffStats) { tlEntry.addedLines = diffStats.added_lines; tlEntry.removedLines = diffStats.removed_lines; }
      gateData.toolTimeline.push({ ...tlEntry });
      results.push(result);
    }

    for (const r of results) {
      session.conversation.push({
        role: "tool",
        tool_call_id: r.tool_call_id,
        content: r.content,
      });
    }

    // Stall guard: exit if 5 consecutive rounds with no productive tool execution
    if (productiveThisRound) {
      stallRounds = 0;
    } else {
      stallRounds++;
      if (stallRounds >= 5) {
        emit({ type: "log", level: "warn", text: "Stall detected — no productive tools for 5 rounds. Completing worker." });
        return { finalContent: msg.content ?? "" };
      }
    }
  }

  throw new LoopExhaustedError(maxRounds);
}

const MAX_DIFF_LINES = 3000;

function computeDiff(content: string, toolName: string, args: Record<string, unknown>): { added_lines?: number; removed_lines?: number } | null {
  // Skip large files — too expensive for ToolCard display
  if (content.length > 200_000 || content.split("\n").length > MAX_DIFF_LINES) return null;


  // For edit: use old_string / new_string from args to compute real line diff
  if (toolName === "edit") {
    const oldStr = (args.old_string as string) ?? "";
    const newStr = (args.new_string as string) ?? "";
    if (oldStr || newStr) {
      const oldLines = oldStr.split("\n");
      const newLines = newStr.split("\n");
      const oldSet = new Set(oldLines);
      const newSet = new Set(newLines);
      const added = newLines.filter((l) => !oldSet.has(l)).length;
      const removed = oldLines.filter((l) => !newSet.has(l)).length;
      if (added > 0 || removed > 0) return { added_lines: added, removed_lines: removed };
    }
    return null;
  }

  // For write: try to detect diff from content if present, otherwise use byte change
  if (toolName === "write") {
    const added = (content.match(/^\+[^+]/gm) || []).length;
    const removed = (content.match(/^-[^-]/gm) || []).length;
    if (added > 0 || removed > 0) return { added_lines: added, removed_lines: removed };
    // Fallback: no diff data available
    return null;
  }

  return null;
}

function findTargetFiles(problem: string): string[] {
  const files: string[] = [];
  const patterns = [
    /(?:src|lib|app|tests?|packages)\/[\w.\-/]+\.\w{1,4}/g,
    /([\w.-]+\.(?:ts|tsx|js|jsx|py))/g,
  ];
  for (const p of patterns) {
    for (const m of problem.matchAll(p)) {
      if (m[1]) files.push(m[1]);
      else if (m[0]) files.push(m[0]);
    }
  }
  return [...new Set(files)].slice(0, 10);
}

function previewText(value: string, max: number): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, Math.max(0, max - 1))}…`;
}

function replaceDirectiveSection(raw: string, heading: string, content: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(##\\s+${escaped}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  if (!regex.test(raw)) return raw;
  return raw.replace(regex, `$1${content.trim()}\n`);
}

// ============================================================
// Gate helpers
// ============================================================

function buildGateContext(
  directive: string,
  mode: PEANMode,
  assessResult: AutoAssessResult | null,
  state: ModeState,
  problem: string,
  scopeContract?: import("../types.js").ScopeContract,
): GateContext {
  const parsed = directive ? sanitizeDirectiveForProblem(parseDirective(directive), problem) : null;
  return {
    directive: parsed,
    mode,
    projectRoot: process.cwd(),
    probeCompleted: state.probe_verify_done,
    verifierVerdict: state.probe_verify_done
      ? (state.revision_count > 0 ? "needs_revision" : "clean")
      : null,
    revisionCount: state.revision_count,
    maxRevisions: state.max_revisions,
    needProbe: assessResult?.need_probe ?? null,
    problemText: problem,
    targetFiles: findTargetFiles(problem),
    scopeContract,
  };
}

async function findRelevantFiles(problem: string): Promise<string[]> {
  // Extract potential file paths from problem text using simple patterns
  const patterns = [
    /(?:src|lib|tests?)\/[\w.\-/]+\.(?:ts|tsx|js|jsx|py|go|rs)/g,
    /(?:[\w.-]+\.(?:ts|tsx|js|jsx|py))/g,
  ];
  const files = new Set<string>();
  for (const pattern of patterns) {
    for (const match of problem.matchAll(pattern)) {
      files.add(match[0]);
    }
  }
  return [...files].slice(0, 5); // limit to 5 most relevant
}

// Signal monitor for runtime control plane
function checkTradeoffSignals(
  gateData: { gateEvents: string[]; mode: string; problem: string; cacheHitValues: number[] },
  graph?: import("../graph/types.js").ReviewGraph,
  onTradeoffRequired?: boolean,
): { evidence: import("../types.js").TradeoffEvidence; options: import("../types.js").TradeoffOption[] } | null {
  if (!onTradeoffRequired) return null;
  if (gateData.mode !== "memory") return null;

  // Signal 1: gate events >= 3
  const gateFrequent = gateData.gateEvents.length >= 3;

  // Signal 2: cache hit declining (last 3 values decreasing)
  const recentCache = gateData.cacheHitValues.slice(-4);
  let cacheDeclining = false;
  if (recentCache.length >= 3) {
    const last3 = recentCache.slice(-3);
    cacheDeclining = last3[0]! > last3[1]! && last3[1]! > last3[2]!;
  }

  // Signal 3: graph findings for project files
  let graphFindings: Array<{ file: string; description: string }> = [];
  if (graph) {
    for (const node of Object.values(graph.nodes)) {
      if (node.type === "gate_event" || node.type === "review_finding") {
        const n = node as any;
        if (n.reason || n.description) {
          graphFindings.push({ file: n.filePath ?? "unknown", description: n.reason ?? n.description ?? "" });
        }
      }
    }
  }
  const graphRisky = graphFindings.length > 0;

  // Need 2 of 3 signals to trigger tradeoff
  const activeSignals: string[] = [];
  if (gateFrequent) activeSignals.push("gate_frequency");
  if (cacheDeclining) activeSignals.push("cache_declining");
  if (graphRisky) activeSignals.push("graph_history");

  if (activeSignals.length < 2) return null;

  const evidence: import("../types.js").TradeoffEvidence = {
    gateCount: gateData.gateEvents.length,
    cacheTrend: cacheDeclining ? "declining" : "stable",
    cacheHitValues: [...gateData.cacheHitValues],
    graphFindings: graphFindings.slice(0, 5),
    activeSignals,
  };

  const options: import("../types.js").TradeoffOption[] = [
    { id: "A", label: "Continue Memory", description: `Fast path. ${gateData.gateEvents.length} gate events so far. Risk accepted.`, mode: "memory" },
    { id: "B", label: "Upgrade to Probe", description: "Full wire-level verification. +2-3 API calls. Recommended for boundary/serialization tasks.", mode: "probe" },
    { id: "C", label: "Pause for Review", description: "Stop and let user review scope, red flags, and constraints before continuing.", mode: "pause" },
  ];

  return { evidence, options };
}

function safeParseArgs(args: string): Record<string, unknown> {
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}


// P58: Extract tags from problem text and scope contract
function extractTags(problem: string, scopeContract?: import("../types.js").ScopeContract): string[] {
  const tags: string[] = [];
  const lower = problem.toLowerCase();
  if (/fix|bug|patch|repair/i.test(lower)) tags.push("bugfix");
  if (/implement|add|create|feature/i.test(lower)) tags.push("feature");
  if (/refactor|rewrite|restructure/i.test(lower)) tags.push("refactor");
  if (/test|spec|assert/i.test(lower)) tags.push("test");
  if (scopeContract?.editableScope) {
    for (const f of scopeContract.editableScope) {
      const ext = f.split(".").pop();
      if (ext) tags.push(ext);
      const name = f.split("/").pop()?.split(".")[0];
      if (name) tags.push(name);
    }
  }
  return [...new Set(tags)];
}
