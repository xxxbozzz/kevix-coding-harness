// P57: MemoryStore tests

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../src/memory/store.js";
import { createStubDistiller } from "../src/memory/distiller.js";
import type { MemoryRecord, CapabilityCard } from "../src/memory/types.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";

const TEST_DB = "/tmp/kevix-test-memory.json";

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    taskId: "task-1",
    taskText: "fix bug in src/foo.ts",
    mode: "memory",
    scopeContract: {
      editableScope: ["src/foo.ts"],
      readOnlyEvidence: ["test/foo.test.ts"],
      successChecks: ["npm test"],
    },
    outcome: {
      scopeRespected: true,
      scopeExpansionRequests: 0,
      expandedScope: [],
      filesChanged: ["src/foo.ts"],
      testsPassed: true,
      reviewVerdict: "PASS",
      escalated: false,
    },
    cost: { promptTokens: 1000, completionTokens: 300, cacheHitRatio: 85, requestCount: 4 },
    gateEvents: [],
    phasesCompleted: ["controller", "worker"],
    ...overrides,
  };
}

function makeCard(overrides: Partial<CapabilityCard> = {}): CapabilityCard {
  return {
    id: "src/foo.ts::bugfix",
    file: "src/foo.ts",
    taskCategory: "bugfix",
    summary: "Basic bugfix in foo.ts — memory mode sufficient",
    recommendedMode: "memory",
    successRate: 0.9,
    recordCount: 5,
    commonFailureModes: ["null check missing"],
    lastUpdated: new Date().toISOString(),
    distilledFrom: ["rec-1", "rec-2"],
    ...overrides,
  };
}

describe("MemoryStore", () => {
  beforeEach(() => {
    try { rmSync(TEST_DB, { force: true }); } catch {}
  });

  it("saves and loads records", () => {
    const store = new MemoryStore(TEST_DB);
    const r1 = makeRecord({ id: "rec-1", taskText: "fix foo" });
    const r2 = makeRecord({ id: "rec-2", taskText: "fix bar", mode: "probe" });

    store.saveRecord(r1);
    store.saveRecord(r2);

    expect(store.recordCount()).toBe(2);

    // Reload from disk
    const store2 = new MemoryStore(TEST_DB);
    expect(store2.recordCount()).toBe(2);
    expect(store2.allRecords()[0]!.id).toBe("rec-1");
    expect(store2.allRecords()[1]!.id).toBe("rec-2");
  });

  it("queries records by file in editableScope", () => {
    const store = new MemoryStore(TEST_DB);
    store.saveRecord(makeRecord({
      id: "rec-1",
      scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: [], successChecks: [] },
    }));
    store.saveRecord(makeRecord({
      id: "rec-2",
      scopeContract: { editableScope: ["src/bar.ts"], readOnlyEvidence: [], successChecks: [] },
      outcome: { ...makeRecord().outcome, filesChanged: ["src/bar.ts"] },
    }));

    const results = store.queryRecords({ file: "foo" });
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("rec-1");
  });

  it("queries records by file in filesChanged", () => {
    const store = new MemoryStore(TEST_DB);
    store.saveRecord(makeRecord({
      id: "rec-3",
      outcome: { ...makeRecord().outcome, filesChanged: ["src/baz.ts"] },
    }));

    const results = store.queryRecords({ file: "baz" });
    expect(results.length).toBe(1);
  });

  it("queries records by mode", () => {
    const store = new MemoryStore(TEST_DB);
    store.saveRecord(makeRecord({ id: "rec-m", mode: "memory" }));
    store.saveRecord(makeRecord({ id: "rec-p", mode: "probe" }));

    expect(store.queryRecords({ mode: "probe" }).length).toBe(1);
    expect(store.queryRecords({ mode: "memory" }).length).toBe(1);
  });

  it("queries records by since timestamp", () => {
    const store = new MemoryStore(TEST_DB);
    const old = makeRecord({ id: "old", timestamp: "2026-01-01T00:00:00Z" });
    const recent = makeRecord({ id: "recent", timestamp: "2026-06-01T00:00:00Z" });
    store.saveRecord(old);
    store.saveRecord(recent);

    const results = store.queryRecords({ since: "2026-03-01T00:00:00Z" });
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("recent");
  });

  it("limits query results", () => {
    const store = new MemoryStore(TEST_DB);
    for (let i = 0; i < 10; i++) {
      store.saveRecord(makeRecord({ id: `rec-${i}` }));
    }
    expect(store.queryRecords({ limit: 3 }).length).toBe(3);
  });

  it("saves and upserts cards by id", () => {
    const store = new MemoryStore(TEST_DB);
    const card1 = makeCard({ id: "src/foo.ts::bugfix", recordCount: 3 });

    store.saveCard(card1);
    expect(store.cardCount()).toBe(1);

    // Upsert: same id, updated data
    const card2 = makeCard({ id: "src/foo.ts::bugfix", recordCount: 7, summary: "Updated" });
    store.saveCard(card2);
    expect(store.cardCount()).toBe(1);
    expect(store.allCards()[0]!.recordCount).toBe(7);
    expect(store.allCards()[0]!.summary).toBe("Updated");
  });

  it("queries cards by file", () => {
    const store = new MemoryStore(TEST_DB);
    store.saveCard(makeCard({ id: "a::bugfix", file: "src/a.ts" }));
    store.saveCard(makeCard({ id: "b::bugfix", file: "src/b.ts" }));

    expect(store.queryCards({ file: "a.ts" }).length).toBe(1);
  });

  it("queries cards by taskCategory", () => {
    const store = new MemoryStore(TEST_DB);
    store.saveCard(makeCard({ id: "a::bugfix", taskCategory: "bugfix" }));
    store.saveCard(makeCard({ id: "a::refactor", taskCategory: "refactor" }));

    expect(store.queryCards({ taskCategory: "bugfix" }).length).toBe(1);
    expect(store.queryCards({ taskCategory: "refactor" }).length).toBe(1);
  });

  it("starts empty when file does not exist", () => {
    const store = new MemoryStore("/tmp/kevix-nonexistent-test.json");
    expect(store.recordCount()).toBe(0);
    expect(store.cardCount()).toBe(0);
  });

  it("static load returns empty for missing file", () => {
    const data = MemoryStore.load("/tmp/kevix-totally-missing.json");
    expect(data.records).toEqual([]);
    expect(data.cards).toEqual([]);
  });
});

describe("Distiller stub", () => {
  it("creates stub distiller and returns placeholder card", async () => {
    const distiller = createStubDistiller();
    const result = await distiller.distill({
      records: [makeRecord({ id: "rec-1" }), makeRecord({ id: "rec-2" })],
      file: "src/foo.ts",
      taskCategory: "bugfix",
    });

    expect(result.card.id).toBe("src/foo.ts::bugfix");
    expect(result.card.file).toBe("src/foo.ts");
    expect(result.card.summary).toBe("(pending distillation)");
    expect(result.card.recordCount).toBe(2);
    expect(result.card.distilledFrom).toEqual(["rec-1", "rec-2"]);
  });
});
