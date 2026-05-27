// P57: SandboxStore tests — TTL, purge, WikiSkill persistence

import { describe, it, expect, beforeEach } from "vitest";
import { SandboxStore } from "../src/memory/store.js";
import { createStubDistiller } from "../src/memory/distiller.js";
import { computeExpiresAt, SANDBOX_TTL_MS } from "../src/memory/types.js";
import type { RawMemoryRecord, WikiSkill } from "../src/memory/types.js";
import { rmSync } from "node:fs";

const TEST_DB = "/tmp/kevix-sandbox-test.json";

function makeRecord(overrides: Partial<RawMemoryRecord> = {}): RawMemoryRecord {
  const now = new Date();
  return {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: "task-1",
    projectId: "test-project",
    createdAt: now.toISOString(),
    expiresAt: computeExpiresAt(now),
    problem: "fix bug in src/foo.ts",
    mode: "memory",
    scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: ["test/foo.test.ts"], successChecks: ["npm test"] },
    phases: ["controller", "worker"],
    toolTimeline: [],
    gateEvents: [],
    reviewFindings: [],
    outcome: { scopeRespected: true, scopeExpansionRequests: 0, expandedScope: [], filesChanged: ["src/foo.ts"], testsPassed: true, reviewVerdict: "PASS", escalated: false },
    tags: ["bugfix", "foo"],
    ...overrides,
  };
}

function makeSkill(overrides: Partial<WikiSkill> = {}): WikiSkill {
  const now = new Date().toISOString();
  return {
    id: "null-check::src/foo.ts",
    title: "Null check pattern in foo.ts",
    problemClass: "null-check",
    triggers: ["TypeError", "null", "undefined"],
    recommendedMode: "memory",
    requiredEvidence: ["test/foo.test.ts"],
    editableScopeHints: ["src/foo.ts"],
    readOnlyEvidenceHints: ["test/foo.test.ts"],
    successCheckHints: ["npm test"],
    playbook: "1. Read test 2. Add null guard 3. Run npm test",
    commonFailureModes: ["forgetting optional chaining"],
    verificationChecklist: ["npm test passes", "no new TypeError"],
    sourceMemoryIds: ["rec-1", "rec-2"],
    successRate: 0.9,
    recordCount: 5,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("SandboxStore — records & TTL", () => {
  beforeEach(() => { try { rmSync(TEST_DB, { force: true }); } catch {} });

  it("saves record with auto-computed expiresAt (default 3 days)", () => {
    const store = new SandboxStore(TEST_DB);
    const now = new Date();
    const r = makeRecord({ createdAt: now.toISOString(), expiresAt: computeExpiresAt(now) });
    store.saveRecord(r);

    const all = store.allRecords();
    expect(all.length).toBe(1);
    const expires = new Date(all[0]!.expiresAt).getTime();
    const created = new Date(all[0]!.createdAt).getTime();
    expect(expires - created).toBe(SANDBOX_TTL_MS);
  });

  it("save/load round-trip preserves records", () => {
    const s1 = new SandboxStore(TEST_DB);
    s1.saveRecord(makeRecord({ id: "rec-a" }));
    s1.saveRecord(makeRecord({ id: "rec-b" }));

    const s2 = new SandboxStore(TEST_DB);
    expect(s2.recordCount()).toBe(2);
    expect(s2.allRecords()[0]!.id).toBe("rec-a");
  });

  it("queries records by file", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveRecord(makeRecord({ id: "r1", scopeContract: { editableScope: ["src/a.ts"], readOnlyEvidence: [], successChecks: [] } }));
    store.saveRecord(makeRecord({ id: "r2", scopeContract: { editableScope: ["src/b.ts"], readOnlyEvidence: [], successChecks: [] }, outcome: { ...makeRecord().outcome, filesChanged: ["src/b.ts"] } }));

    expect(store.queryRecords({ file: "a.ts" }).length).toBe(1);
    expect(store.queryRecords({ file: "b.ts" }).length).toBe(1);
  });

  it("queries records by mode", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveRecord(makeRecord({ id: "rm", mode: "memory" }));
    store.saveRecord(makeRecord({ id: "rp", mode: "probe" }));
    expect(store.queryRecords({ mode: "probe" }).length).toBe(1);
  });
});

