#!/usr/bin/env python3
"""
SWE-bench Instance Runner with Real-time Cache Logging + Repo Context.

Fetches actual source code from GitHub before generating patches,
so LLMs see real code with correct line numbers.

Modes:
  --mode direct   : Problem → Patch (no PEAN, 1 API call)
  --mode generic  : Basic plan → Worker (2 API calls)
  --mode pean     : Controller → Worker → Review (3 API calls)
  --mode memory   : Controller → Worker (2 API calls, no review)
  --mode probe    : Controller → Probe Plan → Worker → Probe Verify → Revised Patch (4-5 calls)
  --mode auto     : Controller → Worker → Self-Assess → (maybe) Probe (3-5 calls)

Output:
  results/{instance_id}/{mode}/
    cache_log.jsonl    ← Per-request cache metrics (THE KEY OUTPUT)
    patch.diff         ← The generated patch
    messages.jsonl     ← Full API conversation
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import requests
import urllib.request
import urllib.error
import re as _re

# ═══════════════════════════════════════════
#  Config
# ═══════════════════════════════════════════

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = os.environ.get("BENCH_MODEL", "deepseek-v4-pro")

PROJECT_ROOT = Path(__file__).resolve().parent

MAX_REPO_CONTEXT_CHARS = 12000  # ~3000 tokens, leaves room for prompts


def fetch_repo_context(instance: dict) -> str:
    """Fetch relevant source files from GitHub for this instance's base commit.
    Returns formatted code context for inclusion in LLM prompts."""
    repo = instance.get("repo", "")
    commit = instance.get("base_commit", "")
    problem = instance.get("problem_statement", "")

    if not repo or not commit:
        return ""

    # Extract likely file paths from problem statement
    file_hints = set()
    # Look for file paths: path/to/file.py, module/class.py, etc.
    for pattern in [r'([\w/-]+\.py)\b', r'in ([a-z_/]+\.py)', r'file[:\s]+([\w/.-]+)']:
        for m in _re.finditer(pattern, problem, _re.IGNORECASE):
            file_hints.add(m.group(1).strip())

    # Also try to fetch from GitHub API: get file tree at commit
    files_to_fetch = list(file_hints)[:10]  # Max 10 files

    if not files_to_fetch:
        # Fallback: try common locations based on repo
        parts = repo.split("/")
        if len(parts) == 2:
            files_to_fetch = [f"{parts[1]}/__init__.py"]

    fetched = []
    total_chars = 0

    for fpath in files_to_fetch:
        if total_chars > MAX_REPO_CONTEXT_CHARS:
            break

        url = f"https://raw.githubusercontent.com/{repo}/{commit}/{fpath}"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                content = resp.read().decode("utf-8", errors="replace")
                if len(content) > 50:  # Real file, not 404 page
                    fetched.append(f"## {fpath}\n```python\n{content[:3000]}\n```")
                    total_chars += len(fetched[-1])
        except Exception:
            continue

    if not fetched:
        return ""

    context = "## Repository Source Code (at commit " + commit[:8] + ")\n\n"
    context += "\n\n".join(fetched)
    return context[:MAX_REPO_CONTEXT_CHARS]


def build_contextualized_prompt(instance: dict, extra: str = "") -> str:
    """Build problem prompt including real source code context."""
    problem = instance["problem_statement"]
    context = fetch_repo_context(instance)

    if context:
        return f"## Repository Context\n\n{context}\n\n## Bug Report\n\n{problem}\n\n{extra}"
    return f"## Bug Report\n\n{problem}\n\n{extra}"


# ═══════════════════════════════════════════
#  Shared Prompts
# ═══════════════════════════════════════════

PEAN_CONTROLLER_PROMPT = """You are the PEAN product controller for a coding worker.

Given a software engineering task, produce a concise implementation directive.
Focus on hidden product semantics, acceptance conditions, and failure boundaries.
Do not write code. Do not include prose outside the requested format.

Output format:

## Product Intent
(What product behavior should exist after implementation)

## Hidden Semantics
(Edge cases, implicit requirements, non-obvious constraints)

## Acceptance Tests
(What specific tests/scenarios must pass)

## Implementation Constraints
(What NOT to change, interfaces to preserve, dependencies to avoid)

## Red Flags
(Files/functions that must NOT be modified)

## Coding Worker Directive
(Step-by-step implementation instructions for the coding worker)
"""

PEAN_REVIEW_PROMPT = """You are the PEAN Product Review Harness. Audit this patch against the directive.

## Review Checklist

