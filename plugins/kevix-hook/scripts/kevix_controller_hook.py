#!/usr/bin/env python3
"""
Kevix Controller Hook for Claude Code — Scope-first, not directive-first.

Event: UserPromptSubmit

For coding tasks, prompts CC to propose a Scope before writing any code.
Reduces cognitive burden by showing 3 fields instead of a 6-section directive.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path


KEVIX_DIR = Path(os.environ.get("KEVIX_DIR", Path.cwd() / ".kevix"))
TASK_FILE = KEVIX_DIR / "task.md"
SCOPE_FILE = KEVIX_DIR / "scope.md"
DIRECTIVE_FILE = KEVIX_DIR / "directive.md"
STATE_FILE = KEVIX_DIR / "state.json"

CODING_KEYWORDS = [
    "implement", "fix", "add", "change", "modify", "update", "create",
    "remove", "delete", "refactor", "rewrite", "build", "develop",
    "bug", "feature", "patch", "function", "class", "module",
    "代码", "实现", "修复", "添加", "修改", "重构", "写", "改",
    "创建", "完成", "扩展", "增加", "接入", "配置", "验证", "运行",
]

NON_CODING_PHRASES = [
    "不需要改代码", "不要改代码", "不改代码", "无需改代码",
    "不要修改代码", "不需要修改代码", "只总结", "只分析", "不用写代码",
]


def read_json_from_stdin() -> dict:
    raw = sys.stdin.read()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"prompt": raw}


def is_coding_task(prompt: str) -> bool:
    prompt_lower = prompt.lower()
    if any(phrase in prompt_lower for phrase in NON_CODING_PHRASES):
        return False
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
        "scope_file": str(SCOPE_FILE),
        "directive_file": str(DIRECTIVE_FILE),
        "started_at": datetime.now().isoformat(),
    })

    additional_context = f"""
[KEVIX HARNESS — SCOPE FIRST]

This is a coding task. Do NOT start editing immediately.

Step 1 — Write `.kevix/scope.md` with exactly 3 fields:

```
## Editable Scope
Files you CAN modify (from evidence scan).

## Read-only Evidence
Files to read for context but MUST NOT change.

## Success Check
The command that proves the fix works (e.g. npm test).
```

Rules:
- Editable scope is a positive boundary — "only modify X", not "don't touch Y"
- Read-only evidence includes test files, configs, package.json
- If unsure about scope, scan the repo first (glob/grep), then propose

Step 2 — After scope is confirmed, write the FULL directive to
`.kevix/directive.md` with all 6 PEAN sections. This file is for the Worker.

But to the USER, output ONLY a 6-point summary card, one line per section:

① Intent — one sentence
② Key edge cases — one line
③ How to verify — one command
④ Constraints — one line
⑤ Red flags — files NOT to touch
⑥ Worker plan — 2-3 step summary

Never dump the full directive text into the chat. The user sees the card.
The Worker reads the file. Keep scope under 10 lines. Smallest correct change.
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