describe("SandboxStore — purgeExpired", () => {
  beforeEach(() => { try { rmSync(TEST_DB, { force: true }); } catch {} });

  it("purges records past their expiresAt", () => {
    const store = new SandboxStore(TEST_DB);
    const past = new Date(Date.now() - 10 * 24 * 3600 * 1000); // 10 days ago
    store.saveRecord(makeRecord({
      id: "old",
      createdAt: past.toISOString(),
      expiresAt: computeExpiresAt(past, 1000), // 1 second TTL, long expired
    }));
    store.saveRecord(makeRecord({ id: "fresh" })); // default 3-day TTL

    const purged = store.purgeExpired();
    expect(purged).toBe(1);
    expect(store.recordCount()).toBe(1);
    expect(store.allRecords()[0]!.id).toBe("fresh");
  });

  it("does not purge records still within TTL", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveRecord(makeRecord({ id: "fresh" }));
    const purged = store.purgeExpired();
    expect(purged).toBe(0);
    expect(store.recordCount()).toBe(1);
  });

  it("does not purge WikiSkills (only records)", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveWikiSkill(makeSkill({ id: "skill-1" }));
    const past = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    store.saveRecord(makeRecord({ id: "old", createdAt: past.toISOString(), expiresAt: computeExpiresAt(past, 1000) }));

    store.purgeExpired();
    expect(store.recordCount()).toBe(0); // record purged
    expect(store.wikiSkillCount()).toBe(1); // skill survives
  });

  it("persists purge to disk", () => {
    const s1 = new SandboxStore(TEST_DB);
    const past = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    s1.saveRecord(makeRecord({ id: "old", createdAt: past.toISOString(), expiresAt: computeExpiresAt(past, 1000) }));
    s1.purgeExpired();

    const s2 = new SandboxStore(TEST_DB);
    expect(s2.recordCount()).toBe(0);
  });
});

describe("SandboxStore — WikiSkills", () => {
  beforeEach(() => { try { rmSync(TEST_DB, { force: true }); } catch {} });

  it("saves and queries wiki skills", () => {
    const store = new SandboxStore(TEST_DB);
    const skill = makeSkill({ id: "null-check::src/foo.ts", editableScopeHints: ["src/foo.ts"] });
    store.saveWikiSkill(skill);
    expect(store.wikiSkillCount()).toBe(1);
    expect(store.queryWikiSkills("foo.ts").length).toBe(1);
  });

  it("upserts wiki skill by id", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveWikiSkill(makeSkill({ id: "s1", title: "v1" }));
    store.saveWikiSkill(makeSkill({ id: "s1", title: "v2" }));
    expect(store.wikiSkillCount()).toBe(1);
    expect(store.allWikiSkills()[0]!.title).toBe("v2");
  });

  it("queryWikiSkills by trigger pattern", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveWikiSkill(makeSkill({ id: "s1", triggers: ["TypeError", "null"], editableScopeHints: ["src/x.ts"] }));
    store.saveWikiSkill(makeSkill({ id: "s2", triggers: ["SyntaxError"], editableScopeHints: ["src/y.ts"] }));

    expect(store.queryWikiSkills("TypeError").length).toBe(1);
    expect(store.queryWikiSkills("null").length).toBe(1);
  });

  it("skills persist across save/load", () => {
    const s1 = new SandboxStore(TEST_DB);
    s1.saveWikiSkill(makeSkill({ id: "persist-test" }));

    const s2 = new SandboxStore(TEST_DB);
    expect(s2.wikiSkillCount()).toBe(1);
  });
});

describe("Distiller stub", () => {
  it("returns empty skills array", async () => {
    const d = createStubDistiller();
    const result = await d.distill({ records: [], projectId: "test" });
    expect(result.skills).toEqual([]);
  });
});

describe("SandboxStore — P57.1 auto-set expiresAt", () => {
  beforeEach(() => { try { rmSync(TEST_DB, { force: true }); } catch {} });

  it("auto-sets expiresAt when not provided", () => {
    const store = new SandboxStore(TEST_DB);
    const now = new Date();
    store.saveRecord({
      ...makeRecord(),
      createdAt: now.toISOString(),
      expiresAt: "", // empty → auto-set
    } as RawMemoryRecord);

    const r = store.allRecords()[0]!;
    const expires = new Date(r.expiresAt).getTime();
    const created = new Date(r.createdAt).getTime();
    expect(expires - created).toBe(SANDBOX_TTL_MS);
  });

  it("preserves explicit expiresAt", () => {
    const store = new SandboxStore(TEST_DB);
    const now = new Date();
    const custom = new Date(now.getTime() + 1000).toISOString(); // 1 second TTL
    store.saveRecord(makeRecord({ createdAt: now.toISOString(), expiresAt: custom }));

    expect(store.allRecords()[0]!.expiresAt).toBe(custom);
  });
});

// ── P57.2 Working Layer ──

import type { WorkingDraft } from "../src/memory/types.js";

function makeDraft(overrides: Partial<WorkingDraft> = {}): WorkingDraft {
  const now = new Date();
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sessionId: "session-1",
    kind: "candidate",
    title: "Null check pattern",
    content: "Found pattern: missing null checks cause TypeError in foo.ts",
    sourceRecordIds: ["rec-1", "rec-2"],
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
    ...overrides,
  };
}