1. **Interface Drift**: Does the worker's implementation match the EXACT public API names and signatures required by the task?
2. **Hidden Semantics**: Does the patch honor edge-case semantics identified by the controller?
3. **Acceptance Boundary**: Will the patch pass the fail-to-pass tests AND preserve pass-to-pass tests?
4. **Regression Surface**: Does the patch modify any file or function outside the intended scope?
5. **Reuse Check**: Does the codebase already have a function or helper that does something similar?

## Output Format

## Verdict: PASS / BLOCKED
## Issues Found
(Numbered list. If PASS, write "None.")
## Revised Directive
(If changes needed, provide corrected directive.)
"""

# ─── Probe-specific prompts ───

PROBE_PLAN_PROMPT = """You are a wire-level verification specialist. Given a software bug and its fix directive, enumerate ALL potential wire-level risks that static code analysis could miss.

Wire-level risks include:
- **Encoding**: boolean True/False -> form-encode -> "True" vs "true". Integer -> string coercion. Unicode/bytes boundary.
- **Type Coercion**: None -> "", 0 -> False, empty list -> falsy, float -> int truncation.
- **Serialization**: JSON key ordering, dict vs list encoding, nested structure flattening.
- **API Boundary**: What the SDK sends vs what the backend expects. Header case-sensitivity.
- **State Machine**: Illegal transitions, concurrent mutations, idempotency key handling.

For each risk, specify:
1. What specific value/type is at risk
2. What the correct wire format should be
3. How to verify it (what probe would catch it)

Output format:

## Wire-Level Risk Register
1. **Risk**: (description)
   - **At-risk value**: (specific)
   - **Correct wire format**: (specific)
   - **Verification method**: (how to probe)

2. ...
"""

PROBE_VERIFY_PROMPT = """You are a wire-level verification specialist. Trace through the patch line by line and verify each wire-level risk from the risk register.

For each risk in the register:
1. Read the relevant code in the patch
2. Determine: Would the wire format be correct?
3. Flag any remaining issues

Output format:

## Probe Verification

### Risk 1: [name]
- **Trace**: (walk through the code path)
- **Wire format check**: (what the actual output would be)
- **Verdict**: PASS / FIX NEEDED

### Risk 2: ...

## Overall Verdict: PASS / FIX NEEDED

## Revised Patch (if FIX NEEDED)
```diff
(only output if changes are needed)
```
"""

AUTO_SELECT_PROMPT = """You are a task complexity assessor. Given a software bug and a generated patch, determine whether this problem has wire-level risks that a pure memory approach might have missed.

Wire-level risks include: encoding boundaries (True/"true"), type coercion (None->""), serialization format, API boundary mismatches.

Analyze the problem statement and patch, then output:

## Wire-Level Risk Assessment

### Does this problem touch any of the following?
- [ ] Boolean/None sent across API/form boundary
- [ ] Type coercion (int/str/bytes boundary)
- [ ] Serialization format (JSON, form-encode, header encoding)
- [ ] State machine with concurrent access risk
- [ ] API boundary where SDK encoding differs from backend expectation

### Risk Level: NONE / LOW / HIGH

### Decision
```json
{"need_probe": true/false, "reason": "..."}
```

