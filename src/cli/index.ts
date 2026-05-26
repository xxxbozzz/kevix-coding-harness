#!/usr/bin/env node
// kevix CLI — DeepSeek-native PEAN harness terminal interface
// Usage: kevix [--mode memory|probe|auto] [--yes] [--json] [problem]

import { runAgentLoop } from "../loop/agent-loop.js";
import { DeepSeekProvider } from "../provider/deepseek.js";
import { GraphBuilder } from "../graph/builder.js";
import { getStats } from "../graph/query.js";
import { bashDefinition, executeBash } from "../tools/bash.js";
import { readDefinition, executeRead } from "../tools/read.js";
import { writeDefinition, executeWrite } from "../tools/write.js";
import { editDefinition, executeEdit } from "../tools/edit.js";
import { grepDefinition, executeGrep } from "../tools/grep.js";
import { globDefinition, executeGlob } from "../tools/glob.js";
import type { ToolDefinition, ToolCall, ToolResult, PEANMode, EngineEvent, PEANDirective, TradeoffEvidence, TradeoffOption, TradeoffChoice } from "../types.js";
import { renderEvent, renderStartup, renderDone } from "./render.js";
import { createPrompter, type Prompter } from "./prompts.js";
import { createTuiPrompter } from "./tui.js";

const API_KEY = process.env.DEEPSEEK_API_KEY;
const GRAPH_PATH = ".kevix/graph.json";

const TOOLS: ToolDefinition[] = [
  bashDefinition, readDefinition, writeDefinition,
  editDefinition, grepDefinition, globDefinition,
];

async function executeTool(call: ToolCall): Promise<ToolResult> {
  const name = call.function.name;
  let args: Record<string, unknown>;
  try { args = JSON.parse(call.function.arguments); }
  catch { return { tool_call_id: call.id, content: "Invalid JSON args", is_error: true }; }
  try {
    switch (name) {
      case "bash": return await executeBash(args);
      case "read": return await executeRead(args);
      case "write": return await executeWrite(args);
      case "edit": return await executeEdit(args);
      case "grep": return await executeGrep(args);
      case "glob": return await executeGlob(args);
      default: return { tool_call_id: call.id, content: `Unknown: ${name}`, is_error: true };
    }
  } catch (e: any) { return { tool_call_id: call.id, content: `Error: ${e.message}`, is_error: true }; }
}

type Subcommand = "smoke" | "report" | "doctor" | null;
type RuntimePrompter = Prompter & {
  handleEvent?: (event: EngineEvent) => void;
  setMode?: (mode: string) => void;
  setTask?: (task: string) => void;
  pushMessage?: (message: string) => void;
  getTimeline?: () => string[];
  getHistory?: () => string[];
};

type InputRoute =
  | { kind: "mode_help" }
  | { kind: "set_mode"; mode: PEANMode }
  | { kind: "status" }
  | { kind: "graph" }
  | { kind: "help" }
  | { kind: "task_description"; problem: string };

function parseArgs(): {
  mode: PEANMode; yes: boolean; json: boolean; problem: string | null;
  subcommand: Subcommand; subarg: string | null;
} {
  const args = process.argv.slice(2);
  let mode: PEANMode = "auto";
  let yes = false;
  let json = false;
  let problem: string | null = null;
  let subcommand: Subcommand = null;
  let subarg: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--mode" && args[i + 1]) { mode = args[++i] as PEANMode; }
    else if (a === "--yes" || a === "-y") { yes = true; }
    else if (a === "--json") { json = true; }
    else if (a === "--version" || a === "-V") { console.log("kevix v0.1.0"); process.exit(0); }
    else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
    else if (a === "smoke" || a === "report" || a === "doctor") { subcommand = a as Subcommand; subarg = args[i + 1] ?? null; if (subarg && !subarg.startsWith("-")) i++; }
    else { problem = a; }
  }

  return { mode, yes, json, problem, subcommand, subarg };
}