describe("SandboxStore — working/ layer", () => {
  beforeEach(() => { try { rmSync(TEST_DB, { force: true }); } catch {} });

  it("saves and queries drafts by sessionId", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveDraft(makeDraft({ id: "d1", sessionId: "s1" }));
    store.saveDraft(makeDraft({ id: "d2", sessionId: "s2" }));
    store.saveDraft(makeDraft({ id: "d3", sessionId: "s1" }));

    expect(store.draftCount()).toBe(3);
    expect(store.queryDrafts("s1").length).toBe(2);
    expect(store.queryDrafts("s2").length).toBe(1);
    expect(store.queryDrafts().length).toBe(3); // no filter → all
  });

  it("promotes candidate draft to wiki skill (draft removed)", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveDraft(makeDraft({ id: "d-cand", kind: "candidate" }));

    const skill = makeSkill({ id: "promoted-skill", sourceMemoryIds: ["rec-1"] });
    const ok = store.promoteToWiki("d-cand", skill);
    expect(ok).toBe(true);
    expect(store.draftCount()).toBe(0); // draft removed
    expect(store.wikiSkillCount()).toBe(1); // skill added
    expect(store.allWikiSkills()[0]!.id).toBe("promoted-skill");
  });

  it("promoteToWiki returns false for missing draft", () => {
    const store = new SandboxStore(TEST_DB);
    expect(store.promoteToWiki("nonexistent", makeSkill({}))).toBe(false);
  });

  it("discards a draft", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveDraft(makeDraft({ id: "d-discard" }));
    store.saveDraft(makeDraft({ id: "d-keep" }));

    expect(store.discardDraft("d-discard")).toBe(true);
    expect(store.draftCount()).toBe(1);
    expect(store.queryDrafts()[0]!.id).toBe("d-keep");
  });

  it("discardDraft returns false for missing draft", () => {
    const store = new SandboxStore(TEST_DB);
    expect(store.discardDraft("nope")).toBe(false);
  });

  it("purgeExpired cleans raw records AND expired working drafts, keeps wiki", () => {
    const store = new SandboxStore(TEST_DB);
    const past = new Date(Date.now() - 10 * 86400000);

    // Expired raw record
    store.saveRecord(makeRecord({
      id: "old-rec", createdAt: past.toISOString(),
      expiresAt: computeExpiresAt(past, 1000),
    }));
    // Fresh raw record
    store.saveRecord(makeRecord({ id: "fresh-rec" }));

    // Expired draft
    store.saveDraft(makeDraft({
      id: "old-draft", sessionId: "s1",
      createdAt: past.toISOString(),
      expiresAt: computeExpiresAt(past, 1000),
    }));
    // Fresh draft
    store.saveDraft(makeDraft({ id: "fresh-draft", sessionId: "s1" }));

    // Wiki skill (should survive)
    store.saveWikiSkill(makeSkill({ id: "skill-survives" }));

    const purged = store.purgeExpired();
    expect(purged).toBe(2); // 1 record + 1 draft
    expect(store.recordCount()).toBe(1);
    expect(store.draftCount()).toBe(1);
    expect(store.wikiSkillCount()).toBe(1); // wiki untouched
  });

  it("different draft kinds can coexist", () => {
    const store = new SandboxStore(TEST_DB);
    store.saveDraft(makeDraft({ id: "d1", kind: "summary" }));
    store.saveDraft(makeDraft({ id: "d2", kind: "cluster" }));
    store.saveDraft(makeDraft({ id: "d3", kind: "candidate" }));
    store.saveDraft(makeDraft({ id: "d4", kind: "failed_abstraction" }));

    expect(store.queryDrafts().length).toBe(4);
  });
});

describe("SandboxStore — P57.2b Draft TTL hardening", () => {
  beforeEach(() => { try { rmSync(TEST_DB, { force: true }); } catch {} });

  it("auto-sets draft expiresAt when not provided", () => {
    const store = new SandboxStore(TEST_DB);
    const now = new Date();
    store.saveDraft({
      id: "d-auto", sessionId: "s1", kind: "summary",
      title: "test", content: "test",
      sourceRecordIds: [],
      createdAt: now.toISOString(),
      expiresAt: "",
    } as WorkingDraft);

    const d = store.queryDrafts()[0]!;
    const expires = new Date(d.expiresAt).getTime();
    const created = new Date(d.createdAt).getTime();
    expect(expires - created).toBe(7 * 24 * 3600 * 1000);
  });

  it("preserves explicit draft expiresAt", () => {
    const store = new SandboxStore(TEST_DB);
    const now = new Date();
    const custom = new Date(now.getTime() + 1000).toISOString();
    store.saveDraft(makeDraft({ id: "d-custom", createdAt: now.toISOString(), expiresAt: custom }));

    expect(store.queryDrafts()[0]!.expiresAt).toBe(custom);
  });

  it("purgeExpired cleans auto-TTL drafts after expiry", () => {
    const store = new SandboxStore(TEST_DB);
    const past = new Date(Date.now() - 10 * 86400000);
    store.saveDraft(makeDraft({
      id: "d-old", sessionId: "s1",
      createdAt: past.toISOString(),
      expiresAt: computeExpiresAt(past, 1000), // 1s TTL, long expired
    }));
    store.saveDraft(makeDraft({ id: "d-fresh", sessionId: "s1" })); // default 7d TTL

    const purged = store.purgeExpired();
    expect(purged).toBe(1);
    expect(store.queryDrafts().length).toBe(1);
    expect(store.queryDrafts()[0]!.id).toBe("d-fresh");
  });
});

