#!/usr/bin/env python3
"""
Kevix Review Hook for Claude Code — scope-aware review.

Event: Stop

Blocks CC from stopping until a review log verifies the diff against
the scope contract and directive. Shorter, focused on scope compliance.
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
SCOPE_FILE = KEVIX_DIR / "scope.md"
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
        result = subprocess.run(["git", *args], capture_output=True, text=True, timeout=10)
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
    return ("verdict: pass" in normalized or "## verdict: pass" in normalized) and diff_hash in text


def output_json(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


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
                "Manual review required."
            ),
        })
        return

    scope_text = ""
    if SCOPE_FILE.exists():
        scope_text = SCOPE_FILE.read_text(encoding="utf-8", errors="replace")

    directive_text = ""
    if DIRECTIVE_FILE.exists():
        directive_text = DIRECTIVE_FILE.read_text(encoding="utf-8", errors="replace")

    if not scope_text and not directive_text:
        scope_text = "No scope or directive exists. Define scope first."

    prompt = f"""
[KEVIX REVIEW — CYCLE {cycles}/{max_cycles}]

Review the diff against the scope and directive. Write `.kevix/review_log.md`.

## Scope Contract

{scope_text[:1500]}

## Directive

{directive_text[:3000]}

## Changed Files

{chr(10).join(f"- {f}" for f in changed_files)}

## Diff Hash

{diff_hash}

## Diff Preview

```diff
{diff[:5000]}
```

## Review Checklist

1. Are changed files within the Editable Scope?
2. Are Read-only Evidence files untouched?
3. Does the Success Check pass?
4. Does the diff satisfy the directive's Product Intent?

Write `.kevix/review_log.md`:

```markdown
# Kevix Review

## Diff Hash
{diff_hash}

## Verdict: PASS / BLOCKED

## Scope Respected?
Yes / No — if No, which file crossed the boundary?

## Issues Found
Numbered list or "None."

## Action Taken
What was fixed, or "N/A" if PASS.
```
"""

    output_json({"decision": "block", "reason": prompt.strip()})


if __name__ == "__main__":
    main()
