// Native ANSI TUI for kevix.
// No external dependencies: keeps the private beta tarball small and reliable.

import * as readline from "node:readline";
import type {
  EngineEvent,
  PEANDirective,
  TradeoffChoice,
  TradeoffEvidence,
  TradeoffOption,
} from "../types.js";
import type { Prompter } from "./prompts.js";

const ESC = "\x1b[";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";

type PendingPrompt =
  | { kind: "approval"; directive: PEANDirective; resolve: (v: "approve" | "reject") => void }
  | { kind: "tradeoff"; evidence: TradeoffEvidence; options: TradeoffOption[]; resolve: (v: TradeoffChoice) => void };

interface DialogEntry {
  time: string;
  text: string;
  kind: "user" | "system";
}

interface PhaseGroup {
  name: string;
  status: "running" | "done" | "blocked" | "idle";
  lines: string[];
}

interface TaskRecord {
  task: string;
  startedAt: string;
  finishedAt?: string;
  phases: string[];
  summaryLines: string[];
}

interface TuiState {
  mode: string;
  model: string;
  graphSummary: string;
  phase: string;
  cache: string;
  gates: string;
  tradeoff: string;
  tokens: string;
  cost: string;
  elapsed: string;
  progress: number;
  running: boolean;
  currentTask: string;
  apiCalls: number;
  runtimeEvents: string[];
  phases: PhaseGroup[];
  taskRecords: TaskRecord[];
  lastSummary: string[];
  history: string[];
  historyIndex: number | null;
  logs: DialogEntry[];
  input: string;
  cursor: number;
  pending: PendingPrompt | null;
}