function printHelp() {
  console.log(`kevix — DeepSeek-native PEAN harness CLI

Usage: kevix [options] [problem]
       kevix <command> [arg]

Commands:
  smoke tradeoff-b   Run tradeoff B smoke test
  report [file]      Show report from results/*.json (latest by default)
  doctor             Check environment (API key, build, tests, graph)

Options:
  --mode <mode>      memory | probe | auto (default: auto)
  --yes, -y          Auto-approve directive (skip approval gate)
  --json             Output JSON result only
  --version, -V      Show version
  --help, -h         Show this help

Examples:
  kevix "fix null check in login.ts"
  kevix --mode probe "fix API serialization bug"
  kevix --yes --json "add input validation" > result.json
  kevix smoke tradeoff-b
  kevix report latest
  kevix doctor`);
}

function printInteractiveHelp(prompter?: RuntimePrompter) {
  const help = `Commands:
  /run <task>                Start a coding task
  /mode auto|memory|probe    Switch mode
  /memory /probe /auto       Shorthand mode switches
  /history                   Show recent inputs
  /again                     Re-run the last task
  /timeline                  Show the latest task timeline
  /status                    Show current mode and graph summary
  /graph                     Show graph summary
  /help                      Show this help
  /exit                      Exit
`;
  if (prompter?.pushMessage) {
    for (const line of help.trim().split("\n")) prompter.pushMessage(line);
  } else {
    console.log(help);
  }
}

async function runNonInteractive(problem: string, mode: PEANMode, yes: boolean, json: boolean, prompter: RuntimePrompter) {
  if (!API_KEY) { console.error("DEEPSEEK_API_KEY not set"); process.exit(1); }

  const graph = GraphBuilder.load(GRAPH_PATH);
  const graphBuilder = new GraphBuilder(graph);
  const provider = new DeepSeekProvider(API_KEY, { model: "deepseek-v4-pro" });
  const tools = { definitions: TOOLS, execute: executeTool };

  prompter.setTask?.(problem);

  if (!json && !prompter.handleEvent) {
    const stats = getStats(graph);
    console.log(`kevix  |  mode: ${mode}  |  model: deepseek-v4-pro`);
    if (stats.taskCount > 0) console.log(`graph: ${stats.taskCount} tasks, ${stats.patternCount} patterns`);
    console.log();
  }

  const summary = await runAgentLoop({
    provider, tools, mode,
    problem, taskId: `cli-${Date.now()}`,
    approvalMode: "manual",
    onApprovalRequired: async (d: PEANDirective) => {
      if (yes) return "approve";
      return prompter.askApproval(d);
    },
    onTradeoffRequired: async (e: TradeoffEvidence, o: TradeoffOption[]) => {
      if (yes) return "B"; // auto-upgrade to probe
      return prompter.askTradeoff(e, o);
    },
    graph, graphBuilder,
    onEvent: (e: EngineEvent) => {
      if (!json) {
        if (prompter.handleEvent) prompter.handleEvent(e);
        else renderEvent(e);
      }
    },
  });

  graphBuilder.save(GRAPH_PATH);

  if (json) {
    console.log(JSON.stringify({
      mode, task_id: summary.task_id,
      phases: summary.phases_completed,
      request_count: summary.request_count,
      escalated: summary.escalated,
      review_issues: summary.review_issues,
    }));
  } else if (!prompter.handleEvent) {
    renderDone(summary.phases_completed, summary.request_count);
  }
}

