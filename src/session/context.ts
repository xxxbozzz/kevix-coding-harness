// Session context management — token budgeting and history persistence

import type { ChatMessage, TokenUsage, PEANMode, PEANPhase } from "../types.js";

export interface SessionRecord {
  sessionId: string;
  taskId: string;
  mode: PEANMode;
  phasesCompleted: PEANPhase[];
  messages: ChatMessage[];
  tokenUsage: TokenUsage;
  createdAt: number;
  completedAt: number | null;
}

// ============================================================
// Token budget estimates (DeepSeek approximate)
// ============================================================
// DeepSeek V4 has ~128K context window.
// We budget conservatively to leave room for completions.

const MAX_CONTEXT_TOKENS = 100_000;
const TOKENS_PER_CHAR_ESTIMATE = 0.25; // rough: 4 chars ≈ 1 token

export function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR_ESTIMATE);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => {
    let t = estimateTokens(m.content ?? "");
    if (m.tool_calls) {
      t += estimateTokens(JSON.stringify(m.tool_calls));
    }
    return sum + t;
  }, 0);
}

export function isNearContextLimit(sessionTokens: number): boolean {
  return sessionTokens > MAX_CONTEXT_TOKENS * 0.85;
}

// ============================================================
// In-memory session store
// ============================================================

const sessions = new Map<string, SessionRecord>();

export function createSessionRecord(
  sessionId: string,
  taskId: string,
  mode: PEANMode,
): SessionRecord {
  const record: SessionRecord = {
    sessionId,
    taskId,
    mode,
    phasesCompleted: [],
    messages: [],
    tokenUsage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 0,
      total_tokens: 0,
      cache_hit_ratio: 0,
    },
    createdAt: Date.now(),
    completedAt: null,
  };
  sessions.set(sessionId, record);
  return record;
}

export function getSessionRecord(sessionId: string): SessionRecord | undefined {
  return sessions.get(sessionId);
}

export function completeSessionRecord(sessionId: string): void {
  const record = sessions.get(sessionId);
  if (record) {
    record.completedAt = Date.now();
  }
}

export function listSessions(): SessionRecord[] {
  return Array.from(sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
}