export function createTuiPrompter(mode: string, model: string, graphSummary: string): Prompter {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  const queue: string[] = [];
  const waiters: Array<(value: IteratorResult<string>) => void> = [];
  let closed = false;
  const start = Date.now();

  const state: TuiState = {
    mode,
    model,
    graphSummary,
    phase: "idle",
    cache: "--",
    gates: "--",
    tradeoff: "ready",
    tokens: "--",
    cost: "--",
    elapsed: "00:00",
    progress: 0,
    running: false,
    currentTask: "idle",
    apiCalls: 0,
    runtimeEvents: ["idle"],
    phases: [{ name: "Controller", status: "idle", lines: ["waiting for task"] }],
    taskRecords: [],
    lastSummary: [],
    history: [],
    historyIndex: null,
    logs: [
      { time: timestamp(), text: "welcome to kevix", kind: "system" },
      { time: timestamp(), text: "type a task to start, or use /help", kind: "system" },
    ],
    input: "",
    cursor: 0,
    pending: null,
  };
  activeStateProvider = () => state;

  function pushLine(line: string, kind: DialogEntry["kind"] = "system") {
    state.logs.push({ time: timestamp(), text: line, kind });
    const maxLogs = Math.max(6, height() - 20);
    if (state.logs.length > maxLogs) state.logs.splice(0, state.logs.length - maxLogs);
    draw();
  }

  function pushRuntime(line: string) {
    state.runtimeEvents.push(line);
    const maxRuntime = Math.max(4, Math.floor((height() - 20) / 2));
    if (state.runtimeEvents.length > maxRuntime) {
      state.runtimeEvents.splice(0, state.runtimeEvents.length - maxRuntime);
    }
    draw();
  }

  function pushPhaseLine(phaseName: string, line: string, status: PhaseGroup["status"] = "running") {
    const phase = ensurePhase(phaseName);
    phase.status = status;
    phase.lines.push(line);
    const maxLines = 8;
    if (phase.lines.length > maxLines) phase.lines.splice(0, phase.lines.length - maxLines);
    draw();
  }

  function ensurePhase(name: string): PhaseGroup {
    let phase = state.phases.find((p) => p.name === name);
    if (!phase) {
      phase = { name, status: "idle", lines: [] };
      state.phases.push(phase);
    }
    return phase;
  }

  function markPhase(name: string, status: PhaseGroup["status"]) {
    const phase = ensurePhase(name);
    phase.status = status;
  }

  function resolveInput(value: string) {
    if (waiters.length > 0) {
      waiters.shift()!({ value, done: false });
    } else {
      queue.push(value);
    }
  }

  function onKeypress(str: string, key: readline.Key) {
    if (key.ctrl && key.name === "c") {
      close();
      process.exit(0);
    }

    if (state.pending) {
      handlePendingKey(str);
      return;
    }

    if (key.name === "return" || str === "\r" || str === "\n") {
      const line = state.input.trim();
      state.input = "";
      state.cursor = 0;
      if (line) {
        state.history.push(line);
        state.historyIndex = null;
        pushLine(`${GREEN}>${RESET} ${line}`, "user");
        resolveInput(line);
      } else {
        draw();
      }
      return;
    }

    if (key.name === "backspace" || key.name === "delete") {
      if (state.cursor > 0) {
        state.input = state.input.slice(0, state.cursor - 1) + state.input.slice(state.cursor);
        state.cursor--;
      }
      draw();
      return;
    }

    if (key.ctrl && key.name === "a") {
      state.cursor = 0;
      draw();
      return;
    }

    if (key.ctrl && key.name === "e") {
      state.cursor = state.input.length;
      draw();
      return;
    }

    if (key.name === "up") {
      if (state.history.length > 0) {
        if (state.historyIndex === null) state.historyIndex = state.history.length - 1;
        else state.historyIndex = Math.max(0, state.historyIndex - 1);
        state.input = state.history[state.historyIndex] ?? "";
        state.cursor = state.input.length;
        draw();
      }
      return;
    }

    if (key.name === "down") {
      if (state.history.length > 0 && state.historyIndex !== null) {
        state.historyIndex++;
        if (state.historyIndex >= state.history.length) {
          state.historyIndex = null;
          state.input = "";
          state.cursor = 0;
        } else {
          state.input = state.history[state.historyIndex] ?? "";
          state.cursor = state.input.length;
        }
        draw();
      }
      return;
    }

    if (key.name === "left") {
      state.cursor = Math.max(0, state.cursor - 1);
      draw();
      return;
    }

    if (key.name === "right") {
      state.cursor = Math.min(state.input.length, state.cursor + 1);
      draw();
      return;
    }

    if (str && !key.ctrl && !key.meta) {
      const inserted = str.replace(/\r/g, "\n");
      state.input = state.input.slice(0, state.cursor) + inserted + state.input.slice(state.cursor);
      state.cursor += inserted.length;
      draw();
    }
  }

  function handlePendingKey(str: string) {
    const answer = str.toLowerCase();
    const pending = state.pending;
    if (!pending) return;

    if (pending.kind === "approval") {
      if (answer === "r") {
        state.pending = null;
        pushLine(`${RED}[approval] rejected${RESET}`);
        pending.resolve("reject");
      } else if (answer === "a" || answer === "\r") {
        state.pending = null;
        pushLine(`${GREEN}[approval] approved${RESET}`);
        pending.resolve("approve");
      }
      return;
    }

    if (pending.kind === "tradeoff") {
      if (answer === "b" || answer === "c" || answer === "a") {
        const choice = answer.toUpperCase() as TradeoffChoice;
        state.pending = null;
        state.tradeoff = choice === "B" ? "B upgrade to probe" : choice === "C" ? "C pause" : "A continue";
        pushLine(`${MAGENTA}[tradeoff]${RESET} choose ${choice}`);
        pending.resolve(choice);
      }
    }
  }

  function handleEvent(e: EngineEvent) {
    switch (e.type) {
      case "step_start":
        state.running = true;
        state.phase = e.phase;
        state.progress = Math.min(0.95, state.progress + 0.12);
        pushPhaseLine(phaseLabel(e.phase), `${timestamp()} started`, "running");
        break;
      case "step_complete":
        state.phase = e.phase;
        state.progress = Math.min(0.98, state.progress + 0.16);
        pushPhaseLine(phaseLabel(e.phase), `${timestamp()} completed (${Math.round(e.duration_ms / 1000)}s)`, "done");
        break;
      case "api_call":
        state.apiCalls = e.request_index;
        state.cache = `${e.usage.cache_hit_ratio.toFixed(0)}%`;
        state.tokens = String(e.usage.total_tokens ?? "--");
        pushPhaseLine(phaseLabel(state.phase), `${timestamp()} API #${e.request_index} cache ${state.cache}`, "running");
        break;
      case "tool_call":
        pushPhaseLine("Worker", `${timestamp()} ${formatToolCall(e.name, e.args_preview)}`, "running");
        break;
      case "tool_start":
        // Backward-compatible event kept for non-TUI renderers. tool_call is the primary TUI event.
        break;
      case "tool_result": {
        const status = e.is_error ? `${RED}error${RESET}` : `${GREEN}ok${RESET}`;
        const duration = e.duration_ms !== undefined ? ` ${DIM}${e.duration_ms}ms${RESET}` : "";
        const preview = e.content_preview ?? e.content;
        pushPhaseLine("Worker", `${timestamp()}   ${status}${duration} ${DIM}${clipPlain(preview, 64)}${RESET}`, e.is_error ? "blocked" : "running");
        break;
      }
      case "log":
        if (e.text.includes("Gate blocked")) {
          const gateNum = Number.parseInt(state.gates, 10);
          state.gates = Number.isFinite(gateNum) ? String(gateNum + 1) : "1";
          pushPhaseLine("Worker", `${timestamp()} ${YELLOW}Gate${RESET} ${e.text.replace("Gate blocked", "").trim()}`, "blocked");
        } else if (e.level !== "info") {
          pushPhaseLine(phaseLabel(state.phase), `${timestamp()} ${MAGENTA}${e.level}${RESET} ${e.text}`, e.level === "error" ? "blocked" : "running");
        }
        break;
      case "decision":
        state.tradeoff = e.need_probe ? "probe required" : "probe skipped";
        pushPhaseLine("Review", `${timestamp()} ${e.need_probe ? "need probe" : "skip probe"} - ${e.reason}`, "done");
        break;
      case "tradeoff_required":
        state.tradeoff = "choose A/B/C";
        pushPhaseLine("Worker", `${timestamp()} ${MAGENTA}Tradeoff required${RESET} ${e.evidence.activeSignals.join(", ")}`, "blocked");
        break;
      case "error":
        state.running = false;
        pushPhaseLine("Result", `${timestamp()} ${RED}error${RESET} ${e.message}`, "blocked");
        break;
      case "result":
        state.running = false;
        state.progress = 1;
        state.lastSummary = buildSummaryLines();
        state.taskRecords.push({
          task: state.currentTask,
          startedAt: state.logs.find((l) => l.text.includes(state.currentTask))?.time ?? timestamp(),
          finishedAt: timestamp(),
          phases: e.summary.phases_completed,
          summaryLines: state.lastSummary,
        });
        pushPhaseLine("Result", `${timestamp()} ${GREEN}done${RESET} ${e.summary.phases_completed.join(" -> ")}`, "done");
        break;
      case "done":
        state.running = false;
        state.progress = e.exit_code === 0 ? 1 : state.progress;
        pushPhaseLine("Result", `${timestamp()} ${GREEN}exit${RESET} ${e.exit_code}`, e.exit_code === 0 ? "done" : "blocked");
        break;
      case "escalate":
        state.tradeoff = "escalated";
        pushPhaseLine("Result", `${timestamp()} ${YELLOW}escalate${RESET} ${e.issues.length} issues, ${e.cycles} cycles`, "blocked");
        break;
      case "state_snapshot":
      case "directive":
      case "streaming":
      case "approval_required":
      case "advisory":
      case "risk_hint":
        break;
    }
  }

  function draw() {
    state.elapsed = formatElapsed(Date.now() - start);
    const cols = width();
    const rows = height();
    const inner = cols - 2;
    const top = `${BLUE}╭${"─".repeat(inner)}╮${RESET}`;
    const mid = `${BLUE}├${"─".repeat(inner)}┤${RESET}`;
    const bottom = `${BLUE}╰${"─".repeat(inner)}╯${RESET}`;
    const out: string[] = [];

    out.push(`${ESC}?25l${ESC}H${ESC}2J`);
    out.push(top);
    out.push(boxLine("", inner));
    for (let i = 0; i < WHALE_ASTRONAUT.length; i++) out.push(heroLine(i, inner));
    out.push(mid);
    for (const row of statusRows()) out.push(boxLine(row, inner));
    out.push(mid);
    const runtimeHeight = Math.max(4, Math.floor((rows - 26) * 0.48));
    out.push(boxLine(`${DIM} runtime${RESET}  ${state.running ? `${GREEN}running${RESET}` : `${DIM}ready${RESET}`}  ${DIM}task:${RESET} ${clipPlain(state.currentTask, Math.max(12, inner - 26))}`, inner));
    const workLines = visibleWorkbench(runtimeHeight);
    for (const line of workLines) out.push(boxLine(` ${line}`, inner));
    for (let i = workLines.length; i < runtimeHeight; i++) out.push(boxLine("", inner));
    out.push(mid);

    const dialogHeight = Math.max(5, rows - 22 - runtimeHeight);
    out.push(boxLine(`${DIM} dialog${RESET}`, inner));
    for (const entry of visibleLogs(dialogHeight)) out.push(boxLine(dialogLine(entry), inner));
    for (let i = visibleLogs(dialogHeight).length; i < dialogHeight; i++) out.push(boxLine("", inner));

    if (state.pending) {
      out.push(mid);
      for (const line of pendingLines(inner)) out.push(boxLine(line, inner));
    }

    out.push(mid);
    out.push(boxLine(statusBar(inner), inner));
    out.push(bottom);
    out.push(...inputLines(cols));
    process.stdout.write(out.join("\n"));
  }

  function visibleLogs(limit: number): DialogEntry[] {
    return state.logs.slice(-limit);
  }

  function visibleRuntime(limit: number): string[] {
    return state.runtimeEvents.slice(-limit);
  }

  function visibleWorkbench(limit: number): string[] {
    const lines: string[] = [];
    for (const phase of state.phases) {
      const status = phase.status === "done" ? `${GREEN}✓${RESET}` : phase.status === "blocked" ? `${YELLOW}!${RESET}` : phase.status === "running" ? `${CYAN}●${RESET}` : `${DIM}·${RESET}`;
      lines.push(`${status} ${BOLD}${phase.name}${RESET}`);
      for (const line of phase.lines.slice(-4)) lines.push(`  ${line}`);
    }
    if (state.lastSummary.length > 0) {
      lines.push(`${GREEN}✓${RESET} ${BOLD}Summary${RESET}`);
      for (const line of state.lastSummary.slice(0, 4)) lines.push(`  ${line}`);
    }
    return lines.slice(-limit);
  }

  function pendingLines(inner: number): string[] {
    const p = state.pending;
    if (!p) return [];
    if (p.kind === "approval") {
      const intent = oneLine(p.directive.product_intent).slice(0, inner - 22);
      const red = oneLine(p.directive.red_flags ?? "").slice(0, inner - 20);
      return [
        ` ${YELLOW}${BOLD}Approval Gate${RESET}  review directive before Worker runs`,
        ` Intent     ${CYAN}${intent || "not parsed"}${RESET}`,
        ` Red Flags  ${red ? `${RED}${red}${RESET}` : `${DIM}none${RESET}`}`,
        ` ${GREEN}[A] Approve and continue${RESET}    ${RED}[R] Reject task${RESET}`,
      ];
    }
    const optionLine = (id: "A" | "B" | "C", label: string, desc: string, color: string) =>
      ` ${color}[${id}] ${label.padEnd(18)}${RESET} ${DIM}${clipPlain(desc, Math.max(20, inner - 30))}${RESET}`;
    return [
      ` ${MAGENTA}${BOLD}Runtime Tradeoff${RESET}  evidence first, user controls the path`,
      ` Evidence  gates=${CYAN}${p.evidence.gateCount}${RESET}  cache=${CYAN}${p.evidence.cacheTrend}${RESET}  signals=${CYAN}${p.evidence.activeSignals.join(", ")}${RESET}`,
      optionLine("A", "continue memory", "fastest path; accept current risk", GREEN),
      optionLine("B", "upgrade probe", "+verification calls; best for protocol/state risk", CYAN),
      optionLine("C", "pause", "stop and inspect scope before continuing", YELLOW),
    ];
  }

  function close() {
    closed = true;
    process.stdin.off("keypress", onKeypress);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(`${ESC}?25h${ESC}0m\n`);
    while (waiters.length > 0) waiters.shift()!({ value: undefined as unknown as string, done: true });
  }

  process.stdin.on("keypress", onKeypress);
  draw();

  return {
    async askApproval(directive: PEANDirective) {
      return new Promise<"approve" | "reject">((resolve) => {
        state.pending = { kind: "approval", directive, resolve };
        draw();
      });
    },
    async askTradeoff(evidence: TradeoffEvidence, options: TradeoffOption[]) {
      return new Promise<TradeoffChoice>((resolve) => {
        state.pending = { kind: "tradeoff", evidence, options, resolve };
        draw();
      });
    },
    repl() {
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<string>> {
              if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false });
              if (closed) return Promise.resolve({ value: undefined as unknown as string, done: true });
              return new Promise((resolve) => waiters.push(resolve));
            },
          };
        },
      };
    },
    showPrompt() {
      draw();
    },
    handleEvent,
    setMode(nextMode: string) {
      state.mode = nextMode;
      draw();
    },
    setTask(task: string) {
      state.currentTask = task;
      state.running = true;
      state.progress = 0.03;
      state.phase = "queued";
      state.apiCalls = 0;
      state.cache = "--";
      state.gates = "--";
      state.tradeoff = "ready";
      state.runtimeEvents = [`${timestamp()}  ${CYAN}[task]${RESET} ${task}`];
      state.phases = [
        { name: "Controller", status: "running", lines: [`${timestamp()} task accepted`] },
        { name: "Worker", status: "idle", lines: [] },
        { name: "Review", status: "idle", lines: [] },
        { name: "Probe", status: "idle", lines: [] },
        { name: "Result", status: "idle", lines: [] },
      ];
      state.lastSummary = [];
      draw();
    },
    pushMessage(message: string) {
      pushLine(message);
    },
    getTimeline() {
      return visibleWorkbench(30).map(stripAnsi);
    },
    getHistory() {
      return [...state.history];
    },
    close,
  } as Prompter & {
    handleEvent(e: EngineEvent): void;
    setMode(nextMode: string): void;
    setTask(task: string): void;
    pushMessage(message: string): void;
    getTimeline(): string[];
    getHistory(): string[];
  };
}