async function runInteractive(mode: PEANMode, prompter: RuntimePrompter) {
  const stats = getStats(GraphBuilder.load(GRAPH_PATH));
  const graphSummary = stats.taskCount > 0
    ? `graph: ${stats.taskCount} tasks, ${stats.patternCount} patterns from history`
    : "graph: no history yet";
  if (!prompter.handleEvent) {
    renderStartup(mode, "deepseek-v4-pro", graphSummary);
  }
  prompter.showPrompt();
  let lastTask: string | null = null;

  for await (const input of prompter.repl()) {
    const trimmed = input.trim();
    if (!trimmed) {
      prompter.showPrompt();
      continue;
    }

    if (trimmed.startsWith("/")) {
      const [cmdRaw, ...rest] = trimmed.slice(1).split(/\s+/);
      const cmd = (cmdRaw ?? "").toLowerCase();
      const arg = rest.join(" ").trim();
      switch (cmd) {
        case "memory": mode = "memory"; announce(prompter, "mode set to memory"); prompter.setMode?.(mode); break;
        case "probe":  mode = "probe";  announce(prompter, "mode set to probe");  prompter.setMode?.(mode); break;
        case "auto":   mode = "auto";   announce(prompter, "mode set to auto");   prompter.setMode?.(mode); break;
        case "mode":
          if (arg === "memory" || arg === "probe" || arg === "auto") {
            mode = arg;
            announce(prompter, `mode set to ${mode}`);
            prompter.setMode?.(mode);
          } else {
            announce(prompter, "Usage: /mode auto|memory|probe");
          }
          break;
        case "run":
          if (!arg) {
            announce(prompter, "Usage: /run <task>");
            break;
          }
          lastTask = arg;
          await runNonInteractive(arg, mode, false, false, prompter);
          announce(prompter, "task finished");
          break;
        case "again":
          if (!lastTask) {
            announce(prompter, "No previous task yet.");
            break;
          }
          await runNonInteractive(lastTask, mode, false, false, prompter);
          announce(prompter, "task finished");
          break;
        case "history": printHistory(prompter); break;
        case "timeline": printTimeline(prompter); break;
        case "status": printStatus(mode, prompter); break;
        case "graph":  printGraph(prompter); break;
        case "help":   printInteractiveHelp(prompter); break;
        case "exit":
        case "quit":   prompter.close(); process.exit(0);
        default: announce(prompter, `Unknown: ${cmd}. /help for commands.`);
      }
      prompter.showPrompt();
      continue;
    }

    const route = classifyInputRoute(trimmed);
    if (route.kind === "set_mode") {
      mode = route.mode;
      announce(prompter, `mode set to ${mode}`);
      prompter.setMode?.(mode);
    } else if (route.kind === "mode_help") {
      announce(prompter, "Change mode with /mode auto, /mode memory, or /mode probe. Shortcuts: /auto, /memory, /probe.");
      announce(prompter, "auto = default router, memory = fastest, probe = deeper verification.");
    } else if (route.kind === "status") {
      printStatus(mode, prompter);
    } else if (route.kind === "graph") {
      printGraph(prompter);
    } else if (route.kind === "help") {
      printInteractiveHelp(prompter);
    } else {
      lastTask = route.problem;
      await runNonInteractive(route.problem, mode, false, false, prompter);
      announce(prompter, "task finished");
    }
    prompter.showPrompt();
  }
}

