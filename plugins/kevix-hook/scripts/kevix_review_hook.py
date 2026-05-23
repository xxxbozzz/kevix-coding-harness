#!/usr/bin/env python3
"""
Kevix Review Hook for Claude Code.

Event: Stop

When a Kevix workflow is active and the git diff has changed, this hook blocks
Claude Code from stopping until it writes a review log that passes the current
diff. It uses Claude Code's official JSON decision format for Stop hooks.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


KEVIX_DIR = Path(os.environ.get("KEVIX_DIR", Path.cwd() / ".kevix"))
TASK_FILE = KEVIX_DIR / "task.md"
DIRECTIVE_FILE = KEVIX_DIR / "directive.md"
STATE_FILE = KEVIX_DIR / "state.json"
REVIEW_LOG = KEVIX_DIR / "review_log.md"


def read_json_from_stdin() -> dict:
    raw = sys.stdin.read()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"active": False, "review_cycles": 0, "max_review_cycles": 3}


def save_state(state: dict) -> None:
    KEVIX_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def run_git(args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def get_git_diff() -> str:
    staged = run_git(["diff", "--cached", "--unified=10"])
    unstaged = run_git(["diff", "--unified=10"])
    parts = [part for part in [staged, unstaged] if part]
    return "\n".join(parts).strip()


def get_changed_files() -> list[str]:
    staged = run_git(["diff", "--cached", "--name-only"])
    unstaged = run_git(["diff", "--name-only"])
    files = set()
    for output in [staged, unstaged]:
        if output:
            files.update(line for line in output.splitlines() if line.strip())
    return sorted(files)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def review_passes_for_diff(diff_hash: str) -> bool:
    if not REVIEW_LOG.exists():
        return False
    text = REVIEW_LOG.read_text(encoding="utf-8", errors="replace")
    normalized = text.lower()
    has_pass = "verdict: pass" in normalized or "## verdict: pass" in normalized
    has_hash = diff_hash in text
    return has_pass and has_hash


def output_json(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def block(reason: str) -> None:
    output_json({"decision": "block", "reason": reason})


def main() -> None:
    _event = read_json_from_stdin()
    state = load_state()

    if not state.get("active"):
        return

    diff = get_git_diff()
    changed_files = get_changed_files()
    if not diff or not changed_files:
        state["active"] = False
        state["review_cycles"] = 0
        save_state(state)
        return

    diff_hash = sha256_text(diff)
    if review_passes_for_diff(diff_hash):
        state["active"] = False
        state["review_cycles"] = 0
        state["last_passed_diff_hash"] = diff_hash
        save_state(state)
        return

    cycles = int(state.get("review_cycles", 0)) + 1
    max_cycles = int(state.get("max_review_cycles", 3))
    state["review_cycles"] = cycles
    state["last_review_at"] = datetime.now().isoformat()
    state["current_diff_hash"] = diff_hash
    save_state(state)

    if cycles > max_cycles:
        output_json({
            "continue": False,
            "stopReason": (
                f"Kevix review reached max cycles ({cycles - 1}/{max_cycles}). "
                "Manual review is required before continuing."
            ),
        })
        return

    directive = ""
    if DIRECTIVE_FILE.exists():
        directive = DIRECTIVE_FILE.read_text(encoding="utf-8", errors="replace")

    if not directive.strip():
        directive = (
            "No `.kevix/directive.md` exists yet. Write it first using the "
            "Kevix directive template, then review the implementation."
        )

    task = TASK_FILE.read_text(encoding="utf-8", errors="replace") if TASK_FILE.exists() else ""

    prompt = f"""
[KEVIX REVIEW REQUIRED — CYCLE {cycles}/{max_cycles}]

Claude Code is not allowed to stop yet. Review the current diff against the
Kevix directive, fix any issues, and write `.kevix/review_log.md`.

## Original Task

{task[:2000]}

## Kevix Directive

{directive[:4000]}

## Changed Files

{chr(10).join(f"- {file}" for file in changed_files)}

## Current Diff Hash

{diff_hash}

## Current Diff Preview

```diff
{diff[:7000]}
```

## Required Review Log

Write `.kevix/review_log.md` with this exact structure:

```markdown
# Kevix Review

## Diff Hash
{diff_hash}

## Verdict: PASS / BLOCKED

## Issues Found
Numbered list. If PASS, write "None."

## Evidence
For each issue: file path, what is wrong, and what it should be.

## Action Taken
What you fixed, or "N/A" if PASS.
```

Review checklist:
1. Does the diff satisfy the Product Intent?
2. Does it preserve hidden semantics and edge cases?
3. Does it satisfy the Acceptance Tests?
4. Does it avoid Red Flags and unrelated broad edits?
5. Does it preserve public APIs, data contracts, imports, and file boundaries?
6. Does it reuse existing paths instead of creating duplicate logic?

If the verdict is BLOCKED, fix the issues now. If the verdict is PASS, include
the exact diff hash shown above so Kevix can allow the next stop.
"""

    block(prompt.strip())


if __name__ == "__main__":
    main()
