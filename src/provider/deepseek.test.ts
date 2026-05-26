// Tests for DeepSeekProvider streaming SSE parsing — covers parse-error logging & stream integrity

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeepSeekProvider } from "./deepseek.js";

function createMockFetch(streamBody: string, status = 200) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(streamBody));
      controller.close();
    },
  });

  return vi.fn().mockResolvedValue({
    ok: status === 200,
    status,
    statusText: status === 200 ? "OK" : "Error",
    body: stream,
    text: async () => streamBody,
  });
}

describe("DeepSeekProvider stream SSE parsing", () => {
  let provider: DeepSeekProvider;
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new DeepSeekProvider("sk-test-key");
    warnSpy = vi.fn();
    console.warn = warnSpy;
  });

  it("emits warning log on unparseable SSE line but continues delivering valid events", async () => {
    // Build a stream with a valid event, a malformed line, and another valid event
    const validLine1 = 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n';
    const malformedLine = "data: {broken json!!!!}\n\n";
    const validLine2 = 'data: {"choices":[{"delta":{"content":"world"}}]}\n\n';
    const doneLine = "data: [DONE]\n\n";

    const streamBody = validLine1 + malformedLine + validLine2 + doneLine;
    globalThis.fetch = createMockFetch(streamBody);

    const events: Array<{ content?: string }> = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", content: "test" }],
    })) {
      events.push(event);
    }

    // Both valid events must be delivered
    expect(events).toHaveLength(2);
    expect(events[0]!.content).toBe("hello");
    expect(events[1]!.content).toBe("world");

    // Warning must have been emitted exactly once with the safe message
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("SSE parse error: non-critical (SyntaxError)");

    // Sensitive data safety: no raw SSE fragments in the log call
    const loggedArgs = warnSpy.mock.calls.flat().join(" ");
    expect(loggedArgs).not.toContain("{broken json");
    expect(loggedArgs).not.toContain("data:");
    expect(loggedArgs).not.toContain('{"choices"');
  });

  it("does not emit warning when all SSE lines are valid", async () => {
    const validLine = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n';
    const doneLine = "data: [DONE]\n\n";

    globalThis.fetch = createMockFetch(validLine + doneLine);

    const events: Array<{ content?: string }> = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", content: "test" }],
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("emits one warning per malformed line (multiple failures)", async () => {
    const malformed1 = "data: {oops}\n\n";
    const malformed2 = "data: {another fail}\n\n";
    const valid = 'data: {"choices":[{"delta":{"content":"survived"}}]}\n\n';
    const done = "data: [DONE]\n\n";

    globalThis.fetch = createMockFetch(malformed1 + malformed2 + valid + done);

    const events: Array<{ content?: string }> = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", content: "test" }],
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]!.content).toBe("survived");
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith("SSE parse error: non-critical (SyntaxError)");
  });
});