function classifyInputRoute(input: string): InputRoute {
  const text = input.trim().toLowerCase();
  const compact = text.replace(/\s+/g, "");

  if (/^(help|帮助|怎么用|如何使用|使用方法)$/.test(compact)) return { kind: "help" };
  if (/^(status|状态|当前状态)$/.test(compact)) return { kind: "status" };
  if (/^(graph|历史|记忆|经验图谱)$/.test(compact)) return { kind: "graph" };

  if (/^(auto|自动模式|切到auto|切换到auto|设置auto|用auto)$/.test(compact)) {
    return { kind: "set_mode", mode: "auto" };
  }
  if (/^(memory|memory模式|快速模式|切到memory|切换到memory|设置memory|用memory)$/.test(compact)) {
    return { kind: "set_mode", mode: "memory" };
  }
  if (/^(probe|probe模式|验证模式|切到probe|切换到probe|设置probe|用probe)$/.test(compact)) {
    return { kind: "set_mode", mode: "probe" };
  }

  const asksAboutMode =
    /(怎么|如何|怎样|咋|where|how).*(改|更改|切换|设置|change|switch).*(mode|模式)/i.test(input) ||
    /(mode|模式).*(怎么|如何|怎样|咋).*(改|更改|切换|设置|change|switch)/i.test(input) ||
    /^(mode|模式)$/.test(compact);
  if (asksAboutMode) return { kind: "mode_help" };

  const explicitCodingVerb = /(修复|修改|实现|新增|添加|删除|重构|检查|跑测试|build|test|fix|implement|add|remove|refactor|debug)/i.test(input);
  const codeTarget = /(\.ts|\.js|\.py|\.md|src\/|tests?\/|package\.json|bug|报错|代码|函数|接口|文件)/i.test(input);
  if (explicitCodingVerb || codeTarget) return { kind: "task_description", problem: input };

  return { kind: "help" };
}

function printStatus(mode: PEANMode, prompter?: RuntimePrompter) {
  const graph = GraphBuilder.load(GRAPH_PATH);
  const stats = getStats(graph);
  announce(prompter, `status | mode=${mode} model=deepseek-v4-pro graph=${stats.taskCount} tasks/${stats.patternCount} patterns pass=${(stats.passRate * 100).toFixed(0)}% escalate=${(stats.escalateRate * 100).toFixed(0)}%`);
}

function printGraph(prompter?: RuntimePrompter) {
  const graph = GraphBuilder.load(GRAPH_PATH);
  const stats = getStats(graph);
  announce(prompter, `graph | tasks=${stats.taskCount} patterns=${stats.patternCount} gates=${stats.gateEventCount} findings=${stats.findingCount} pass=${(stats.passRate * 100).toFixed(0)}%`);
}

function printHistory(prompter?: RuntimePrompter) {
  const history = prompter?.getHistory?.() ?? [];
  if (history.length === 0) {
    announce(prompter, "history is empty");
    return;
  }
  announce(prompter, "recent inputs:");
  for (const item of history.slice(-8)) announce(prompter, `- ${item}`);
}

function printTimeline(prompter?: RuntimePrompter) {
  const timeline = prompter?.getTimeline?.() ?? [];
  if (timeline.length === 0) {
    announce(prompter, "timeline is empty");
    return;
  }
  announce(prompter, "latest timeline:");
  for (const item of timeline.slice(-16)) announce(prompter, item);
}

function announce(prompter: RuntimePrompter | undefined, message: string) {
  if (prompter?.pushMessage) prompter.pushMessage(message);
  else console.log(`${message}\n`);
}

async function main() {
  const { mode, yes, json, problem, subcommand, subarg } = parseArgs();

  if (subcommand === "smoke" && subarg === "tradeoff-b") {
    await runSmoke();
    return;
  }
  if (subcommand === "report") {
    await runReport(subarg);
    return;
  }
  if (subcommand === "doctor") {
    await runDoctor();
    return;
  }

  // Ink mode: interactive TTY with no subcommand and no explicit problem
  if (!problem && !subcommand && process.stdin.isTTY && process.stdout.isTTY && !json) {
    await import("./ink/entry.js");
    await new Promise(() => {}); // keep alive until user exits
    return;
  }

  const prompter: RuntimePrompter = createPrompter();
  if (problem) {
    await runNonInteractive(problem, mode, yes, json, prompter);
  } else {
    await runInteractive(mode, prompter);
  }
  prompter.close();
}

function graphSummaryForStartup(): string {
  const stats = getStats(GraphBuilder.load(GRAPH_PATH));
  return stats.taskCount > 0
    ? `graph: ${stats.taskCount} tasks, ${stats.patternCount} patterns from history`
    : "graph: no history yet";
}

