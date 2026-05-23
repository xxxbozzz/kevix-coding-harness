#!/usr/bin/env python3
"""
Kevix Controller Hook for Claude Code.

Event: UserPromptSubmit

For coding tasks, this hook adds a directive-first workflow into Claude Code's
context. It does not call an external model and does not read private files
outside the current working directory.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path


KEVIX_DIR = Path(os.environ.get("KEVIX_DIR", Path.cwd() / ".kevix"))
TASK_FILE = KEVIX_DIR / "task.md"
DIRECTIVE_FILE = KEVIX_DIR / "directive.md"
STATE_FILE = KEVIX_DIR / "state.json"

CODING_KEYWORDS = [
    "implement", "fix", "add", "change", "modify", "update", "create",
    "remove", "delete", "refactor", "rewrite", "build", "develop",
    "bug", "feature", "patch", "function", "class", "module",
    "api", "endpoint", "route", "component", "service", "database",
    "migration", "schema", "sdk", "auth", "permission", "test",
    "代码", "实现", "修复", "添加", "修改", "重构", "写", "改",
    "接口", "后端", "前端", "数据库", "权限", "测试", "迁移",
]


def read_json_from_stdin() -> dict:
    raw = sys.stdin.read()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"prompt": raw}


def is_coding_task(prompt: str) -> bool:
    prompt_lower = prompt.lower()
    return any(keyword in prompt_lower for keyword in CODING_KEYWORDS)


def save_state(state: dict) -> None:
    KEVIX_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    data = read_json_from_stdin()
    prompt = data.get("prompt", "")

    if not isinstance(prompt, str) or not is_coding_task(prompt):
        return

    KEVIX_DIR.mkdir(parents=True, exist_ok=True)
    TASK_FILE.write_text(prompt, encoding="utf-8")

    save_state({
        "active": True,
        "review_cycles": 0,
        "max_review_cycles": int(os.environ.get("KEVIX_MAX_REVIEW_CYCLES", "3")),
        "task_file": str(TASK_FILE),
        "directive_file": str(DIRECTIVE_FILE),
        "started_at": datetime.now().isoformat(),
    })

    additional_context = f"""
[KEVIX CODING HARNESS ACTIVE]

This appears to be a coding or implementation task. Before editing code, follow
the Kevix directive-first workflow.

First write `.kevix/directive.md` with exactly these sections:

## Product Intent
What behavior should exist after the implementation?

## Hidden Semantics
What edge cases, product assumptions, protocol boundaries, permissions, state
transitions, SDK behavior, or data-shape issues could be missed?

## Acceptance Tests
What concrete tests, commands, or manual checks must pass?

## Implementation Constraints
What interfaces, public APIs, filenames, dependencies, or data contracts must
not drift?

## Red Flags
Which files, functions, migrations, external contracts, or broad refactors
should not be touched unless explicitly required?

## Coding Worker Directive
Step-by-step instructions for the implementation.

After the directive exists, implement the change. When you try to stop, the
Kevix review hook will compare the diff against the directive and may require
another pass before the task is considered complete.
"""

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": additional_context.strip(),
            "sessionTitle": "Kevix coding task",
        }
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