const WHALE_ASTRONAUT = [
  "       +        .-\"\"\"\"\"-.        .",
  "   .        .-'  .---.  '-.        +",
  "          .'   .'  o  '.   '.       ",
  "    +    /    /  .---.  \\    \\     ",
  "        |    |  |  >  |  |    |  * ",
  "        |    |   '---'   |    |    ",
  "     .   \\    '.       .'    /     ",
  "          '-.   '-----'   .-'   +  ",
  "       *     '--._____.--'          ",
  "             __/  ___  \\__      .  ",
  "      .    _/ /| |___| |\\ \\_       ",
  "          /__/ |_______| \\__\\      ",
  "              /  /   \\  \\          ",
  "         <)))'  /     \\  '(((>     ",
];

function heroLine(index: number, inner: number): string {
  const art = `${CYAN}${(WHALE_ASTRONAUT[index] ?? "").padEnd(38)}${RESET}`;
  let right = "";
  if (index === 2) right = `${CYAN}${BOLD}Kevix Coding Harness${RESET}`;
  if (index === 4) right = `${DIM}AI-native coding harness for autonomous engineering${RESET}`;
  if (index === 6) right = `${CYAN}>${RESET} ask kevix to work`;
  if (index === 9) right = `${DIM}whale astronaut mode${RESET}`;
  const text = ` ${art}    ${right}`;
  return boxLine(text, inner);
}

