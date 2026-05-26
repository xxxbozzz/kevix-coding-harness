// CLI render — Claude Code style: ⏺ prefix, inline results, spinner, minimal

import type { EngineEvent } from "../types.js";

const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";
const RESET = "\x1b[0m";

const SPINNER = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

let stepCount = 0;
let startedAt = 0;
let currentPhase = "";
let cacheHits: number[] = [];
let gateCount = 0;
let spinnerTimer: ReturnType<typeof setInterval> | null = null;
let phaseStartTime = 0;

function startSpinner(phase: string) {
  stopSpinner();
  phaseStartTime = Date.now();
  let i = 0;
  process.stdout.write(HIDE);
  spinnerTimer = setInterval(() => {
    const elapsed = ((Date.now() - phaseStartTime) / 1000).toFixed(0);
    process.stdout.write(`\r\x1b[K${DIM}⏺${RESET} ${phase}  ${CYAN}${SPINNER[i]}${RESET}  ${DIM}${elapsed}s${RESET}`);
    i = (i + 1) % SPINNER.length;
  }, 100);
}

function stopSpinner() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    process.stdout.write(SHOW);
  }
}

export function renderStartup(mode: string, model: string, graphInfo: string): void {
  process.stdout.write(`${DIM}kevix  ${CYAN}${mode}${RESET}  ${DIM}${model}${RESET}`);
  if (graphInfo) process.stdout.write(`  ${DIM}${graphInfo}${RESET}`);
  process.stdout.write(`\n\n`);
}

export function renderEvent(e: EngineEvent): void {
  switch (e.type) {
    case "streaming":
      process.stdout.write(e.text);
      break;

    case "step_start":
      currentPhase = e.phase;
      startedAt = startedAt || Date.now();
      stepCount = 0;
      cacheHits = [];
      gateCount = 0;
      startSpinner(currentPhase);
      break;

    case "step_complete":
      stopSpinner();
      {
        const elapsed = ((Date.now() - phaseStartTime) / 1000).toFixed(0);
        process.stdout.write(`\r\x1b[K${GREEN}✓${RESET} ${currentPhase}  ${DIM}${elapsed}s${RESET}`);
        if (cacheHits.length > 0 || gateCount > 0) {
          const parts: string[] = [];
          if (cacheHits.length > 0) {
            const avg = (cacheHits.reduce((a, b) => a + b, 0) / cacheHits.length).toFixed(0);
            parts.push(`${DIM}cache${RESET} ${avg}%`);
          }
          if (gateCount > 0) parts.push(`${YELLOW}gates${RESET} ${gateCount}`);
          process.stdout.write(`  ${parts.join("  ")}`);
        }
        process.stdout.write("\n");
      }
      break;

    case "api_call":
      stepCount++;
      cacheHits.push(e.usage.cache_hit_ratio);
      break;

    case "tool_start": {
      const args = (() => { try { const a = JSON.parse(e.args); return Object.entries(a).map(([k,v]) => `${k}=${String(v).slice(0,40)}`).join(" "); } catch { return ""; } })();
      process.stdout.write(`\n${DIM}⏺${RESET} ${e.name}(${args})`);
      // hide cursor during tool execution
      process.stdout.write(HIDE);
      break;
    }

    case "tool_result": {
      process.stdout.write(SHOW);
      const lines = e.content.split("\n");
      const maxLines = 8;
      const truncated = lines.slice(0, maxLines);
      const prefix = `  ${DIM}⎿${RESET} `;
      for (const line of truncated) {
        process.stdout.write(`\n${prefix}${line}`);
      }
      if (lines.length > maxLines) {
        process.stdout.write(`\n${prefix}${DIM}… +${lines.length - maxLines} lines${RESET}`);
      }
      if (e.is_error) {
        process.stdout.write(`  ${YELLOW}⚠${RESET}`);
      }
      break;
    }

    case "log":
      if (e.text.includes("Gate blocked")) {
        gateCount++;
        process.stdout.write(`\n  ${YELLOW}⚠${RESET} ${e.text.replace("Gate blocked", "").trim()}`);
      } else if (e.level === "error") {
        process.stdout.write(`\n  ${RED}✗${RESET} ${e.text}`);
      } else if (e.level === "warn") {
        process.stdout.write(`\n  ${YELLOW}⚠${RESET} ${e.text}`);
      }
      break;

    case "error":
      process.stdout.write(`\n  ${RED}✗${RESET} ${e.message}`);
      break;

    case "decision":
      process.stdout.write(`\n  ${DIM}assess${RESET} ${e.need_probe ? "probe needed" : "skip"} — ${e.reason}`);
      break;

    case "escalate":
      process.stdout.write(`\n  ${YELLOW}⚠ escalate${RESET} ${e.issues.length} issues, ${e.cycles} cycles → user`);
      break;

    case "tradeoff_required":
      process.stdout.write(`\n  ${YELLOW}⚡${RESET} ${e.evidence.activeSignals.join(" + ")}  ${DIM}gates:${e.evidence.gateCount} cache:${e.evidence.cacheTrend}${RESET}`);
      break;

    case "advisory":
      process.stdout.write(`\n  ${DIM}${e.suggestion}${RESET}`);
      break;
  }
}

export function renderDone(phases: string[], apiCalls: number): void {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  const totalCache = cacheHits.length > 0
    ? `  ${DIM}cache${RESET} ${(cacheHits.reduce((a, b) => a + b, 0) / cacheHits.length).toFixed(0)}%`
    : "";
  process.stdout.write(`\n\n${GREEN}✓${RESET} ${phases.join(" → ")}  ${DIM}${apiCalls} calls  ${elapsed}s${RESET}${totalCache}\n`);
}
