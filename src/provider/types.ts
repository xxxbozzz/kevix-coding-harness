// DeepSeek provider-specific types
// Based on DeepSeek API docs: https://api-docs.deepseek.com/

import type { ChatMessage, ToolDefinition, ToolCall, TokenUsage } from "../types.js";
import { ProviderError } from "../errors.js";

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const DEFAULT_DEEPSEEK_CONFIG: Omit<DeepSeekConfig, "apiKey"> = {
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-v4-pro",
};

// DeepSeek chat completion request (OpenAI-compatible)
export interface DeepSeekRequest {
  model: string;
  messages: {
    role: string;
    content: string | null;
    tool_calls?: {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }[];
    tool_call_id?: string;
    name?: string;
  }[];
  tools?: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: "json_object" } | { type: "text" };
}

// DeepSeek chat completion response (OpenAI-compatible)
export interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
      // DeepSeek-specific: R1-style reasoning
      reasoning_content?: string;
    };
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    // DeepSeek-specific cache metrics
    prompt_cache_hit_tokens: number;
    prompt_cache_miss_tokens: number;
  };
}

// Normalize DeepSeek response to engine types
export function normalizeResponse(resp: DeepSeekResponse): {
  message: ChatMessage;
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  usage: TokenUsage;
} {
  if (!resp.choices || resp.choices.length === 0) {
    throw new ProviderError('AI response returned no choices');
  }
  if (!resp.choices[0]?.message) {
    throw new ProviderError('Missing message in first choice');
  }
  const choice = resp.choices[0]!;
  const msg = choice.message;
  const usage = resp.usage;

  const cache_hit = usage.prompt_cache_hit_tokens ?? 0;
  const cache_miss = usage.prompt_cache_miss_tokens ?? 0;
  const prompt = usage.prompt_tokens;

  return {
    message: {
      role: "assistant",
      content: msg.content,
      tool_calls: msg.tool_calls?.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      reasoning_content: msg.reasoning_content,
    },
    finish_reason: choice.finish_reason,
    usage: {
      prompt_tokens: prompt,
      completion_tokens: usage.completion_tokens,
      prompt_cache_hit_tokens: cache_hit,
      prompt_cache_miss_tokens: cache_miss,
      total_tokens: usage.total_tokens,
      cache_hit_ratio: prompt > 0 ? Math.round((cache_hit / prompt) * 10000) / 100 : 0,
    },
  };
}

// Build DeepSeek request from engine types
export function buildRequest(params: {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" } | { type: "text" };
}): DeepSeekRequest {
  return {
    model: params.model,
    messages: params.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.name ? { name: m.name } : {}),
      ...(m.reasoning_content ? { reasoning_content: m.reasoning_content } : {}),
    })),
    ...(params.tools ? { tools: params.tools } : {}),
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.max_tokens ? { max_tokens: params.max_tokens } : {}),
    ...(params.response_format ? { response_format: params.response_format } : {}),
    stream: false,
  };
}
