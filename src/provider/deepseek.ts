// DeepSeek API provider with prefix-cache aware client
// Respects DeepSeek's automatic prefix-cache: keeps system prompt immutable,
// appends user/assistant messages at the end only.

import type { ChatMessage, ToolDefinition, LLMResponse, TokenUsage } from "../types.js";
import { ProviderError } from "../errors.js";
import {
  type DeepSeekConfig,
  type DeepSeekRequest,
  type DeepSeekResponse,
  DEFAULT_DEEPSEEK_CONFIG,
  normalizeResponse,
  buildRequest,
} from "./types.js";

export class DeepSeekProvider {
  readonly config: DeepSeekConfig;
  // Accumulated usage across all calls in this provider instance
  totalUsage: TokenUsage;

  constructor(apiKey: string, overrides?: Partial<DeepSeekConfig>) {
    this.config = { ...DEFAULT_DEEPSEEK_CONFIG, apiKey, ...overrides };
    this.totalUsage = emptyUsage();
  }

  /** Core API call — non-streaming, with retry on network errors */
  async call(params: {
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" } | { type: "text" };
  }, retries = 3): Promise<LLMResponse> {
    const request: DeepSeekRequest = buildRequest({
      model: this.config.model,
      ...params,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const startTime = Date.now();
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(120_000), // 2min timeout per attempt
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          const status = response.status;

          // Retry on server errors (5xx) and rate limits (429)
          if ((status >= 500 || status === 429) && attempt < retries - 1) {
            await sleep(backoff(attempt));
            continue;
          }

          throw new ProviderError(
            `DeepSeek API error ${status}: ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 200)}` : ""}`,
            status,
            errorBody,
          );
        }

        const data = (await response.json()) as DeepSeekResponse;
        const result = normalizeResponse(data);
        this.totalUsage = accumulateUsage(this.totalUsage, result.usage);
        return result;

      } catch (e: any) {
        lastError = e;

        // Retry on network errors (not ProviderError)
        if (e instanceof ProviderError) throw e;
        if (attempt < retries - 1) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new ProviderError(
          `DeepSeek API unreachable after ${retries} attempts: ${e.message || "unknown error"}`,
          undefined,
          e.message,
        );
      }
    }

    throw lastError ?? new ProviderError("DeepSeek API call failed");
  }

  /** Streaming call — yields deltas for real-time UI */
  async *stream(params: {
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    temperature?: number;
    max_tokens?: number;
  }): AsyncGenerator<{
    content?: string;
    reasoning_content?: string;
    tool_calls?: Record<number, { name: string; arguments: string }>;
    finish_reason?: string;
    usage?: TokenUsage;
  }> {
    const request = buildRequest({
      model: this.config.model,
      ...params,
    });
    request.stream = true;

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new ProviderError(
        `DeepSeek API stream error ${response.status}: ${response.statusText} — ${errorBody.slice(0, 200)}`,
        response.status,
        errorBody,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    const pendingToolCalls: Record<number, { name: string; arguments: string }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          const event: Record<string, unknown> = {};

          if (delta.content) event.content = delta.content;
          if (delta.reasoning_content) event.reasoning_content = delta.reasoning_content;

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!pendingToolCalls[idx]) {
                pendingToolCalls[idx] = { name: "", arguments: "" };
              }
              if (tc.function?.name) pendingToolCalls[idx]!.name = tc.function.name;
              if (tc.function?.arguments) pendingToolCalls[idx]!.arguments += tc.function.arguments;
            }
            event.tool_calls = { ...pendingToolCalls };
          }

          if (parsed.choices?.[0]?.finish_reason) {
            event.finish_reason = parsed.choices[0].finish_reason;
          }

          if (parsed.usage) {
            event.usage = normalizeResponse({ ...parsed, choices: parsed.choices || [] } as unknown as DeepSeekResponse).usage;
          }

          yield event as {
            content?: string;
            reasoning_content?: string;
            tool_calls?: Record<number, { name: string; arguments: string }>;
            finish_reason?: string;
            usage?: TokenUsage;
          };
        } catch (error) {
          // Skip unparseable SSE line (non-critical)
          console.warn(`SSE parse error: non-critical (${(error as any)?.constructor?.name || 'unknown'})`);
        }
      }
    }
  }

  /** Reset accumulated usage (e.g., between tasks) */
  resetUsage(): void {
    this.totalUsage = emptyUsage();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30_000); // 1s, 2s, 4s, max 30s
}

function emptyUsage(): TokenUsage {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0,
    total_tokens: 0,
    cache_hit_ratio: 0,
  };
}

function accumulateUsage(prev: TokenUsage, next: TokenUsage): TokenUsage {
  const hit = prev.prompt_cache_hit_tokens + next.prompt_cache_hit_tokens;
  const miss = prev.prompt_cache_miss_tokens + next.prompt_cache_miss_tokens;
  const total = hit + miss;
  return {
    prompt_tokens: prev.prompt_tokens + next.prompt_tokens,
    completion_tokens: prev.completion_tokens + next.completion_tokens,
    prompt_cache_hit_tokens: hit,
    prompt_cache_miss_tokens: miss,
    total_tokens: prev.total_tokens + next.total_tokens,
    cache_hit_ratio: total > 0 ? Math.round((hit / total) * 10000) / 100 : 0,
  };
}