// ── P57.3 Real LLM Distiller ──

import { distillSandbox } from "../src/memory/distiller.js";

const SKILL_JSON = JSON.stringify({
  id: "null-check::TypeError",
  title: "Null check for foo.ts",
  problemClass: "null-check",
  triggers: ["TypeError", "null"],
  recommendedMode: "probe",
  requiredEvidence: ["test/foo.test.ts"],
  editableScopeHints: ["src/foo.ts"],
  readOnlyEvidenceHints: ["test/foo.test.ts"],
  successCheckHints: ["npm test"],
  playbook: "1. Read test 2. Add null guard 3. npm test",
  commonFailureModes: ["missing optional chaining"],
  verificationChecklist: ["npm test passes"],
  successRate: 0.8,
  recordCount: 3,
});

describe("Distiller — P57.3 real LLM", () => {
  const DB = "/tmp/kevix-distill-test.json";

  beforeEach(() => { try { rmSync(DB, { force: true }); } catch {} });

  it("produces skill when >= 3 records for same file", async () => {
    const store = new SandboxStore(DB);
    const now = new Date();
    // Seed 3 records for same file
    for (let i = 0; i < 3; i++) {
      store.saveRecord(makeRecord({
        id: `rec-${i}`,
        problem: `fix null bug in src/foo.ts #${i}`,
        mode: i === 2 ? "probe" : "memory",
        scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: ["test/foo.test.ts"], successChecks: ["npm test"] },
        outcome: { ...makeRecord().outcome, testsPassed: true, reviewVerdict: "PASS", escalated: false },
        tags: ["bugfix", "null-check"],
        reviewFindings: [],
      }));
    }

    const mockProvider = {
      async call(_p: any): Promise<any> {
        return { message: { content: SKILL_JSON } };
      },
    };

    const count = await distillSandbox(store, mockProvider);
    expect(count).toBe(1);
    expect(store.wikiSkillCount()).toBe(1);

    const skill = store.allWikiSkills()[0]!;
    expect(skill.title).toBe("Null check for foo.ts");
    expect(skill.recommendedMode).toBe("probe");
    expect(skill.successRate).toBe(0.8);
    expect(skill.recordCount).toBe(3);
  });

  it("produces 0 skills when fewer than minRecords", async () => {
    const store = new SandboxStore(DB);
    store.saveRecord(makeRecord({ id: "r1", scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: [], successChecks: [] } }));
    store.saveRecord(makeRecord({ id: "r2", scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: [], successChecks: [] } }));

    const mockProvider = { async call(_p: any): Promise<any> { return { message: { content: "{}" } }; } };
    const count = await distillSandbox(store, mockProvider);
    expect(count).toBe(0);
  });

  it("skips group on LLM failure", async () => {
    const store = new SandboxStore(DB);
    for (let i = 0; i < 5; i++) {
      store.saveRecord(makeRecord({ id: `rec-${i}`, scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: [], successChecks: [] } }));
    }

    const mockProvider = {
      async call(_p: any): Promise<any> { throw new Error("API down"); },
    };

    const count = await distillSandbox(store, mockProvider);
    expect(count).toBe(0); // no crash, just no skills
  });

  it("skips SKIP response from LLM", async () => {
    const store = new SandboxStore(DB);
    for (let i = 0; i < 3; i++) {
      store.saveRecord(makeRecord({ id: `rec-${i}`, scopeContract: { editableScope: ["src/foo.ts"], readOnlyEvidence: [], successChecks: [] } }));
    }

    const mockProvider = {
      async call(_p: any): Promise<any> {
        return { message: { content: JSON.stringify({ id: "SKIP", reason: "too diverse" }) } };
      },
    };

    const count = await distillSandbox(store, mockProvider);
    expect(count).toBe(0);
    expect(store.wikiSkillCount()).toBe(0);
  });
});
