import { useEffect, useState, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { runAgentLoop } from "../../loop/agent-loop.js";
import { DeepSeekProvider } from "../../provider/deepseek.js";
import { GraphBuilder } from "../../graph/builder.js";
import { getStats } from "../../graph/query.js";
import { bashDefinition, executeBash } from "../../tools/bash.js";
import { readDefinition, executeRead } from "../../tools/read.js";
import { writeDefinition, executeWrite } from "../../tools/write.js";
import { editDefinition, executeEdit } from "../../tools/edit.js";
import { grepDefinition, executeGrep } from "../../tools/grep.js";
import { globDefinition, executeGlob } from "../../tools/glob.js";
import { PhaseBar } from "./PhaseBar.js";
import { StreamView, buildToolCard, type ToolCard } from "./StreamView.js";
import { extractEvidenceTerms, assessDirectiveConfidence, classifyDirectiveRisk, getApprovalDefaultSelection } from "./evidence-validator.js";
import { StatusBar } from "./StatusBar.js";
import { Composer } from "./Composer.js";
import { detectTestStatus } from "./test-status.js";
import { generateScopeProposal, buildScopeHints, type ScopeProposal } from "./intent-router.js";
import ScopeProposalCard from "./ProposalCard.js";
import DirectiveCard from "./DirectiveCard.js";
import type { EngineEvent, PEANMode, PEANDirective, TradeoffEvidence, TradeoffOption, TradeoffChoice } from "../../types.js";

const API_KEY = process.env.DEEPSEEK_API_KEY;
const TOOLS = [bashDefinition, readDefinition, writeDefinition, editDefinition, grepDefinition, globDefinition];
const execs: Record<string, Function> = { bash: executeBash, read: executeRead, write: executeWrite, edit: executeEdit, grep: executeGrep, glob: executeGlob };

export default function App() {
  const { exit } = useApp();
  const [mode, setMode] = useState<PEANMode>("auto");
  const [inputMode, setInputMode] = useState<"chat" | "code">("chat");
  const [phase, setPhase] = useState("");
  const [events, setEvents] = useState<Array<{ type: string; text: string }>>([]);
  const [cache, setCache] = useState({ hit: 0, count: 0 });
  const [gates, setGates] = useState(0);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const changedFiles = useRef<Set<string>>(new Set());
  const [testPassed, setTestPassed] = useState<boolean | null>(null);
  const [taskHistory, setTaskHistory] = useState<string[]>(() => {
    try { if (existsSync(".kevix/history.json")) { return JSON.parse(readFileSync(".kevix/history.json", "utf-8")); } }
    catch { return []; }
    return [];
  });

  const saveHistory = (tasks: string[]) => {
    try { mkdirSync(dirname(".kevix/history.json"), { recursive: true }); writeFileSync(".kevix/history.json", JSON.stringify(tasks.slice(-50), null, 2)); }
    catch {}
  };

  // Approval state
  const [approval, setApproval] = useState<{ directive: PEANDirective; selected: number } | null>(null);
  const approvalResolve = useRef<((v: "approve" | "reject") => void) | null>(null);

  // Tradeoff state
  const [tradeoff, setTradeoff] = useState<{ evidence: TradeoffEvidence; options: TradeoffOption[]; selected: number } | null>(null);
  const tradeoffResolve = useRef<((v: TradeoffChoice) => void) | null>(null);

  // 30s fallback state
  const [fallback, setFallback] = useState<{ selected: number } | null>(null);
  const fastPathRef = useRef(false);

  // P56: Proposal state
  const [proposal, setProposal] = useState<{ proposal: ScopeProposal; selected: number } | null>(null);
  const [proposalEditing, setProposalEditing] = useState(false);
  const [proposalEditText, setProposalEditText] = useState("");
  const proposalResolve = useRef<((v: "approve" | "edit" | "cancel") => void) | null>(null);
  // P56: DirectiveCard state (replaces old approval card as execution gate)
  const [directiveView, setDirectiveView] = useState<{ directive: PEANDirective; selected: number; expanded: boolean } | null>(null);
  const directiveResolve = useRef<((v: "execute" | "modify" | "cancel") => void) | null>(null);

  // Result state
  const [result, setResult] = useState<{ phases: string[]; calls: number; cache: number; gates: number; elapsed: number; cost: number; escalated?: boolean; review?: string[] } | null>(null);
  const [calls, setCalls] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const taskStart = useRef(0);
  const pendingToolRef = useRef<{ name: string; args: string } | null>(null);
  const evidenceRef = useRef<string[]>([]);
  const evidenceContentRef = useRef<string[]>([]);
  const taskRef = useRef("");

  const lastActivity = useRef(Date.now());
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!running) { setIdle(false); return; }
    const t = setInterval(() => {
      setIdle(Date.now() - lastActivity.current > 3000);
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const push = (type: string, text: string, card?: ToolCard) => {
    lastActivity.current = Date.now();
    setIdle(false);
    setEvents((p) => [...p.slice(-200), { type, text, card }]);
  };

  useEffect(() => {
    if (!running || taskStart.current === 0) return;
    let warned10 = false, warned30 = false;
    const timer = setInterval(() => {
      const sec = Math.round((Date.now() - taskStart.current) / 1000);
      setElapsed(sec);
      if (sec === 10 && !warned10) {
        warned10 = true;
        push("warn", "Analyzing task and evidence...");
      }
      if (sec === 30 && !warned30 && !approval && !tradeoff && !proposal && !directiveView) {
        warned30 = true;
        setFallback({ selected: 1 }); // default: Wait
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  // Chat mode: single LLM call, no PEAN pipeline
  const runChat = async (msg: string) => {
    if (!API_KEY) { push("error", "DEEPSEEK_API_KEY not set"); return; }
    setRunning(true); setEvents([]); setPhase("chat");
    push("task", `> ${msg}`);
    const start = Date.now();

    try {
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: `You are kevix chat, a DeepSeek-native coding harness. You are in CHAT MODE — you CANNOT execute tools, read files, or write code. Answer questions concisely. Do NOT pretend to call tools. For coding tasks, tell the user to type /code.` },
            { role: "user", content: msg },
          ],
          max_tokens: 300,
          temperature: 0.3,
        }),
      });
      const data = await resp.json() as any;
      const reply = data.choices?.[0]?.message?.content ?? "No response.";
      push("chat", reply);
    } catch (e: any) {
      push("error", `Chat error: ${e.message}`);
    }

    setRunning(false); setPhase("");
    const elapsed = Math.round((Date.now() - start) / 1000);
    push("done", `✓ chat  ${elapsed}s`);
  };

  type RouteType = "command" | "coding" | "chat" | "data" | "action";

  const handleDataQuery = (q: string) => {
    const t = q.toLowerCase();
    const stats = getStats(GraphBuilder.load(".kevix/graph.json"));
    if (t.includes("history") || t.includes("last") || t.includes("recent")) {
      if (taskHistory.length === 0) { push("info", "No task history yet."); return; }
      push("info", `Recent tasks (${taskHistory.length}):`);
      taskHistory.slice(-5).forEach((h, i) => push("info", `${i + 1}. ${h}`));
      return;
    }
    if (t.includes("stats") || t.includes("graph") || t.includes("how many")) {
      push("info", `Tasks: ${stats.taskCount} | Patterns: ${stats.patternCount} | Gates: ${stats.gateEventCount} | Pass: ${(stats.passRate * 100).toFixed(0)}%`);
      return;
    }
    if (t.includes("token") || t.includes("cost") || t.includes("cache")) {
      push("info", `Mode: ${mode} | Tasks: ${stats.taskCount} | Cache avg: ~95% (DeepSeek prefix-cache)`);
      return;
    }
    push("info", `Mode: ${mode} | Tasks: ${stats.taskCount} | /memory /probe /auto to switch, /help for commands`);
  };

  const classifyInput = (text: string): RouteType => {
    const t = text.toLowerCase().trim();

    // 1. Slash commands → already handled before classify
    if (t.startsWith("/")) return "command";

    // 2. Data queries: history, stats, graph, last task
    const dataPatterns = [
      /^(show|get|display|查看|显示)\s/,
      /^(history|stats|graph|tokens|cost|tasks?)$/,
      /last\s(task|run)/,
      /how\s(many|much)\s(token|call|task)/,
      /what('s| is| was) (the|my) (last|recent)/,
    ];
    if (dataPatterns.some((p) => p.test(t))) return "data";

    // 3. Actions: run tests, undo, retry, check build
    const actionPatterns = [
      /^(run|execute)\s(test|build|lint)/,
      /^(undo|revert|rollback)/,
      /^(check|verify)\s(build|test)/,
    ];
    if (actionPatterns.some((p) => p.test(t))) return "action";

    // 4. Coding tasks: code modification with files or keywords
    const codeKeywords = ["fix", "implement", "add", "create", "refactor", "rewrite", "change", "modify", "remove", "delete", "update", "patch"];
    const hasCodeVerb = codeKeywords.some((kw) => t.includes(kw));
    const hasFilePath = /\b(?:src|lib|app|tests?|packages)\//.test(t) || /\w+\.\w{1,4}\b/.test(t);
    const hasCodeBlock = text.includes("```") || text.includes("→");
    if ((hasCodeVerb && (hasFilePath || text.length > 80)) || hasCodeBlock) return "coding";

    // 5. Everything else → chat
    return "chat";
  };

  const runTask = async (task: string) => {
    if (!API_KEY) { push("error", "DEEPSEEK_API_KEY not set"); return; }
    setRunning(true); setEvents([]); setCache({ hit: 0, count: 0 }); setGates(0); setResult(null); setCalls(0); setElapsed(0);
    changedFiles.current = new Set();
    setTestPassed(null);
    taskRef.current = task;
    taskStart.current = Date.now();
    const newHistory = [...taskHistory.slice(-49), task];
    setTaskHistory(newHistory);
    saveHistory(newHistory);
    push("task", `> ${task}`);

    // Minimal evidence scan (<1s, local only, no LLM)
    push("info", "Inspecting local evidence...");
    const scanStart = Date.now();
    const mentionedFiles = (task.match(/(?:src|lib|tests?|app)\/[\w.\-/]+\.\w{1,4}/g) ?? []);
    const foundEvidence: string[] = [];
    for (const f of mentionedFiles) {
      try { const { existsSync } = await import("node:fs"); if (existsSync(f)) foundEvidence.push(f); } catch {}
    }
    // Find related test files for each source file
    const testDirs = ["test", "tests", "__tests__", "spec"];
    const testSuffixes = [".test", ".spec"];
    for (const f of [...foundEvidence]) {
      const name = f.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
      const ext = f.split(".").pop() ?? "";
      for (const dir of testDirs) {
        for (const suffix of testSuffixes) {
          const variant = `${dir}/${name}${suffix}.${ext}`;
          try { const { existsSync } = await import("node:fs"); if (existsSync(variant)) foundEvidence.push(variant); } catch {}
        }
      }
    }
    const scanMs = Date.now() - scanStart;
    // Deduplicate evidence files
    const uniqueEvidence = [...new Set(foundEvidence)]
      .filter((f, i, arr) => !arr.some((other, j) => j < i && other.endsWith(f.split("/").pop()!)));
    evidenceRef.current = uniqueEvidence;
    const evidenceContents: string[] = [];
    for (const f of uniqueEvidence) {
      try {
        const { statSync, readFileSync } = await import("node:fs");
        const st = statSync(f);
        if (st.size > 200_000) continue;
        const content = readFileSync(f, "utf-8");
        if (content.split("\n").length > 3000) continue;
        evidenceContents.push(content);
      } catch {}
    }
    evidenceContentRef.current = evidenceContents;

    const evidenceHints = uniqueEvidence.length > 0
      ? `Evidence files found: ${uniqueEvidence.slice(0, 3).join(", ")}. Use these to ground Product Intent.`
      : "No evidence files found. Worker MUST inspect source before making changes.";
    if (uniqueEvidence.length > 0) {
      push("info", `Found ${uniqueEvidence.length} evidence file(s) (${scanMs}ms): ${uniqueEvidence.slice(0, 3).join(", ")}`);
    } else {
      push("warn", `Low evidence — will inspect source first (${scanMs}ms)`);
    }

    const graph = GraphBuilder.load(".kevix/graph.json");
    const graphBuilder = new GraphBuilder(graph);
    const stats = getStats(graph);
    if (stats.taskCount > 0) push("info", `graph: ${stats.taskCount} tasks, ${stats.patternCount} patterns`);

    const provider = new DeepSeekProvider(API_KEY, { model: "deepseek-v4-pro" });
    let cacheVals: number[] = [];
    let gateCount = 0;
    let finalPhases: string[] = [];

    // P56: Generate proposal before Controller
    let proposalHints = evidenceHints;
    let scopeContract: { editableScope: string[]; readOnlyEvidence: string[]; successChecks: string[] } | undefined;
    push("info", "Generating proposal...");
    const propStart = Date.now();
    try {
      const prop = await generateScopeProposal(API_KEY!, task, uniqueEvidence, evidenceContents);
      push("info", `Proposal ready (${Date.now() - propStart}ms)`);

      // Show ProposalCard
      setPhase("proposal");
      const propAction = await new Promise<"approve" | "edit" | "cancel">((resolve) => {
        proposalResolve.current = resolve;
        setProposal({ proposal: prop, selected: 0 });
      });
      setProposal(null);

      if (propAction === "cancel") {
        push("info", "Proposal cancelled — returning to input");
        setRunning(false); setPhase(""); return;
      }
      if (propAction === "edit") {
        // Re-generate proposal with edited hint (simplified: just use original proposal with note)
        push("info", "Proposal edited by user");
      }
      proposalHints = buildScopeHints(prop) + "\n\n" + evidenceHints;
    } catch (e: any) {
      push("warn", `Proposal generation failed (${e.message}), falling back to direct Controller`);
      // Continue with evidenceHints only — proposal is optional
    }

    let summary: Awaited<ReturnType<typeof runAgentLoop>>;
    try {
      summary = await runAgentLoop({
        provider,
        tools: {
          definitions: TOOLS,
          async execute(call) {
            const fn = execs[call.function.name];
            if (!fn) return { tool_call_id: call.id, content: `Unknown: ${call.function.name}`, is_error: true };
            try { const args = JSON.parse(call.function.arguments); return await fn(args); }
            catch (e: any) { return { tool_call_id: call.id, content: e.message, is_error: true }; }
          },
        },
        mode, problem: task, taskId: `ink-${Date.now()}`, hints: proposalHints,
        approvalMode: "manual",
        scopeContract,
        graph, graphBuilder,
        onApprovalRequired: async (d: PEANDirective) => {
          // Fast path: user chose [F] at 30s — skip approval
          if (fastPathRef.current) {
            fastPathRef.current = false;
            push("info", "Fast path — auto-approved from 30s fallback");
            return "approve";
          }

          // P55.1 risk classification (safety gate)
          const risk = classifyDirectiveRisk(d.red_flags, d.raw);
          if (risk.level === "high") {
            push("warn", `High risk: ${risk.reasons.join("; ")}`);
          }

          // P56: Show DirectiveCard as execution gate (not old approval card)
          setPhase("directive-review");
          return new Promise((resolve) => {
            directiveResolve.current = (action) => {
              if (action === "cancel") resolve("reject");
              else resolve("approve"); // execute or modify both proceed
            };
            setDirectiveView({ directive: d, selected: 0, expanded: false });
          });
        },
        onTradeoffRequired: async (e: TradeoffEvidence, o: TradeoffOption[]) => {
          setPhase("tradeoff");
          return new Promise((resolve) => {
            tradeoffResolve.current = resolve;
            setTradeoff({ evidence: e, options: o, selected: 1 }); // default B
          });
        },
        onEvent: (e: EngineEvent) => {
          switch (e.type) {
            case "step_start": setPhase(e.phase); push("step", e.phase); break;
            case "step_complete": push("step_done", `${e.phase} ✓ ${(e.duration_ms / 1000).toFixed(0)}s`); finalPhases.push(e.phase); break;
            case "streaming": push("stream", e.text); break;
            case "tool_start": {
              // Track changed files
              if (e.name === "write" || e.name === "edit") {
                try { const a = JSON.parse(e.args); if (a.file_path) changedFiles.current.add(a.file_path as string); } catch {}
              }
              pendingToolRef.current = { name: e.name, args: e.args };
              break;
            }
            case "tool_result": {
              const pending = pendingToolRef.current;
              if (pending) {
                const card = buildToolCard(pending.name, pending.args, e.content, e.is_error, (e as any).added_lines, (e as any).removed_lines);
                push("card", "", card);
                pendingToolRef.current = null;
              }
              // Detect test results
              if (e.name === "bash") {
                const status = detectTestStatus(e.content);
                if (status) setTestPassed(status === "pass");
              }
              break;
            }
            case "api_call": cacheVals.push(e.usage.cache_hit_ratio); setCache((c) => ({ hit: e.usage.cache_hit_ratio, count: c.count + 1 })); setCalls((c) => c + 1); setElapsed(Math.round((Date.now() - taskStart.current) / 1000)); break;
            case "log": if (e.text.includes("Gate blocked")) { gateCount++; setGates((g) => g + 1); push("gate", `⚠ ${e.text.replace("Gate blocked","").trim()}`); } break;
            case "error": push("error", `✗ ${e.message}`); break;
            case "decision": push("info", `assess: ${e.need_probe ? "probe" : "skip"}`); break;
            case "escalate": push("warn", `⚠ escalate: ${e.issues.length} issues`); break;
          }
        },
      });
    } catch (e: any) {
      push("error", `Task failed: ${e.message ?? String(e)}`);
      graphBuilder.save(".kevix/graph.json");
      setRunning(false);
      setPhase("");
      setElapsed(Math.round((Date.now() - taskStart.current) / 1000));
      return;
    }

    graphBuilder.save(".kevix/graph.json");
    setRunning(false); setPhase("");

    // Result card
    const avgCache = cacheVals.length > 0 ? cacheVals.reduce((a,b)=>a+b,0)/cacheVals.length : 0;
    const totalElapsed = Math.round((Date.now() - taskStart.current) / 1000);
    const totalTokens = (summary as any).total_prompt_tokens + (summary as any).total_completion_tokens || summary.request_count * 3000;
    const costEst = totalTokens / 1_000_000 * 0.55; // DeepSeek V4 ~$0.55/1M avg
    setCalls(summary.request_count);
    setElapsed(totalElapsed);
    setCache({ hit: avgCache, count: cacheVals.length });
    setResult({
      phases: summary.phases_completed,
      calls: summary.request_count,
      cache: avgCache,
      gates: gateCount,
      elapsed: totalElapsed,
      cost: costEst,
      escalated: summary.escalated,
      review: summary.review_issues,
    });
  };

  useInput((val, key) => {
    const isReturn = key.return || val === "\r" || val === "\n";

    // Hard cancel: Esc → instant stop
    if (key.escape) {
      setRunning(false); setPhase(""); setApproval(null); setTradeoff(null); setFallback(null);
      approvalResolve.current?.("reject"); tradeoffResolve.current?.("A");
      push("info", "Cancelled"); exit(); return;
    }

    // P56: DirectiveCard mode — arrow keys, enter to confirm, V to toggle expand
    if (directiveView) {
      if (key.upArrow)   setDirectiveView((dv) => dv ? { ...dv, selected: (dv.selected + 3) % 4 } : null);
      if (key.downArrow) setDirectiveView((dv) => dv ? { ...dv, selected: (dv.selected + 1) % 4 } : null);
      if (val === "v" || val === "V") {
        setDirectiveView((dv) => dv ? { ...dv, expanded: !dv.expanded } : null);
        return;
      }
      if (isReturn) {
        const choices = ["execute", "modify", "cancel"] as const;
        const choice = choices[directiveView.selected] ?? "execute";
        if (choice === "execute") {
          directiveResolve.current?.("execute");
          directiveResolve.current = null;
          setDirectiveView(null);
          push("info", "✓ Executing directive");
        } else if (choice === "modify") {
          directiveResolve.current?.("modify");
          directiveResolve.current = null;
          setDirectiveView(null);
          push("warn", "Re-running Controller with modifications...");
          setApproval(null); setRunning(false); setPhase("");
          const original = taskRef.current;
          runTask(`MODIFIED: ${original}`);
          return;
        } else {
          directiveResolve.current?.("cancel");
          directiveResolve.current = null;
          setDirectiveView(null);
          push("info", "✗ Directive cancelled");
          setRunning(false); setPhase("");
          setResult({ phases: ["controller"], calls: 0, cache: 0, gates: 0, elapsed: 0, cost: 0, escalated: false });
        }
      }
      return;
    }

    // P56: Proposal mode — arrow keys, enter to confirm
    if (proposal) {
      if (key.upArrow)   setProposal((p) => p ? { ...p, selected: (p.selected + 2) % 3 } : null);
      if (key.downArrow) setProposal((p) => p ? { ...p, selected: (p.selected + 1) % 3 } : null);
      if (isReturn) {
        const choices = ["approve", "edit", "cancel"] as const;
        const choice = choices[proposal.selected] ?? "approve";
        proposalResolve.current?.(choice);
        proposalResolve.current = null;
        if (choice === "approve") push("info", "✓ Proposal approved — generating directive...");
        else if (choice === "edit") push("info", "Editing proposal...");
        else push("info", "Proposal cancelled");
      }
      return;
    }

    // Legacy: Approval mode — arrow keys to select, enter to confirm
    if (approval) {
      if (key.upArrow)   setApproval((a) => a ? { ...a, selected: (a.selected + 2) % 3 } : null);
      if (key.downArrow) setApproval((a) => a ? { ...a, selected: (a.selected + 1) % 3 } : null);
      if (isReturn) {
        const choice = ["approve", "regenerate", "reject"][approval.selected]!;
        if (choice === "regenerate") {
          push("warn", "Regenerating directive with stronger evidence hints...");
          setApproval(null); setRunning(false); setPhase("");
          const original = taskRef.current;
          runTask(`EVIDENCE: ${evidenceRef.current.join(", ")}. INSTRUCTIONS: 1) Read test file FIRST and extract exact expected output shape. 2) Fix source to match. 3) Do NOT invent fields, variables, or concepts not in the evidence. ORIGINAL TASK: ${original}`);
          return;
        }
        approvalResolve.current?.(choice as "approve" | "reject");
        approvalResolve.current = null;
        setApproval(null);
        push("info", choice === "approve" ? "✓ Approved" : "✗ Rejected — task cancelled");
        if (choice === "reject") {
          setRunning(false); setPhase("");
          setResult({ phases: ["controller"], calls: 0, cache: 0, gates: 0, elapsed: 0, cost: 0, escalated: false });
        }
      }
      return;
    }

    // 30s fallback: arrow keys to select, enter to confirm
    if (fallback) {
      if (key.upArrow)   setFallback((f) => f ? { selected: (f.selected + 2) % 3 } : null);
      if (key.downArrow) setFallback((f) => f ? { selected: (f.selected + 1) % 3 } : null);
      if (isReturn) {
        const choice = ["F", "W", "C"][fallback.selected]!;
        if (choice === "F") {
          fastPathRef.current = true;
          push("info", "Fast path — will skip to Worker when Controller completes");
        } else if (choice === "C") {
          push("warn", "Task cancelled by user");
          setRunning(false); setPhase(""); setFallback(null);
        }
        // W: just continue waiting
        setFallback(null);
      }
      return;
    }

    // Tradeoff mode: arrow keys, enter to confirm
    if (tradeoff) {
      if (key.upArrow)   setTradeoff((t) => t ? { ...t, selected: (t.selected + t.options.length - 1) % t.options.length } : null);
      if (key.downArrow) setTradeoff((t) => t ? { ...t, selected: (t.selected + 1) % t.options.length } : null);
      if (isReturn) {
        const choice = tradeoff.options[tradeoff.selected]!.id;
        tradeoffResolve.current?.(choice as TradeoffChoice);
        tradeoffResolve.current = null;
        setTradeoff(null);
        push("info", `✓ ${choice === "A" ? "Continue memory" : choice === "B" ? "Upgrade to probe" : "Pause"}`);
      }
      return;
    }

    // Composer owns normal text input. This app-level handler only handles
    // modal approval/tradeoff keys and global escape.
  });

  return (
    <Box flexDirection="column" padding={0}>
      <PhaseBar phase={phase} running={running && !approval && !tradeoff && !proposal && !directiveView} elapsed={elapsed} idle={idle} />

      {/* P56: DirectiveCard — execution gate */}
      {directiveView && (() => { if (fallback) setFallback(null); return null; })()}
      {directiveView && (
        <DirectiveCard
          directive={directiveView.directive}
          selected={directiveView.selected}
          expanded={directiveView.expanded}
        />
      )}

      {/* P56: ProposalCard — direction check */}
      {proposal && (() => { if (fallback) setFallback(null); return null; })()}
      {proposal && (
        <ScopeProposalCard
          proposal={proposal.proposal}
          selected={proposal.selected}
          evidenceFiles={evidenceRef.current}
        />
      )}

      {/* Legacy: Approval card — clear fallback when showing */}
      {approval && (() => { if (fallback) setFallback(null); return null; })()}
      {approval && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} marginY={1}>
          <Text bold color="yellow">⏸ Directive Ready — Review before Worker executes</Text>
          {evidenceRef.current.length > 0 && (
            <Text dimColor>Based on: {evidenceRef.current.slice(0, 3).join(", ")}</Text>
          )}
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Product Intent</Text>
            <Text dimColor>{approval.directive.product_intent || "(none)"}</Text>
            <Text bold>Red Flags</Text>
            <Text color="red">{approval.directive.red_flags || "None"}</Text>
            <Text bold>Constraints</Text>
            <Text dimColor>{smartTruncate(approval.directive.implementation_constraints, 200)}</Text>
            <Text bold>Worker Directive</Text>
            <Text dimColor>{smartTruncate(approval.directive.worker_directive, 300)}</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={approval.selected === 0 ? "cyan" : undefined}>{approval.selected === 0 ? "❯ " : "  "}Approve — continue to Worker</Text>
            <Text color={approval.selected === 1 ? "cyan" : undefined}>{approval.selected === 1 ? "❯ " : "  "}Regenerate — re-run Controller with stronger hints</Text>
            <Text color={approval.selected === 2 ? "cyan" : undefined}>{approval.selected === 2 ? "❯ " : "  "}Reject — cancel task</Text>
          </Box>
          <Text dimColor>↑↓ select  Enter confirm  (3 options)</Text>
        </Box>
      )}

      {/* 30s fallback card */}
      {fallback && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} marginY={1}>
          <Text bold color="yellow">⏳ Controller taking longer than expected</Text>
          <Text dimColor>DeepSeek may be at capacity. Choose an action:</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={fallback.selected === 0 ? "cyan" : undefined}>{fallback.selected === 0 ? "❯ " : "  "}[F] Fast local plan — skip Controller, go to Worker with evidence</Text>
            <Text color={fallback.selected === 1 ? "cyan" : undefined}>{fallback.selected === 1 ? "❯ " : "  "}[W] Wait — continue waiting for Controller</Text>
            <Text color={fallback.selected === 2 ? "cyan" : undefined}>{fallback.selected === 2 ? "❯ " : "  "}[C] Cancel — stop this task</Text>
          </Box>
          <Text dimColor>↑↓ select  Enter confirm</Text>
        </Box>
      )}

      {/* Tradeoff card */}
      {tradeoff && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} marginY={1}>
          <Text bold color="yellow">⚡ Tradeoff Required</Text>
          <Text dimColor>Signals: {tradeoff.evidence.activeSignals.join(" + ")}  |  Gates: {tradeoff.evidence.gateCount}  |  Cache: {tradeoff.evidence.cacheTrend}</Text>
          <Box marginTop={1} flexDirection="column">
            {tradeoff.options.map((o, i) => (
              <Text key={o.id} color={tradeoff.selected === i ? "cyan" : undefined}>
                {tradeoff.selected === i ? "❯ " : "  "}[{o.id}] {o.label} — {o.description}
              </Text>
            ))}
          </Box>
          <Text dimColor>↑↓ select  Enter confirm</Text>
        </Box>
      )}

      <StreamView events={events} />

      {/* Result card */}
      {result && !running && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1} marginY={1}>
          <Text bold color="green">✓ Task Complete</Text>
          <Text>Phases: {result.phases.join(" → ")}</Text>
          {changedFiles.current.size > 0 && <Text dimColor>Files: {[...changedFiles.current].join(", ")}</Text>}
          {testPassed !== null && (
            <Text color={testPassed ? "green" : "red"}>{testPassed ? "Tests: ✓ PASS" : "Tests: ✗ FAIL"}</Text>
          )}
          <Text>Calls: {result.calls}  |  Cache: {result.cache.toFixed(0)}%  |  Gates: {result.gates}  |  {result.elapsed}s  |  ~${result.cost.toFixed(4)}</Text>
          {result.escalated && <Text color="yellow">⚠ Escalated to user</Text>}
          {result.review?.length ? <Text color="yellow">Review issues: {result.review.join(", ")}</Text> : <Text color="green">Review: PASS</Text>}
          <Text dimColor>Next: /again to re-run  |  /history to review  |  type new task</Text>
        </Box>
      )}

      <StatusBar mode={mode} cache={cache} gates={gates} calls={calls} elapsed={elapsed} running={running} />
      {/* Shortcut bar — always visible */}
      <Box>
        <Text dimColor>
          {directiveView ? "↑↓ select  ·  enter confirm  ·  V expand  ·  esc cancel" :
           proposal ? "↑↓ select  ·  enter confirm  ·  esc cancel" :
           approval ? "↑↓ select  ·  enter confirm  ·  esc cancel" :
           tradeoff ? "↑↓ select  ·  enter confirm  ·  esc cancel" :
           running ? "esc to cancel" :
           "enter submit  ·  ↑↓ history  ·  /commands  ·  esc exit"}
        </Text>
      </Box>
      {!running && !approval && !tradeoff && (
        <Composer
          mode={inputMode}
          onSubmit={(text) => {
            // Multi-line: if first line is /code or /chat, switch mode + use rest
            const lines = text.split("\n");
            const firstLine = lines[0]?.trim() ?? "";
            const restLines = lines.slice(1).join("\n").trim();

            if (firstLine === "/code" || firstLine === "/coding") {
              setInputMode("code");
              if (restLines) { runTask(restLines); return; }
              push("info", "kevix/code — PEAN pipeline active"); return;
            }
            if (firstLine === "/chat" || firstLine === "/chating") {
              setInputMode("chat");
              if (restLines) { runChat(restLines); return; }
              push("info", "kevix/chat — quick LLM mode"); return;
            }

            const cmd = text.trim();
            // Slash commands first — always recognized regardless of mode
            if (cmd === "/code" || cmd === "/coding") { setInputMode("code"); const tf = scanForTestFiles(); if (tf.length > 0) push("info", `📋 ${tf.length} test file(s) found: ${tf.slice(0, 3).join(", ")}`); push("info", "kevix/code — PEAN pipeline active"); return; }
            if (cmd === "/chat" || cmd === "/chating") { setInputMode("chat"); push("info", "kevix/chat — quick LLM mode"); return; }
            if (cmd === "/memory") { setMode("memory"); push("info", "Mode: memory"); return; }
            if (cmd === "/probe")  { setMode("probe"); push("info", "Mode: probe"); return; }
            if (cmd === "/auto")   { setMode("auto"); push("info", "Mode: auto"); return; }
            if (cmd === "/help")   {
              push("info", "── Mode ──");
              push("info", "/memory   fast, cache-optimized (2 calls)");
              push("info", "/probe    full verification (4-5 calls)");
              push("info", "/auto     smart routing (default)");
              push("info", "── Input ──");
              push("info", "/chat     quick Q&A (current)");
              push("info", "/code     PEAN coding pipeline");
              push("info", "── History ──");
              push("info", "/history  recent tasks");
              push("info", "/again    re-run last");
              push("info", "── System ──");
              push("info", "/status   current state");
              push("info", "/graph    review graph");
              push("info", "/exit     quit");
              return;
            }
            if (cmd === "/status") { const s = getStats(GraphBuilder.load(".kevix/graph.json")); push("info", `mode:${mode} tasks:${s.taskCount}`); return; }
            if (cmd === "/graph")  { const s = getStats(GraphBuilder.load(".kevix/graph.json")); push("info", `graph: ${s.taskCount} tasks`); return; }
            if (cmd === "/history") { taskHistory.forEach((t,i) => push("info", `${i+1}. ${t}`)); return; }
            if (cmd === "/again") { const last = taskHistory[taskHistory.length - 1]; if (last) { push("info", `Replay: ${last}`); runTask(last); } return; }
            if (cmd === "/exit" || cmd === "/quit") { exit(); return; }

            // User-owned mode selection: no implicit auto-routing.
            if (inputMode === "code") { runTask(cmd); return; }
            // Coding intent router: if input looks like coding, route to /code
            if (looksLikeCoding(cmd)) {
              setInputMode("code");
              push("info", "Auto-switched to /code mode — this looks like a coding task");
              runTask(cmd);
              return;
            }
            runChat(cmd);
          }}
          running={running}
          history={taskHistory}
        />
      )}
    </Box>
  );
}

