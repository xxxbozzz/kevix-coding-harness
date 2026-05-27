#!/usr/bin/env npx tsx
/**
 * Kevix SWE-bench Runner
 * Runs SWE-bench instances through Kevix engine (memory/probe/auto).
 * Outputs predictions + cache metrics for official Docker evaluation.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-xxx npx tsx scripts/swebench-runner.ts --mode auto --limit 5
 *   DEEPSEEK_API_KEY=sk-xxx npx tsx scripts/swebench-runner.ts --mode all --limit 50
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DeepSeekProvider } from "../src/provider/deepseek.js";
import { runAgentLoop } from "../src/loop/agent-loop.js";
import { bashDefinition, executeBash } from "../src/tools/bash.js";
import { readDefinition, executeRead } from "../src/tools/read.js";
import { writeDefinition, executeWrite } from "../src/tools/write.js";
import { editDefinition, executeEdit } from "../src/tools/edit.js";
import { grepDefinition, executeGrep } from "../src/tools/grep.js";
import { globDefinition, executeGlob } from "../src/tools/glob.js";
import type { ToolDefinition, ToolCall, ToolResult, EngineEvent, PEANMode } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = resolve(__dirname, "..");
const KEVIX_ROOT = resolve(ENGINE_ROOT, "..");

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error("DEEPSEEK_API_KEY not set"); process.exit(1); }

const TOOLS: ToolDefinition[] = [bashDefinition, readDefinition, writeDefinition, editDefinition, grepDefinition, globDefinition];

async function executeTool(call: ToolCall): Promise<ToolResult> {
  const name = call.function.name;
  let args: Record<string, unknown>;
  try { args = JSON.parse(call.function.arguments); } catch { return { tool_call_id: call.id, content: "Invalid JSON args", is_error: true }; }
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

interface Instance {
  instance_id: string;
  repo: string;
  problem_statement: string;
  hints_text?: string;
  base_commit: string;
  category?: string;
}

interface RunResult {
  instance_id: string;
  mode: string;
  patch: string | null;
  patch_chars: number;
  phases: string[];
  api_calls: number;
  cache_hit_pct: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tradeoff_events: number;
  tradeoff_choice: string | null;
  need_probe: boolean | null;
  error: string | null;
  duration_ms: number;
}

async function runInstance(inst: Instance, mode: PEANMode): Promise<RunResult> {
  const t0 = Date.now();
  const cacheValues: number[] = [];
  const phases: string[] = [];
  let promptTokens = 0, completionTokens = 0;
  let tradeoffEvents = 0;
  let tradeoffChoice: string | null = null;
  let needProbe: boolean | null = null;
  let error: string | null = null;
  let patch: string | null = null;

  const provider = new DeepSeekProvider(API_KEY, { model: "deepseek-v4-pro" });
  const tools = { definitions: TOOLS, execute: executeTool };

  const problem = `## SWE-bench Task: ${inst.instance_id}

Repository: ${inst.repo}

${inst.problem_statement}

## Instructions
Fix the bug described above. Output ONLY a unified diff patch.
Start your patch with \`\`\`diff and end with \`\`\`.
Do NOT modify files outside the scope of the fix.`;

  try {
    const summary = await runAgentLoop({
      provider, tools, mode,
      problem,
      taskId: inst.instance_id,
      approvalMode: "manual",
      onApprovalRequired: async () => "approve" as const,

      onTradeoffRequired: async (evidence) => {
        tradeoffEvents++;
        tradeoffChoice = "B"; // Upgrade to probe
        console.log(`  ↳ Tradeoff: ${evidence.activeSignals.join(", ")} → upgrade to probe`);
        return "B";
      },

      onEvent: (e: EngineEvent) => {
        switch (e.type) {
          case "step_complete":
            if (e.phase) phases.push(e.phase);
            break;
          case "api_call":
            cacheValues.push(e.usage.cache_hit_ratio);
            promptTokens = e.usage.prompt_tokens;
            completionTokens = e.usage.completion_tokens;
            break;
          case "decision":
            needProbe = e.need_probe;
            break;
          case "result":
            // Extract patch from response
            if (e.summary.patch_path) {
              try { patch = readFileSync(e.summary.patch_path, "utf-8"); } catch {}
            }
            break;
          case "error":
            error = e.message;
            break;
        }
      },
    });

    // Try to extract patch from the agent's output
    if (!patch) {
      // TODO: parse patch from the tool output
      console.log("  ⚠️  No patch extracted from engine output");
    }

  } catch (e: any) {
    error = e.message ?? String(e);
  }

  const avgCache = cacheValues.length > 0 ? cacheValues.reduce((a,b) => a+b, 0) / cacheValues.length : 0;

  return {
    instance_id: inst.instance_id,
    mode,
    patch,
    patch_chars: patch?.length ?? 0,
    phases,
    api_calls: cacheValues.length,
    cache_hit_pct: Math.round(avgCache * 100) / 100,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    tradeoff_events: tradeoffEvents,
    tradeoff_choice: tradeoffChoice,
    need_probe: needProbe,
    error,
    duration_ms: Date.now() - t0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args[args.indexOf("--mode") + 1] ?? "auto";
  const limitArg = parseInt(args[args.indexOf("--limit") + 1] ?? "5");
  const offsetArg = parseInt(args[args.indexOf("--offset") + 1] ?? "0");

  const instancesPath = resolve(KEVIX_ROOT, "instances_100.json");
  const allInstances: Instance[] = JSON.parse(readFileSync(instancesPath, "utf-8"));
  const instances = allInstances.slice(offsetArg, offsetArg + limitArg);

  const modes: PEANMode[] = modeArg === "all" ? ["memory", "probe", "auto"] : [modeArg as PEANMode];

  console.log("=".repeat(70));
  console.log(`  Kevix SWE-bench Runner`);
  console.log("=".repeat(70));
  console.log(`  Instances: ${instances.length} (offset=${offsetArg})`);
  console.log(`  Modes: ${modes.join(", ")}`);
  console.log(`  Model: deepseek-v4-pro`);
  console.log();

  const results: RunResult[] = [];

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!;
    for (const mode of modes) {
      const idx = offsetArg + i;
      console.log(`[${idx}/${offsetArg + limitArg}] ${inst.instance_id} [${mode}] cat=${inst.category}`);
      const r = await runInstance(inst, mode);
      results.push(r);

      const status = r.error ? "FAIL" : (r.patch && r.patch.length > 50 ? "OK" : "NO_PATCH");
      console.log(`  ${status} | ${r.api_calls} calls | cache ${r.cache_hit_pct}% | ${r.total_tokens} tokens | ${r.duration_ms}ms`);
      if (r.need_probe !== null) console.log(`  Probe: ${r.need_probe ? "UPGRADED" : "skipped"}`);
      if (r.tradeoff_events > 0) console.log(`  Tradeoff: ${r.tradeoff_events} events`);
      if (r.error) console.log(`  Error: ${r.error.slice(0, 150)}`);
      console.log();
    }
  }

  // Save results
  const outDir = resolve(KEVIX_ROOT, "results");
  mkdirSync(outDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outPath = resolve(outDir, `swebench-${date}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  // Summary
  console.log("=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));
  for (const mode of modes) {
    const mr = results.filter(r => r.mode === mode);
    const ok = mr.filter(r => !r.error && r.patch && r.patch.length > 50).length;
    const avgCache = mr.length > 0 ? mr.reduce((s, r) => s + r.cache_hit_pct, 0) / mr.length : 0;
    const avgTokens = mr.length > 0 ? mr.reduce((s, r) => s + r.total_tokens, 0) / mr.length : 0;
    const upgrades = mr.filter(r => r.need_probe).length;
    console.log(`  ${mode}: ${ok}/${mr.length} patches | avg cache ${avgCache.toFixed(1)}% | avg tokens ${avgTokens.toFixed(0)} | ${upgrades} probe upgrades`);
  }

  console.log(`\n  Results: ${outPath}`);
  process.exit(0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