function statusRows(): string[] {
  return [
    `  Rocket Mode    : ${CYAN}${currentState("mode")}${RESET}                         Cache     : ${CYAN}${currentState("cache")}${RESET}`,
    `  Model          : ${CYAN}${currentState("model")}${RESET}              Gates     : ${CYAN}${currentState("gates")}${RESET}`,
    `  Phase          : ${CYAN}${currentState("phase")}${RESET}                         Tradeoff  : ${CYAN}${currentState("tradeoff")}${RESET}`,
    `  API Calls      : ${CYAN}${currentState("apiCalls")}${RESET}                            ${DIM}${currentState("graphSummary")}${RESET}`,
  ];
}

let activeStateProvider: (() => TuiState) | null = null;

function currentState(key: keyof TuiState): string {
  const value = activeStateProvider?.()[key];
  return typeof value === "string" ? value : String(value ?? "");
}

function statusBar(inner: number): string {
  const progress = Number(currentState("progress"));
  const filled = Math.max(0, Math.min(10, Math.round(progress * 10)));
  const bar = `${CYAN}${"█".repeat(filled)}${DIM}${"░".repeat(10 - filled)}${RESET}`;
  const text = ` ${GREEN}>${RESET} kevix ${CYAN}status${RESET}  ${DIM}| Tokens:${RESET} ${CYAN}${currentState("tokens")}${RESET}  ${DIM}| Cost:${RESET} ${CYAN}${currentState("cost")}${RESET}  ${DIM}| Elapsed:${RESET} ${CYAN}${currentState("elapsed")}${RESET}  ${DIM}| Progress:${RESET} ${bar}`;
  return text + " ".repeat(Math.max(0, inner - visualLength(text)));
}

