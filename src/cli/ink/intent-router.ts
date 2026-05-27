// P56 Intent Router — generates scope-first proposals before full directive

export interface ScopeProposal {
  goal: string;
  editableScope: string[];
  readOnlyEvidence: string[];
  successCheck: string;
  plan: string;
}

const PROPOSAL_SYSTEM = `You are Kevix, a coding harness. Given a user's task and evidence files, produce a Scope Proposal.

Output ONLY valid JSON, no markdown, no backticks. Format:
{"goal":"one sentence describing what the user wants","editableScope":["file1.js","file2.ts"],"readOnlyEvidence":["test1.test.js"],"successCheck":"npm test","plan":"2-3 sentences on approach"}

Rules:
- goal: restate user intent in one sentence
- editableScope: files the Worker CAN modify (from evidence scan). Be specific with paths.
- readOnlyEvidence: files that inform the fix but MUST NOT change (tests, configs, fixtures)
- successCheck: the command that proves the fix works (default "npm test" when test files present)
- plan: brief approach — read evidence first, make minimal source change, run success check
- Only list files that actually exist in evidence. Do NOT invent file names.
- Default: source files → editableScope, test files → readOnlyEvidence`;

function parseProposal(raw: string): ScopeProposal {
  const extract = (text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  };
  let parsed = extract(raw);
  if (!parsed) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) parsed = extract(m[0]);
  }
  if (!parsed) throw new Error(`Failed to parse proposal: ${raw.slice(0, 200)}`);

  return {
    goal: String(parsed.goal || "").trim(),
    editableScope: Array.isArray(parsed.editableScope) ? parsed.editableScope.map(String) : [],
    readOnlyEvidence: Array.isArray(parsed.readOnlyEvidence) ? parsed.readOnlyEvidence.map(String) : [],
    successCheck: String(parsed.successCheck || "npm test").trim(),
    plan: String(parsed.plan || "").trim(),
  };
}

function buildEvidencePrompt(task: string, evidenceFiles: string[], evidenceContents: string[]): string {
  const parts = [`User task: "${task}"`];
  if (evidenceFiles.length > 0) {
    parts.push(`Evidence files: ${evidenceFiles.slice(0, 5).join(", ")}`);
  }
  if (evidenceContents.length > 0) {
    const first = evidenceContents[0]!;
    parts.push(`Evidence sample:\n${first.slice(0, 2000)}`);
  }
  parts.push("Generate a Scope Proposal.");
  return parts.join("\n\n");
}

/** Build scope proposal from evidence — tries LLM, falls back to pattern inference */
export async function generateScopeProposal(
  apiKey: string,
  task: string,
  evidenceFiles: string[],
  evidenceContents: string[],
): Promise<ScopeProposal> {
  // Fast path: infer from evidence patterns
  const inferred = inferScope(task, evidenceFiles);
  if (inferred.editableScope.length > 0) {
    return inferred;
  }

  // LLM fallback for complex cases
  try {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: PROPOSAL_SYSTEM },
          { role: "user", content: buildEvidencePrompt(task, evidenceFiles, evidenceContents) },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });
    const data = await resp.json() as any;
    const raw = data.choices?.[0]?.message?.content ?? "";
    return parseProposal(raw);
  } catch {
    return inferred;
  }
}

/** Pattern-based scope inference — zero token, instant */
function inferScope(task: string, evidenceFiles: string[]): ScopeProposal {
  const testFiles = evidenceFiles.filter((f) =>
    /test|spec|__tests__/.test(f) || f.includes(".test.") || f.includes(".spec.") || f.includes("_test.")
  );
  const sourceFiles = evidenceFiles.filter((f) => !testFiles.includes(f));

  const goal = task.length > 100 ? task.slice(0, 97) + "..." : task;
  const editableScope = sourceFiles.length > 0 ? sourceFiles.slice(0, 3) : ["(inspect source first)"];
  const readOnlyEvidence = testFiles.length > 0 ? testFiles.slice(0, 3) : [];
  const successCheck = testFiles.length > 0 ? "npm test" : "npm test  # or relevant test command";

  return {
    goal,
    editableScope,
    readOnlyEvidence,
    successCheck,
    plan: sourceFiles.length > 0
      ? `Read ${readOnlyEvidence.slice(0, 2).join(", ") || "the evidence"}, then make the smallest correct change to ${editableScope.join(", ")}.`
      : "Inspect the codebase to identify the relevant files, then make the smallest correct change.",
  };
}

export function classifyIntent(input: string): "coding" | "chat" | "command" | "data" {
  const t = input.toLowerCase().trim();
  if (t.startsWith("/")) return "command";
  const dataPatterns = [/^(show|get|display)\s/, /^(history|stats|graph|tokens|cost|tasks?)$/, /last\s(task|run)/, /how\s(many|much)\s(token|call|task)/];
  if (dataPatterns.some((p) => p.test(t))) return "data";
  const codeKeywords = ["fix", "implement", "add", "create", "refactor", "rewrite", "change", "modify", "remove", "delete", "update", "patch", "bug"];
  const hasCodeVerb = codeKeywords.some((kw) => t.includes(kw));
  const hasFilePath = /\b(?:src|lib|app|tests?|packages)\//.test(t) || /\w+\.\w{1,4}\b/.test(t);
  if (hasCodeVerb && (hasFilePath || input.length > 60)) return "coding";
  return "chat";
}

/** Build Controller hints from a confirmed scope proposal */
export function buildScopeHints(proposal: ScopeProposal): string {
  const parts = ["Confirmed task scope:"];
  parts.push(`Goal: ${proposal.goal}`);
  parts.push(`Editable Scope: ${proposal.editableScope.join(", ")}`);
  parts.push(`Read-only Evidence: ${proposal.readOnlyEvidence.join(", ")}`);
  parts.push(`Success Check: ${proposal.successCheck}`);
  parts.push(`Plan: ${proposal.plan}`);
  parts.push("User approved this boundary. Worker MUST stay within Editable Scope. Read-only Evidence files must not be modified.");
  return parts.join("\n");
}