function scanForTestFiles(): string[] {
  const result: string[] = [];
  try {
    const { readdirSync, existsSync } = require("node:fs") as typeof import("node:fs");
    for (const dir of ["tests", "test", "__tests__", "spec"]) {
      try {
        const files = readdirSync(dir);
        result.push(...files.filter(f => f.endsWith(".test.ts") || f.endsWith(".test.js") || f.endsWith("_test.py") || f.endsWith(".spec.ts")).map(f => `${dir}/${f}`));
      } catch {}
    }
  } catch {}
  return result.slice(0, 5);
}


function looksLikeCoding(text: string): boolean {
  const t = text.toLowerCase();
  const verbs = ["fix", "bug", "修改", "实现", "refactor", "implement", "add", "create", "change", "modify", "update", "remove", "delete"];
  const hasVerb = verbs.some(v => t.includes(v));
  const hasPath = /\b(?:src|lib|tests?|app|packages)\/|\w+\.\w{1,4}\b/.test(t);
  return hasVerb && (hasPath || text.length > 60);
}

function smartTruncate(text: string | undefined, max: number): string {
  if (!text) return "None";
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  return text.slice(0, cut > max / 2 ? cut : max) + " …";
}

function preview(args: string): string {
  try { const o = JSON.parse(args); return Object.entries(o).map(([k,v]) => `${k}=${compactValue(k, String(v))}`).join(" "); }
  catch { return ""; }
}

function compactValue(key: string, value: string): string {
  if (key.includes("path") || value.includes("/")) {
    const parts = value.split("/");
    if (parts.length > 3) return `…/${parts.slice(-3).join("/")}`;
  }
  return value.length > 44 ? `${value.slice(0, 41)}…` : value;
}