function inputLines(cols: number): string[] {
  const state = activeStateProvider?.();
  const raw = state?.input ?? "";
  const cursor = state?.cursor ?? raw.length;
  const before = raw.slice(0, cursor);
  const at = raw[cursor] ?? " ";
  const after = raw.slice(cursor + (raw[cursor] ? 1 : 0));
  const rendered = `${GREEN}>${RESET} ${CYAN}kevix${RESET} ${before}${BOLD}${at}${RESET}${after}${RESET}${ESC}?25h`;
  const max = Math.max(32, cols - 4);
  const logical = rendered.replace(/\n/g, `${DIM} ↵ ${RESET}`);
  const rawPlain = stripAnsi(logical);
  if (rawPlain.length <= max) return [`\n${logical}`];
  const visibleTail = stripAnsi(logical).slice(-max);
  return [`\n${DIM}…${RESET}${visibleTail}`];
}

function dialogLine(entry: DialogEntry): string {
  const marker = entry.kind === "user" ? `${GREEN}›${RESET}` : `${DIM}·${RESET}`;
  return ` ${DIM}${entry.time}${RESET}  ${marker} ${entry.text}`;
}

function phaseLabel(phase: string): string {
  if (phase === "controller") return "Controller";
  if (phase === "worker") return "Worker";
  if (phase === "probe_plan" || phase === "probe_verify") return "Probe";
  if (phase === "assess") return "Review";
  if (phase === "done") return "Result";
  return phase;
}

