#!/usr/bin/env python3
"""
SWE-bench Agent — clones repo, reads source, generates & validates patch locally.
Uses DeepSeek API with PEAN prompts + real source code context.
"""
import json, os, re, subprocess, sys, textwrap, time, urllib.request
from pathlib import Path

DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
MODEL = "deepseek-chat"
WORK_DIR = Path("/tmp/swebench_agent")

def call_deepseek(system: str, user: str, max_tok=24000) -> str:
    payload = {"model": MODEL, "messages": [{"role":"system","content":system},{"role":"user","content":user}],
               "temperature": 0.1, "max_tokens": max_tok}
    req = urllib.request.Request("https://api.deepseek.com/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode())["choices"][0]["message"]["content"]

def clone_repo(instance: dict) -> Path:
    repo = instance["repo"]
    commit = instance["base_commit"]
    repo_dir = WORK_DIR / instance["instance_id"].replace("/", "_")
    if repo_dir.exists():
        subprocess.run(["rm", "-rf", str(repo_dir)])
    repo_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "clone", "--depth", "1", f"https://github.com/{repo}.git", str(repo_dir)],
                   check=True, capture_output=True, text=True, timeout=180)
    subprocess.run(["git", "fetch", "--depth", "1", "origin", commit], cwd=repo_dir,
                   check=True, capture_output=True, text=True, timeout=30)
    subprocess.run(["git", "checkout", commit], cwd=repo_dir,
                   check=True, capture_output=True, text=True, timeout=30)
    return repo_dir

def find_bug_location(repo_dir: Path, problem: str) -> dict:
    """Find exact file:line of the bug using git grep on problem keywords."""
    # Extract key terms from problem
    terms = set()
    for m in re.finditer(r'(\w+\.\w+\(\)|\w+\.\w+|\b\w{5,}\b)', problem):
        term = m.group(1).strip()
        if term not in ("https", "http", "github", "python", "issue", "description", "version"):
            terms.add(term)

    results = {}
    for term in list(terms)[:20]:
        try:
            r = subprocess.run(["git", "grep", "-n", "-i", term, "--", "*.py"],
                             cwd=repo_dir, capture_output=True, text=True, timeout=10)
            for line in r.stdout.strip().split("\n")[:10]:
                if ":" in line and "test" not in line and "migration" not in line:
                    fpath, lnum, *_ = line.split(":", 2)
                    if fpath not in results:
                        results[fpath] = set()
                    results[fpath].add(int(lnum))
        except: pass
    return results

def read_code_context(repo_dir: Path, bug_locations: dict) -> str:
    """Read surrounding code for each bug location."""
    parts = []
    for fpath, lines in sorted(bug_locations.items())[:5]:
        full_path = repo_dir / fpath
        if not full_path.exists(): continue
        content = full_path.read_text()
        all_lines = content.split("\n")
        for lnum in sorted(lines)[:5]:
            start = max(0, lnum - 15)
            end = min(len(all_lines), lnum + 15)
            code_block = "\n".join(f"{i+1}: {all_lines[i]}" for i in range(start, end))
            parts.append(f"## {fpath} (lines {start+1}-{end})\n```python\n{code_block}\n```")
    return "\n\n".join(parts)[:12000]

def run_tests(repo_dir: Path, test_spec: str) -> tuple:
    """Run specific test if available."""
    if not test_spec: return (True, "no tests specified")
    # Run pytest on the tests dir
    try:
        r = subprocess.run([sys.executable, "-m", "pytest", "-x", "-q", test_spec],
                         cwd=repo_dir, capture_output=True, text=True, timeout=120)
        return (r.returncode == 0, r.stdout[-1000:])
    except: return (False, "test execution failed")

def run(instance: dict, mode: str = "auto") -> dict:
    """Run agent on one instance: clone → read → generate → validate."""
    print(f"\n{'='*60}")
    print(f"[{mode}] {instance['instance_id']}")
    print(f"{'='*60}")

    # Step 1: Clone
    print("[1/5] Cloning repo...")
    repo_dir = clone_repo(instance)

    # Step 2: Find bug location
    print("[2/5] Finding bug location...")
    problem = instance["problem_statement"]
    locations = find_bug_location(repo_dir, problem)
    if not locations:
        # Fallback: search for file paths in problem
        for m in re.finditer(r'([\w/-]+\.py)', problem):
            path = repo_dir / m.group(1)
            if path.exists():
                locations[m.group(1)] = set()
    print(f"  Found {len(locations)} relevant files")

    # Step 3: Read code context
    print("[3/5] Reading source code...")
    code_ctx = read_code_context(repo_dir, locations)
    print(f"  Context: {len(code_ctx)} chars")

    # Step 4: Generate patch via DeepSeek
    print("[4/5] Generating patch...")
    system = textwrap.dedent("""\
    You are an expert Python developer. Given the exact source code with line numbers,
    generate a unified diff patch that fixes the bug.

    Rules:
    1. Use the EXACT line numbers shown in the code
    2. Make minimal changes — only fix the bug
    3. Output ONLY the diff, starting with ```diff and ending with ```
    4. The diff must have correct @@ line markers matching the code you see""")

    user = f"""## Bug Report

{problem}

## Source Code (with exact line numbers)

{code_ctx}

## Instructions

Generate a unified diff patch to fix this bug. Use the EXACT line numbers from above.
"""
    raw = call_deepseek(system, user)
    patch = re.search(r'```diff\n(.*?)```', raw, re.DOTALL)
    patch_text = patch.group(1).strip() if patch else raw.strip()

    # Step 5: Validate patch can be applied
    print("[5/5] Validating patch...")
    patch_file = repo_dir / "fix.patch"
    patch_file.write_text(patch_text)

    r = subprocess.run(["git", "apply", "--check", str(patch_file)],
                      cwd=repo_dir, capture_output=True, text=True)
    apply_ok = r.returncode == 0

    if apply_ok:
        subprocess.run(["git", "apply", str(patch_file)], cwd=repo_dir)
        print("  ✓ Patch applied cleanly")
    else:
        print(f"  ✗ Patch apply failed: {r.stderr[:200]}")

    return {
        "instance_id": instance["instance_id"],
        "mode": mode,
        "patch": patch_text,
        "patch_chars": len(patch_text),
        "apply_ok": apply_ok,
        "error": r.stderr[:300] if not apply_ok else None,
    }

# CLI
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--instances", required=True)
    parser.add_argument("--index", type=int, default=0)
    parser.add_argument("--mode", default="auto")
    parser.add_argument("--output", default="/tmp/swebench_predictions.json")
    args = parser.parse_args()

    instances = json.loads(open(args.instances).read())
    inst = instances[args.index]
    result = run(inst, args.mode)

    # Save prediction
    pred = {
        "instance_id": inst["instance_id"],
        "model_name_or_path": f"kevix/agent-{args.mode}",
        "model_patch": result["patch"],
    }
    out_path = Path(args.output)
    existing = json.loads(out_path.read_text()) if out_path.exists() else []
    existing.append(pred)
    out_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False))

    print(f"\nPatch saved to {out_path}")
    print(f"Apply OK: {result['apply_ok']}")
