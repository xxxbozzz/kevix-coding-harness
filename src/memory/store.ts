// P57: SandboxStore — rolling 3-day TTL records + persistent WikiSkills

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { computeExpiresAt, WORKING_TTL_MS } from "./types.js";
import type { RawMemoryRecord, WikiSkill, WorkingDraft } from "./types.js";

export interface MemoryQuery {
  file?: string;
  mode?: "memory" | "probe" | "auto";
  since?: string;
  limit?: number;
}

interface StoreData {
  version: 1;
  records: RawMemoryRecord[];
  wikiSkills: WikiSkill[];
  workingDrafts: WorkingDraft[];
}

function empty(): StoreData {
  return { version: 1, records: [], wikiSkills: [], workingDrafts: [] };
}

export class SandboxStore {
  private data: StoreData;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = SandboxStore.loadFrom(filePath);
  }

  private static loadFrom(filePath: string): StoreData {
    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed?.version === 1 && Array.isArray(parsed.records) && Array.isArray(parsed.wikiSkills)) {
      if (!Array.isArray(parsed.workingDrafts)) (parsed as any).workingDrafts = [];
          return parsed as StoreData;
        }
      }
    } catch {}
    return empty();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch {}
  }

  static load(filePath: string): StoreData {
    return SandboxStore.loadFrom(filePath);
  }

  // ── Records (raw memory, TTL-based) ──

  saveRecord(record: RawMemoryRecord): void {
    if (!record.expiresAt && record.createdAt) {
      record.expiresAt = computeExpiresAt(new Date(record.createdAt));
    }
    this.data.records.push(record);
    this.persist();
  }

  queryRecords(query: MemoryQuery = {}): RawMemoryRecord[] {
    let results = [...this.data.records];
    if (query.file) {
      const qf = query.file.toLowerCase();
      results = results.filter((r) =>
        r.scopeContract?.editableScope.some((f) => f.toLowerCase().includes(qf)) ||
        r.outcome.filesChanged.some((f) => f.toLowerCase().includes(qf))
      );
    }
    if (query.mode) {
      results = results.filter((r) => r.mode === query.mode);
    }
    if (query.since) {
      results = results.filter((r) => query.since ? r.createdAt >= query.since : true);
    }
    if (query.limit && query.limit > 0) {
      results = results.slice(-query.limit);
    }
    return results;
  }

  recordCount(): number {
    return this.data.records.length;
  }

  allRecords(): RawMemoryRecord[] {
    return [...this.data.records];
  }

  /** Remove expired records AND working drafts. Never touches wikiSkills. */
  purgeExpired(now: Date = new Date()): number {
    const nowISO = now.toISOString();
    const recBefore = this.data.records.length;
    const draftBefore = this.data.workingDrafts.length;
    this.data.records = this.data.records.filter((r) => r.expiresAt > nowISO);
    this.data.workingDrafts = this.data.workingDrafts.filter((d) => d.expiresAt > nowISO);
    const purged = (recBefore - this.data.records.length) + (draftBefore - this.data.workingDrafts.length);
    if (purged > 0) this.persist();
    return purged;
  }

  // ── Working Layer (LLM draft space, 7-day TTL) ──

  saveDraft(draft: WorkingDraft): void {
    if (!draft.expiresAt && draft.createdAt) {
      draft.expiresAt = computeExpiresAt(new Date(draft.createdAt), WORKING_TTL_MS);
    }
    this.data.workingDrafts.push(draft);
    this.persist();
  }

  queryDrafts(sessionId?: string): WorkingDraft[] {
    if (!sessionId) return [...this.data.workingDrafts];
    return this.data.workingDrafts.filter((d) => d.sessionId === sessionId);
  }

  draftCount(): number {
    return this.data.workingDrafts.length;
  }

  /** Promote a candidate draft to a WikiSkill. Removes the draft from working/. */
  promoteToWiki(draftId: string, skill: WikiSkill): boolean {
    const idx = this.data.workingDrafts.findIndex((d) => d.id === draftId);
    if (idx < 0) return false;
    this.data.workingDrafts.splice(idx, 1);
    this.saveWikiSkill(skill);
    return true;
  }

  /** Discard a working draft without promoting. */
  discardDraft(draftId: string): boolean {
    const idx = this.data.workingDrafts.findIndex((d) => d.id === draftId);
    if (idx < 0) return false;
    this.data.workingDrafts.splice(idx, 1);
    this.persist();
    return true;
  }

  // ── Wiki Skills (persistent, no TTL) ──

  saveWikiSkill(skill: WikiSkill): void {
    const idx = this.data.wikiSkills.findIndex((s) => s.id === skill.id);
    if (idx >= 0) {
      this.data.wikiSkills[idx] = skill;
    } else {
      this.data.wikiSkills.push(skill);
    }
    this.persist();
  }

  queryWikiSkills(file?: string): WikiSkill[] {
    if (!file) return [...this.data.wikiSkills];
    const qf = file.toLowerCase();
    return this.data.wikiSkills.filter(
      (s) =>
        s.editableScopeHints.some((f) => f.toLowerCase().includes(qf)) ||
        s.triggers.some((t) => t.toLowerCase().includes(qf))
    );
  }

  wikiSkillCount(): number {
    return this.data.wikiSkills.length;
  }

  allWikiSkills(): WikiSkill[] {
    return [...this.data.wikiSkills];
  }
}