function formatToolCall(name: string, argsPreview: string): string {
  const args = safeJson(argsPreview);
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  if (name === "read") return `${CYAN}Read${RESET}  ${toolArg(args, ["path", "file", "file_path"], argsPreview)}`;
  if (name === "edit") return `${CYAN}Edit${RESET}  ${toolArg(args, ["path", "file", "file_path"], argsPreview)}`;
  if (name === "write") return `${CYAN}Write${RESET} ${toolArg(args, ["path", "file", "file_path"], argsPreview)}`;
  if (name === "bash") return `${CYAN}Bash${RESET}  ${toolArg(args, ["cmd", "command"], argsPreview)}`;
  if (name === "grep") return `${CYAN}Grep${RESET}  ${toolArg(args, ["pattern", "query"], argsPreview)}`;
  if (name === "glob") return `${CYAN}Glob${RESET}  ${toolArg(args, ["pattern", "glob"], argsPreview)}`;
  return `${CYAN}${label}${RESET} ${clipPlain(argsPreview, 72)}`;
}

function toolArg(args: Record<string, unknown> | null, keys: string[], fallback: string): string {
  if (args) {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) return clipPlain(value, 80);
    }
  }
  return clipPlain(fallback, 80);
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function buildSummaryLines(): string[] {
  const state = activeStateProvider?.();
  if (!state) return [];
  const phases = state.phases.filter((p) => p.status !== "idle").map((p) => p.name).join(" -> ") || state.phase;
  const gates = state.gates === "--" ? "0" : state.gates;
  const cache = state.cache;
  const tokens = state.tokens;
  const review = state.phases.find((p) => p.name === "Review")?.status ?? "idle";
  const tradeoff = state.tradeoff;
  return [
    `phases: ${phases}`,
    `gates: ${gates} | cache: ${cache} | tokens: ${tokens}`,
    `review: ${review} | tradeoff: ${tradeoff}`,
    `next: inspect patch, run tests, or start /again`,
  ];
}

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

function boxLine(content: string, inner: number): string {
  const clipped = clipAnsi(content, inner);
  return `${BLUE}│${RESET}${clipped}${" ".repeat(Math.max(0, inner - visualLength(clipped)))}${BLUE}│${RESET}`;
}

function width(): number {
  return Math.min(Math.max(process.stdout.columns || 100, 88), 130);
}

function height(): number {
  return Math.min(Math.max(process.stdout.rows || 34, 28), 50);
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function visualLength(text: string): number {
  return stripAnsi(text).length;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

function clipAnsi(text: string, max: number): string {
  const raw = stripAnsi(text);
  if (raw.length <= max) return text;
  return raw.slice(0, Math.max(0, max - 1)) + "…";
}

function clipPlain(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + "…";
}
