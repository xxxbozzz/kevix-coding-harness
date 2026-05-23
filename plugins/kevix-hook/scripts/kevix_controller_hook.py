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
    "import", "type", "runner", "hook", "compile", "validate",
    "代码", "实现", "修复", "添加", "修改", "重构", "写", "改",
    "创建", "完成", "扩展", "增加", "接入", "配置", "验证", "运行",
    "接口", "后端", "前端", "数据库", "权限", "测试", "迁移",
    "脚本", "类型", "导入", "构建", "编译", "依赖",
]

STRUCTURED_TASK_MARKERS = [
    "分点任务", "以下任务", "任务：", "步骤", "todo", "checklist",
    "p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9",
    "1.", "2.", "3.", "- ", "* ", "###",
]

CODE_CONTEXT_KEYWORDS = [
    "src/", "tests/", "scripts/", ".ts", ".tsx", ".js", ".py", ".json",
    "package.json", "npm", "vitest", "tsc", "git", "engine", "harness",
    "provider", "types", "import", "build", "test", "runner", "hook",
    "文件", "脚本", "测试", "类型", "接口", "构建", "编译", "代码",
]

NON_CODING_PHRASES = [
    "do not edit code", "no code changes", "no coding needed",
    "without changing code", "don't modify files",
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
    if any(keyword in prompt_lower for keyword in CODING_KEYWORDS):
        return True
    has_structure = any(marker in prompt_lower for marker in STRUCTURED_TASK_MARKERS)
    has_code_context = any(keyword in prompt_lower for keyword in CODE_CONTEXT_KEYWORDS)
    return has_structure and has_code_context


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

First decompose the request, then write `.kevix/directive.md` with exactly
these sections:

## Task Decomposition
If the user prompt contains multiple bullets, numbered items, milestones, or
P0/P1/P2-style tasks, list them here as ordered subtasks. Preserve the user's
IDs and dependencies. Do not merge unrelated items. If one item is not a coding
task, mark it as "non-code / follow-up" instead of silently dropping it.

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
Reference the ordered subtasks from Task Decomposition and state likely files,
commands, or checks for each subtask.

Rules for long prompts:

1. Do not start editing before Task Decomposition is written.
2. If the request has multiple numbered points, map each point to one subtask.
3. If dependencies exist, state the execution order explicitly.
4. Do not collapse a multi-point request into a single vague implementation step.

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