Only set need_probe=true if there is a concrete wire-level risk that could cause silent failure.
"""


# ═══════════════════════════════════════════
#  API Client with Cache Logging
# ═══════════════════════════════════════════

class CacheLoggingClient:
    """Calls DeepSeek API and logs EVERY request's cache metrics."""

    def __init__(self, log_path: Path):
        self.log_path = log_path
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._id = 0
        self._all_messages = []

    def call(self, system: str, user: str, temperature: float = 0.1, max_tokens: int = 4096) -> str:
        """Make one API call. Log cache metrics. Return response text."""
        self._id += 1
        t0 = time.time()

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

        resp = requests.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": DEEPSEEK_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            timeout=120,
        )
        elapsed_ms = (time.time() - t0) * 1000
        data = resp.json()

        if "error" in data:
            print(f"API ERROR: {data['error']}")
            return ""

        content = data["choices"][0]["message"]["content"]

        # ─── EXTRACT CACHE METRICS ───
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        cache_hit = usage.get("prompt_cache_hit_tokens", 0)
        cache_miss = usage.get("prompt_cache_miss_tokens", 0)

        # Save full conversation
        self._all_messages.append({"role": "user", "content": user})
        self._all_messages.append({"role": "assistant", "content": content})

        # ─── LOG ───
        record = {
            "request_id": self._id,
            "timestamp": time.time(),
            "prompt_tokens": prompt_tokens,
            "cache_hit_tokens": cache_hit,
            "cache_miss_tokens": cache_miss,
            "cache_hit_ratio": round(cache_hit / prompt_tokens * 100, 2) if prompt_tokens > 0 else 0,
            "completion_tokens": completion_tokens,
            "duration_ms": round(elapsed_ms, 1),
        }
        with open(self.log_path, "a") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        return content

    def save_messages(self, path: Path) -> None:
        with open(path, "w") as f:
            for msg in self._all_messages:
                f.write(json.dumps(msg, ensure_ascii=False) + "\n")

    def print_cache_summary(self) -> dict:
        if not self.log_path.exists():
            return {"error": "no data"}
        records = [json.loads(l) for l in open(self.log_path) if l.strip()]
        if not records:
            return {"error": "no data"}

        hits = sum(r["cache_hit_tokens"] for r in records)
        misses = sum(r["cache_miss_tokens"] for r in records)
        prompts = sum(r["prompt_tokens"] for r in records)
        completions = sum(r["completion_tokens"] for r in records)

        total = hits + misses
        ratio = round(hits / total * 100, 4) if total > 0 else 0

        summary = {
            "requests": len(records),
            "total_prompt_tokens": prompts,
            "cache_hit_tokens": hits,
            "cache_miss_tokens": misses,
            "cache_hit_ratio_pct": ratio,
            "total_completion_tokens": completions,
        }

        print(f"\n{'='*60}")
        print(f"CACHE SUMMARY")
        print(f"{'='*60}")
        print(f"  Requests:            {summary['requests']}")
        print(f"  Prompt tokens:       {prompts:,}")
        print(f"  Cache HIT tokens:    {hits:,}")
        print(f"  Cache MISS tokens:   {misses:,}")
        print(f"  Cache HIT RATIO:     {ratio}%")
        print(f"  Completion tokens:   {completions:,}")
        print(f"{'='*60}\n")
        return summary


# ═══════════════════════════════════════════
#  Patch Extraction
# ═══════════════════════════════════════════

def extract_patch(raw: str) -> str:
    """Extract unified diff from LLM output."""
    if "```diff" in raw:
        parts = raw.split("```diff", 1)[1].split("```", 1)
        return parts[0].strip()
    if "```" in raw:
        parts = raw.split("```", 1)[1].split("```", 1)
        return parts[0].strip()
    return raw.strip()


