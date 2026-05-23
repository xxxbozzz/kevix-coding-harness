#!/usr/bin/env python3
"""Smoke tests for Kevix Controller Hook task detection."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / "scripts" / "kevix_controller_hook.py"


def run_hook(prompt: str) -> tuple[str, Path]:
    tmp = Path(tempfile.mkdtemp(prefix="kevix-hook-test-"))
    env = os.environ.copy()
    env["KEVIX_DIR"] = str(tmp / ".kevix")
    result = subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps({"prompt": prompt}, ensure_ascii=False),
        text=True,
        capture_output=True,
        env=env,
        check=True,
    )
    return result.stdout, tmp


def assert_active(prompt: str) -> None:
    stdout, tmp = run_hook(prompt)
    assert "KEVIX CODING HARNESS ACTIVE" in stdout
    assert "## Task Decomposition" in stdout
    assert (tmp / ".kevix" / "state.json").exists()
    assert (tmp / ".kevix" / "task.md").exists()


def assert_inactive(prompt: str) -> None:
    stdout, tmp = run_hook(prompt)
    assert stdout == ""
    assert not (tmp / ".kevix" / "state.json").exists()


def main() -> None:
    assert_active(
        "请完成以下分点任务：\n"
        "1. P7.1 Review types 扩展\n"
        "2. P7.2 Review phase runner\n"
        "3. 写测试并运行验证"
    )
    assert_active(
        "下面是 P7 分点任务：\n"
        "1. 扩展 src/types.ts\n"
        "2. 修改 scripts/l2-runner.ts\n"
        "3. 运行 npm test"
    )
    assert_inactive("帮我总结一下今天的会议内容，不需要改代码。")
    print("kevix controller hook tests passed")


if __name__ == "__main__":
    main()
