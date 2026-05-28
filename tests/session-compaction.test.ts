import { describe, it, expect } from "vitest";
import { compactSession, ensureContextFit, estimateMessagesTokens } from "../src/session/context.js";

function msg(role: "system" | "user" | "assistant", content: string): any {
  return { role, content };
}

describe("session compaction", () => {
  it("keeps all messages when under limit", () => {
    const messages = [msg("system", "sys"), msg("user", "hi"), msg("assistant", "hey")];
    expect(compactSession(messages)).toEqual(messages);
  });

  it("compacts when too many messages", () => {
    const messages = [
      msg("system", "sys"),
      msg("user", "1"), msg("assistant", "2"),
      msg("user", "3"), msg("assistant", "4"),
      msg("user", "5"), msg("assistant", "6"),
      msg("user", "7"), msg("assistant", "8"),
      msg("user", "9"), msg("assistant", "10"),
      msg("user", "latest"),
    ];
    const result = compactSession(messages, 4);
    expect(result[0]!.role).toBe("system");
    expect(result.length).toBeLessThan(messages.length);
    expect(result[result.length - 1]!.content).toBe("latest");
  });

  it("preserves system message as first", () => {
    const messages = [msg("system", "important"), msg("user", "old"), msg("user", "new")];
    const result = compactSession(messages, 1);
    expect(result[0]!.role).toBe("system");
    expect(result[0]!.content).toBe("important");
    expect(result.length).toBe(2);
  });

  it("ensureContextFit compacts when over threshold", () => {
    // Build a large set of messages
    const bigContent = "x".repeat(50000);
    const messages = [msg("system", "sys"), msg("user", bigContent), msg("user", bigContent)];
    const { compacted } = ensureContextFit(messages, 1000); // tiny threshold
    expect(compacted).toBe(true);
  });

  it("ensureContextFit does not compact when under threshold", () => {
    const messages = [msg("system", "sys"), msg("user", "hi")];
    const { compacted } = ensureContextFit(messages);
    expect(compacted).toBe(false);
  });
});