def extract_json(raw: str) -> Optional[dict]:
    """Extract JSON object from LLM output."""
    import re
    match = re.search(r'\{[^{}]*"need_probe"[^{}]*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


# ═══════════════════════════════════════════
#  Workflows
# ═══════════════════════════════════════════

GENERIC_PLAN_PROMPT = """You are a senior software engineer. Given a bug report, write a brief implementation plan.
Keep it short — identify the root cause, the files to change, and the fix approach.
Do NOT use the PEAN directive format. Just a plain engineering plan."""

GENERIC_WORKER_PROMPT = """You are an expert Python developer. Fix the bug based on the plan.
Output ONLY a unified diff patch. Start with ```diff and end with ```."""


def run_direct(instance: dict, output_dir: Path) -> dict:
    """Direct coding (no PEAN): Problem → Patch. 1 API call."""
    client = CacheLoggingClient(output_dir / "cache_log.jsonl")
    ctx_prompt = build_contextualized_prompt(instance)
    print(f"[DIRECT] Repo context: {len(ctx_prompt)} chars")

    print("[DIRECT] Generating patch...")
    code_prompt = f"""## Task

{ctx_prompt}

## Instructions

Fix the bug. Output ONLY a unified diff patch using the EXACT file paths and
line numbers from the source code above. Start with ```diff and end with ```.
"""
    patch_raw = client.call(
        system="You are an expert Python developer. Fix the bug and output a diff patch.",
        user=code_prompt,
        max_tokens=4096,
    )

    patch = extract_patch(patch_raw)
    (output_dir / "patch.diff").write_text(patch)
    client.save_messages(output_dir / "messages.jsonl")

    summary = client.print_cache_summary()
    summary["instance_id"] = instance["instance_id"]
    summary["mode"] = "direct"
    summary["patch_path"] = str(output_dir / "patch.diff")
    return summary


def run_generic(instance: dict, output_dir: Path) -> dict:
    """Generic Harness: basic plan → worker. 2 API calls. No PEAN structure."""
    client = CacheLoggingClient(output_dir / "cache_log.jsonl")
    ctx_prompt = build_contextualized_prompt(instance)
    print(f"[GENERIC] Repo context: {len(ctx_prompt)} chars")
    problem = ctx_prompt

    # Step 1: Simple engineering plan (NOT PEAN directive)
    print("[GENERIC] Step 1: Basic plan...")
    plan = client.call(
        system=GENERIC_PLAN_PROMPT,
        user=f"## Bug Report\n\n{ctx_prompt}",
    )

    # Step 2: Worker with plan
    print("[GENERIC] Step 2: Coding worker...")
    code_prompt = f"""## Implementation Plan

{plan}

## Task

{problem}

## Instructions

Implement the fix. Output ONLY a unified diff patch.
Start your patch with ```diff and end with ```.
"""
    patch_raw = client.call(
        system=GENERIC_WORKER_PROMPT,
        user=code_prompt,
        max_tokens=4096,
    )

    patch = extract_patch(patch_raw)
    (output_dir / "patch.diff").write_text(patch)
    (output_dir / "plan.md").write_text(plan)
    client.save_messages(output_dir / "messages.jsonl")

    summary = client.print_cache_summary()
    summary["instance_id"] = instance["instance_id"]
    summary["mode"] = "generic"
    summary["patch_path"] = str(output_dir / "patch.diff")
    return summary


def run_pean(instance: dict, output_dir: Path) -> dict:
    """PEAN workflow: Controller → Worker → Review. 3 API calls."""
    client = CacheLoggingClient(output_dir / "cache_log.jsonl")
    problem = build_contextualized_prompt(instance)

    print("[PEAN] Step 1: Product Controller...")
    directive = client.call(
        system=PEAN_CONTROLLER_PROMPT,
        user=f"## Task\n\n{problem}\n\n## Selected Files\n\n{instance.get('hints_text', '')}",
    )

    print("[PEAN] Step 2: Coding Worker...")
    code_prompt = f"""## Product Controller Directive

{directive}

## Task

{problem}

## Instructions

Implement the fix according to the directive above. Output ONLY a unified diff patch.
Start your patch with ```diff and end with ```.
"""
    patch_raw = client.call(
        system="You are an expert Python developer. Output only a valid unified diff patch.",
        user=code_prompt,
        max_tokens=4096,
    )

    patch = extract_patch(patch_raw)
    (output_dir / "patch.diff").write_text(patch)

    print("[PEAN] Step 3: Product Review...")
    review_text = client.call(
        system=PEAN_REVIEW_PROMPT,
        user=f"## Directive\n\n{directive}\n\n## Patch\n\n```diff\n{patch}\n```",
    )

    (output_dir / "directive.md").write_text(directive)
    (output_dir / "review.md").write_text(review_text)
    client.save_messages(output_dir / "messages.jsonl")

    summary = client.print_cache_summary()
    summary["instance_id"] = instance["instance_id"]
    summary["mode"] = "pean"
    summary["patch_path"] = str(output_dir / "patch.diff")
    return summary


def run_memory(instance: dict, output_dir: Path) -> dict:
    """Memory mode: Controller → Worker. 2 API calls. No probe, no review."""
    client = CacheLoggingClient(output_dir / "cache_log.jsonl")
    ctx_prompt = build_contextualized_prompt(instance)
    print(f"[MEMORY] Repo context: {len(ctx_prompt)} chars")
    problem = ctx_prompt

    print("[MEMORY] Step 1: Product Controller...")
    directive = client.call(
        system=PEAN_CONTROLLER_PROMPT,
        user=f"## Task\n\n{ctx_prompt}\n\n## Selected Files\n\n{instance.get('hints_text', '')}",
    )

    print("[MEMORY] Step 2: Coding Worker...")
    code_prompt = f"""## Product Controller Directive

{directive}

## Task

{problem}

## Instructions

Implement the fix according to the directive above. Output ONLY a unified diff patch.
Start your patch with ```diff and end with ```.
"""
    patch_raw = client.call(
        system="You are an expert Python developer. Output only a valid unified diff patch.",
        user=code_prompt,
        max_tokens=4096,
    )

    patch = extract_patch(patch_raw)
    (output_dir / "patch.diff").write_text(patch)
    (output_dir / "directive.md").write_text(directive)
    client.save_messages(output_dir / "messages.jsonl")

    summary = client.print_cache_summary()
    summary["instance_id"] = instance["instance_id"]
    summary["mode"] = "memory"
    summary["patch_path"] = str(output_dir / "patch.diff")
    return summary


def run_probe(instance: dict, output_dir: Path) -> dict:
    """Probe mode: Controller → Probe Plan → Worker → Probe Verify → Revised Patch. 4-5 API calls."""
    client = CacheLoggingClient(output_dir / "cache_log.jsonl")
    problem = build_contextualized_prompt(instance)

    # ─── Step 1: Product Controller ───
    print("[PROBE] Step 1: Product Controller...")
    directive = client.call(
        system=PEAN_CONTROLLER_PROMPT,
        user=f"## Task\n\n{problem}\n\n## Selected Files\n\n{instance.get('hints_text', '')}",
    )

    # ─── Step 2: Probe Plan — enumerate wire-level risks ───
    print("[PROBE] Step 2: Wire-Level Probe Plan...")
    probe_plan = client.call(
        system=PROBE_PLAN_PROMPT,
        user=f"## Task\n\n{problem}\n\n## Directive\n\n{directive}",
    )

    # ─── Step 3: Coding Worker (with probe plan awareness) ───
    print("[PROBE] Step 3: Coding Worker (probe-aware)...")
    code_prompt = f"""## Product Controller Directive

{directive}

## Wire-Level Risk Register (MUST address ALL risks)

{probe_plan}

## Task

{problem}

## Instructions

Implement the fix. Your patch MUST pass the wire-level verification for every risk in the register above.
Output ONLY a unified diff patch. Start your patch with ```diff and end with ```.
"""
    patch_raw = client.call(
        system="You are an expert Python developer. Output only a valid unified diff patch.",
        user=code_prompt,
        max_tokens=4096,
    )

    patch = extract_patch(patch_raw)
    (output_dir / "patch_v1.diff").write_text(patch)

    # ─── Step 4: Probe Verify — trace through code line by line ───
    print("[PROBE] Step 4: Wire-Level Verification...")
    verify_text = client.call(
        system=PROBE_VERIFY_PROMPT,
        user=f"## Wire-Level Risk Register\n\n{probe_plan}\n\n## Directive\n\n{directive}\n\n## Patch\n\n```diff\n{patch}\n```",
    )

    (output_dir / "probe_plan.md").write_text(probe_plan)
    (output_dir / "probe_verify.md").write_text(verify_text)

    # ─── Step 5: Revised Patch (if verification found issues) ───
    revised_patch = extract_patch(verify_text)
    if revised_patch and revised_patch != patch:
        print("[PROBE] Step 5: Verification found issues → revised patch saved.")
        (output_dir / "patch.diff").write_text(revised_patch)
        final_patch = revised_patch
        revision_count = 1
    else:
        print("[PROBE] Verification PASS — no revision needed.")
        (output_dir / "patch.diff").write_text(patch)
        final_patch = patch
        revision_count = 0

    (output_dir / "directive.md").write_text(directive)
    client.save_messages(output_dir / "messages.jsonl")

    summary = client.print_cache_summary()
    summary["instance_id"] = instance["instance_id"]
    summary["mode"] = "probe"
    summary["revision_count"] = revision_count
    summary["patch_path"] = str(output_dir / "patch.diff")
    return summary


def run_auto(instance: dict, output_dir: Path) -> dict:
    """Auto-Select mode: Controller → Worker → Self-Assess → (maybe) Probe. 3-5 API calls."""
    client = CacheLoggingClient(output_dir / "cache_log.jsonl")
    problem = build_contextualized_prompt(instance)

    # ─── Step 1: Product Controller ───
    print("[AUTO] Step 1: Product Controller...")
    directive = client.call(
        system=PEAN_CONTROLLER_PROMPT,
        user=f"## Task\n\n{problem}\n\n## Selected Files\n\n{instance.get('hints_text', '')}",
    )

    # ─── Step 2: Coding Worker (memory-style, one pass) ───
    print("[AUTO] Step 2: Coding Worker (memory-style)...")
    code_prompt = f"""## Product Controller Directive

{directive}

## Task

{problem}

## Instructions

Implement the fix according to the directive above. Output ONLY a unified diff patch.
Start your patch with ```diff and end with ```.
"""
    patch_raw = client.call(
        system="You are an expert Python developer. Output only a valid unified diff patch.",
        user=code_prompt,
        max_tokens=4096,
    )

    patch = extract_patch(patch_raw)
    (output_dir / "patch_v1.diff").write_text(patch)

    # ─── Step 3: Self-Assess — does this need probe? ───
    print("[AUTO] Step 3: Self-Assessing wire-level risk...")
    assess_text = client.call(
        system=AUTO_SELECT_PROMPT,
        user=f"## Problem\n\n{problem}\n\n## Patch\n\n```diff\n{patch}\n```",
    )

    decision = extract_json(assess_text)
    need_probe = decision.get("need_probe", False) if decision else False
    probe_reason = decision.get("reason", "parse error") if decision else "parse error"

    (output_dir / "auto_assess.md").write_text(assess_text)

    if need_probe:
        print(f"[AUTO] Risk detected: {probe_reason}")
        print("[AUTO] Step 4: Upgrading to Probe verification...")

        probe_plan = client.call(
            system=PROBE_PLAN_PROMPT,
            user=f"## Task\n\n{problem}\n\n## Directive\n\n{directive}\n\n## Auto-Assess Decision\n\n{assess_text}",
        )

        verify_text = client.call(
            system=PROBE_VERIFY_PROMPT,
            user=f"## Wire-Level Risk Register\n\n{probe_plan}\n\n## Directive\n\n{directive}\n\n## Patch\n\n```diff\n{patch}\n```",
        )

        revised_patch = extract_patch(verify_text)
        if revised_patch and revised_patch != patch:
            print("[AUTO] Probe found issues → revised patch saved.")
            (output_dir / "patch.diff").write_text(revised_patch)
            final_patch = revised_patch
            revision_count = 1
        else:
            print("[AUTO] Probe verification PASS — original patch kept.")
            (output_dir / "patch.diff").write_text(patch)
            final_patch = patch
            revision_count = 0

        (output_dir / "probe_plan.md").write_text(probe_plan)
        (output_dir / "probe_verify.md").write_text(verify_text)
    else:
        print(f"[AUTO] No wire-level risk: {probe_reason}")
        print("[AUTO] Skipping probe — outputting memory patch directly.")
        (output_dir / "patch.diff").write_text(patch)
        final_patch = patch
        revision_count = 0

    (output_dir / "directive.md").write_text(directive)
    client.save_messages(output_dir / "messages.jsonl")

    summary = client.print_cache_summary()
    summary["instance_id"] = instance["instance_id"]
    summary["mode"] = "auto"
    summary["need_probe"] = need_probe
    summary["probe_reason"] = probe_reason
    summary["revision_count"] = revision_count
    summary["patch_path"] = str(output_dir / "patch.diff")
    return summary


# ═══════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="SWE-bench Runner with Cache Logging")
    parser.add_argument("--instances", required=True, help="Path to instances.json")
    parser.add_argument("--index", type=int, default=0, help="Instance index to run")
    parser.add_argument("--condition", choices=["direct", "pean", "both"], default="pean",
                        help="Legacy condition flag (use --mode for new modes)")
    parser.add_argument("--mode", choices=["direct", "generic", "pean", "memory", "probe", "auto", "both"],
                        help="Run mode: direct/generic/memory/probe/auto for tier experiment")
    parser.add_argument("--output-dir", default="results")
    args = parser.parse_args()

    instances = json.loads(Path(args.instances).read_text())
    if args.index >= len(instances):
        print(f"Index {args.index} out of range (max {len(instances)-1})")
        sys.exit(1)

    inst = instances[args.index]
    iid = inst["instance_id"].replace("/", "_").replace("__", "_")
    print(f"Instance: {iid}")
    print(f"Repo: {inst['repo']}")

    # Determine effective mode (--mode takes precedence over --condition)
    effective_mode = args.mode or args.condition
    print(f"Mode: {effective_mode}")
    print()

    base = Path(args.output_dir) / iid
    summary = {}

    mode_dispatch = {
        "direct": run_direct,
        "generic": run_generic,
        "pean": run_pean,
        "memory": run_memory,
        "probe": run_probe,
        "auto": run_auto,
    }

    if effective_mode == "both":
        for m in ("pean", "direct"):
            odir = base / m
            odir.mkdir(parents=True, exist_ok=True)
            summary[m] = mode_dispatch[m](inst, odir)
    elif effective_mode in mode_dispatch:
        odir = base / effective_mode
        odir.mkdir(parents=True, exist_ok=True)
        summary[effective_mode] = mode_dispatch[effective_mode](inst, odir)
    else:
        print(f"Unknown mode: {effective_mode}")
        sys.exit(1)

    (base / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"\nResults saved to {base}/")
    print(f"Cache logs: {base}/{{mode}}/cache_log.jsonl")


if __name__ == "__main__":
    main()