async function runSmoke() {
  const { execSync } = await import("node:child_process");
  console.log("Running tradeoff-b smoke test...\n");
  try {
    execSync("npx tsx scripts/tradeoff-b-smoke.ts", { cwd: process.cwd(), stdio: "inherit", timeout: 600_000 });
  } catch (e: any) {
    process.exit(e.status ?? 1);
  }
}

async function runReport(latestOrPath: string | null) {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const resultsDir = join(process.cwd(), "results");
  const files = readdirSync(resultsDir).filter((f) => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) { console.log("No results found."); return; }

  const target = latestOrPath ?? files[0]!;
  const path = target.startsWith("results/") ? join(process.cwd(), target) : join(resultsDir, target);
  if (!path.endsWith(".json")) { console.log("Not a JSON file:", target); return; }

  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw);

  // Print structured report
  console.log(`kevix report: ${target}`);
  console.log("=".repeat(50));
  if (data.test) console.log(`  Test:        ${data.test}`);
  if (data.model) console.log(`  Model:       ${data.model}`);
  if (data.passed !== undefined) console.log(`  Passed:      ${data.passed}`);
  if (data.phases) console.log(`  Phases:      ${Array.isArray(data.phases) ? data.phases.join(" → ") : data.phases}`);
  if (data.tradeoff_events !== undefined) console.log(`  Tradeoffs:   ${data.tradeoff_events}`);
  if (data.tradeoff_choice) console.log(`  Choice:      ${data.tradeoff_choice}`);
  if (data.api_calls) console.log(`  API calls:   ${data.api_calls}`);
  if (data.cache_values?.length) {
    const vals = data.cache_values as number[];
    console.log(`  Cache:       min ${Math.min(...vals).toFixed(0)}% / max ${Math.max(...vals).toFixed(0)}% / avg ${(vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(0)}%`);
  }
  if (data.error) console.log(`  Error:       ${data.error}`);
  if (data.results) console.log(`  Results:     ${Array.isArray(data.results) ? data.results.length + " items" : "present"}`);
  if (data.started_at) console.log(`  Started:     ${data.started_at}`);
  if (data.finished_at) console.log(`  Finished:    ${data.finished_at}`);
}

async function runDoctor() {
  const { execSync } = await import("node:child_process");
  const { existsSync } = await import("node:fs");
  console.log("kevix doctor");
  console.log("=".repeat(40));

  // API key
  const hasKey = !!process.env.DEEPSEEK_API_KEY;
  console.log(`  DEEPSEEK_API_KEY  ${hasKey ? "✅ set" : "❌ missing"}`);

  // Build
  try {
    execSync("npx tsc --noEmit", { cwd: process.cwd(), stdio: "pipe", timeout: 30_000 });
    console.log("  build (tsc)        ✅ PASS");
  } catch (e: any) {
    console.log("  build (tsc)        ❌ FAIL");
  }

  // Tests
  try {
    execSync("npx vitest run", { cwd: process.cwd(), stdio: "pipe", timeout: 30_000 });
    console.log("  tests (vitest)     ✅ PASS");
  } catch {
    console.log("  tests (vitest)     ❌ FAIL");
  }

  // Graph
  const graphPath = ".kevix/graph.json";
  if (existsSync(graphPath)) {
    const graph = JSON.parse((await import("node:fs")).readFileSync(graphPath, "utf-8"));
    const nodes = Object.keys(graph.nodes ?? {}).length;
    console.log(`  graph              ✅ ${nodes} nodes`);
  } else {
    console.log("  graph              ⚠ not found");
  }

  // Results
  const resultsDir = "results";
  if (existsSync(resultsDir)) {
    const files = (await import("node:fs")).readdirSync(resultsDir).filter((f: string) => f.endsWith(".json"));
    console.log(`  results/           ✅ ${files.length} files`);
  } else {
    console.log("  results/           ⚠ not found");
  }
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
