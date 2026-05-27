// @kevix/engine — DeepSeek-Native PEAN Harness Engine
// ===============================================================

export { DeepSeekProvider } from "./provider/deepseek.js";
export type { DeepSeekConfig } from "./provider/types.js";

export { runAgentLoop } from "./loop/agent-loop.js";
export type { AgentLoopOptions, LLMProvider, ToolExecutor } from "./loop/agent-loop.js";

export {
  createModeState,
  nextPhase,
  stepPhase,
  parseDirective,
  validateDirective,
} from "./pean/mode-router.js";
export type { ModeState } from "./pean/mode-router.js";

export {
  extractPatch,
  extractJson,
  extractJsonArray,
} from "./pean/prompts.js";

export { runQuickCheck } from "./pean/test-utils.js";

export { measure } from "./pean/perf.js";

export { recommendModeFromWiki } from "./graph/memory-wiki.js";
export type {
  WikiRoutingConfidence,
  WikiRoutingDecision,
  WikiRoutingEvidence,
} from "./graph/memory-wiki.js";

export {
  createSession,
  buildMessages,
  appendUserMessage,
  CONTROLLER_SYSTEM,
  WORKER_SYSTEM,
  PROBE_PLAN_SYSTEM,
  PROBE_VERIFY_SYSTEM,
  AUTO_ASSESS_SYSTEM,
} from "./provider/pean-system.js";
export type { SessionMessages } from "./provider/pean-system.js";

export {
  createSessionRecord,
  getSessionRecord,
  completeSessionRecord,
  listSessions,
  estimateTokens,
  isNearContextLimit,
} from "./session/context.js";
export type { SessionRecord } from "./session/context.js";

// Tools
export { bashDefinition, executeBash } from "./tools/bash.js";
export { readDefinition, executeRead } from "./tools/read.js";
export { writeDefinition, executeWrite } from "./tools/write.js";
export { editDefinition, executeEdit } from "./tools/edit.js";
export { grepDefinition, executeGrep } from "./tools/grep.js";
export { globDefinition, executeGlob } from "./tools/glob.js";

// Types
export type * from "./types.js";

// ====================================================================
// Quick start helper
// ====================================================================

import { DeepSeekProvider } from "./provider/deepseek.js";
import { runAgentLoop } from "./loop/agent-loop.js";
import { bashDefinition, executeBash } from "./tools/bash.js";
import { readDefinition, executeRead } from "./tools/read.js";
import { writeDefinition, executeWrite } from "./tools/write.js";
import { editDefinition, executeEdit } from "./tools/edit.js";
import { grepDefinition, executeGrep } from "./tools/grep.js";
import { globDefinition, executeGlob } from "./tools/glob.js";
import type { ToolDefinition, ToolCall, ToolResult, PEANMode, EngineEvent } from "./types.js";

const DEFAULT_TOOLS = [
  bashDefinition, readDefinition, writeDefinition,
  editDefinition, grepDefinition, globDefinition,
];

const TOOL_EXECUTORS: Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> = {
  bash: executeBash,
  read: executeRead,
  write: executeWrite,
  edit: executeEdit,
  grep: executeGrep,
  glob: executeGlob,
};

export interface QuickStartOptions {
  apiKey: string;
  model?: string;
  mode?: PEANMode;
  problem: string;
  hints?: string;
  taskId?: string;
  onEvent?: (event: EngineEvent) => void;
}

export async function quickStart(options: QuickStartOptions) {
  const { apiKey, problem, hints, onEvent } = options;
  const mode = options.mode ?? "auto";
  const taskId = options.taskId ?? `task-${Date.now()}`;

  const provider = new DeepSeekProvider(apiKey, {
    model: options.model ?? "deepseek-v4-pro",
  });

  const toolExecutor = {
    definitions: DEFAULT_TOOLS as ToolDefinition[],
    async execute(call: ToolCall): Promise<ToolResult> {
      const fn = TOOL_EXECUTORS[call.function.name];
      if (!fn) {
        return {
          tool_call_id: call.id,
          content: `Unknown tool: ${call.function.name}`,
          is_error: true,
        };
      }
      try {
        const args = JSON.parse(call.function.arguments);
        return await fn(args);
      } catch (e) {
        return {
          tool_call_id: call.id,
          content: `Tool error: ${(e as Error).message}`,
          is_error: true,
        };
      }
    },
  };

  return runAgentLoop({
    provider,
    tools: toolExecutor,
    mode,
    problem,
    hints,
    taskId,
    onEvent,
  });
}
