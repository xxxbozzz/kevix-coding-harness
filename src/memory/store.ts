// P57: MemoryStore — append-only records, replace-on-update cards

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { MemoryRecord, CapabilityCard } from "./types.js";

export interface MemoryQuery {
  file?: string;
  taskCategory?: string;
  mode?: "memory" | "probe" | "auto";
  since?: string; // ISO timestamp — only records after this
  limit?: number;
}

interface StoreData {
  version: 1;
  records: MemoryRecord[];
  cards: CapabilityCard[];
}

function emptyStore(): StoreData {
  return { version: 1, records: [], cards: [] };
}

export class MemoryStore {
  private data: StoreData;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.data = MemoryStore.loadFrom(filePath);
  }

  // ── Persistence ──

  private static loadFrom(filePath: string): StoreData {
    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && Array.isArray(parsed.records) && Array.isArray(parsed.cards)) {
          return parsed as StoreData;
        }
      }
    } catch {
      // Corrupted or missing — start fresh
    }
    return emptyStore();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch {
      // Best-effort persistence
    }
  }

  static load(filePath: string): StoreData {
    return MemoryStore.loadFrom(filePath);
  }

  // ── Records (append-only) ──

  saveRecord(record: MemoryRecord): void {
    this.data.records.push(record);
    this.persist();
  }

  queryRecords(query: MemoryQuery = {}): MemoryRecord[] {
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
      results = results.filter((r) => query.since ? r.timestamp >= query.since : true);
    }
    if (query.limit && query.limit > 0) {
      results = results.slice(-query.limit);
    }
    return results;
  }

  recordCount(): number {
    return this.data.records.length;
  }

  // ── Cards (upsert by id) ──

  saveCard(card: CapabilityCard): void {
    const idx = this.data.cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      this.data.cards[idx] = card;
    } else {
      this.data.cards.push(card);
    }
    this.persist();
  }

  queryCards(query: MemoryQuery = {}): CapabilityCard[] {
    let results = [...this.data.cards];

    if (query.file) {
      const qf = query.file.toLowerCase();
      results = results.filter((c) => c.file.toLowerCase().includes(qf));
    }
    if (query.taskCategory) {
      results = results.filter((c) => c.taskCategory === query.taskCategory);
    }
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }
    return results;
  }

  cardCount(): number {
    return this.data.cards.length;
  }

  // ── Bulk ──

  allRecords(): MemoryRecord[] {
    return [...this.data.records];
  }

  allCards(): CapabilityCard[] {
    return [...this.data.cards];
  }
}
