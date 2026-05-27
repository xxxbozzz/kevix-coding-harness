#!/usr/bin/env python3
"""Generate git-diff patches for SWE-bench instances across all 4 arms.
For each instance: clone → deepseek fix → git diff → save patch per arm."""
import json, os, re, subprocess, sys, time, urllib.request
from pathlib import Path

KEY = os.environ["DEEPSEEK_API_KEY"]
WORK = Path("/tmp/kevix_swebench")
PREDS_DIR = Path("/Users/kev/Documents/New project 5/kevix-coding-harness/predictions")

def call_ds(system: str, user: str, max_tok=16000):
    payload = {"model": "deepseek-chat", "temperature": 0.1, "max_tokens": max_tok,
               "messages": [{"role":"system","content":system},{"role":"user","content":user}]}
    req = urllib.request.Request("https://api.deepseek.com/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {KEY}","Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode())["choices"][0]["message"]["content"]

def clone(inst, idx):
    d = WORK / inst["instance_id"].replace("/","_")
    if d.exists(): subprocess.run(["rm","-rf",str(d)])
    d.mkdir(parents=True, exist_ok=True)
    print(f"  [{idx}] Cloning {inst['repo'][:30]}...")
    subprocess.run(["git","clone","--depth","1",f"https://github.com/{inst['repo']}.git",str(d)],
                   check=True, capture_output=True, timeout=180)
    subprocess.run(["git","fetch","--depth","1","origin",inst["base_commit"]],
                   cwd=d, check=True, capture_output=True, timeout=30)
    subprocess.run(["git","checkout",inst["base_commit"]],
                   cwd=d, check=True, capture_output=True, timeout=30)
    return d

def find_bug(repo, problem):
    """Search for likely bug locations."""
    terms = set()
    for m in re.finditer(r'([\w/]+\.py)\b|(\w+\.\w+\(\))|def\s+(\w+)', problem):
        t = m.group(1) or m.group(2) or m.group(3)
        if t and len(t) > 3 and t not in ("http","https","github","python","issue","description","version","self"):
            terms.add(t)

    locations = {}
    for term in list(terms)[:15]:
        try:
            r = subprocess.run(["grep","-rn","-i",term,"--include=*.py"],
                             cwd=repo, capture_output=True, text=True, timeout=15)
            for line in r.stdout.strip().split("\n")[:8]:
                if ":" in line and "test" not in line[:60] and "/migration" not in line[:60]:
                    parts = line.split(":", 2)
                    fpath, lnum = parts[0], parts[1]
                    if fpath not in locations: locations[fpath] = set()
                    try: locations[fpath].add(int(lnum))
                    except: pass
        except: pass
    return locations

def read_context(repo, locations):
    """Read source code around bug locations."""
    parts = []
    total = 0
    for fpath, lnums in sorted(locations.items())[:5]:
        fp = repo / fpath
        if not fp.exists(): continue
        lines = fp.read_text().split("\n")
        for lnum in sorted(lnums)[:3]:
            s, e = max(0, lnum-20), min(len(lines), lnum+20)
            block = "\n".join(f"{i+1:5d}: {lines[i]}" for i in range(s, e))
            hdr = f"## {fpath} lines {s+1}-{e}"
            if total + len(block) < 10000:
                parts.append(f"{hdr}\n```python\n{block}\n```")
                total += len(block) + len(hdr) + 20
    return "\n\n".join(parts)

SYSTEM_PROMPT = """You are an expert Python developer. Given exact source code with line numbers and a bug report,
write the CORRECT fixed code. Then output the fix as a unified diff patch.

IMPORTANT RULES:
1. Study the EXACT line numbers shown — they are correct
2. Write the minimal fix
3. Output the patch with ```diff fences
4. The @@ markers MUST match the actual line numbers you see in the source"""

def generate_fix(problem, code_ctx, arm="auto"):
    """Generate fix for one arm mode."""

    if arm == "direct":
        system = "You are an expert Python developer. Fix the bug. Output ONLY the corrected code with ```diff."
        user = f"Bug:\n{problem}\n\nSource:\n{code_ctx}\n\nFix this bug. Output unified diff:"
    elif arm == "generic":
        system = "Plan the fix, then implement. Output ONLY the fix as ```diff."
        user = f"Bug:\n{problem}\n\nSource:\n{code_ctx}\n\n1. Brief plan\n2. Fix as unified diff:"
    elif arm == "memory":
        system = SYSTEM_PROMPT
        user = f"## Bug\n{problem}\n\n## Source\n{code_ctx}\n\n## Product Intent\nFix the bug correctly.\n## Hidden Semantics\nCheck None comparisons, type boundaries, edge cases.\n## Fix (as unified diff):"
    else:  # auto
        system = SYSTEM_PROMPT
        user = f"## Bug\n{problem}\n\n## Source\n{code_ctx}\n\nFix the bug. Consider:\n- Wire-level risks (encoding, type coercion)\n- API boundaries\n- Edge cases\n\nIf the fix is simple and has no wire-level risk, output it directly as unified diff."

    return call_ds(system, user)

def apply_and_diff(repo, fix_text):
    """Apply the LLM's fix to source files and git diff the result."""
    # Extract patch
    patch_m = re.search(r'```diff\n(.*?)```', fix_text, re.DOTALL)
    if not patch_m:
        patch_m = re.search(r'```\n(.*?)```', fix_text, re.DOTALL)
    patch_raw = patch_m.group(1).strip() if patch_m else fix_text.strip()

    # Try to apply the patch
    (repo / "_fix.patch").write_text(patch_raw)
    r = subprocess.run(["git","apply","--check","_fix.patch"], cwd=repo, capture_output=True, text=True)

    if r.returncode == 0:
        subprocess.run(["git","apply","_fix.patch"], cwd=repo, capture_output=True)
        r = subprocess.run(["git","diff"], cwd=repo, capture_output=True, text=True)
        return r.stdout.strip(), True

    # Patch didn't apply — try to parse the fix and apply line by line
    # Parse: file path + old line + new line from the LLM output
    return patch_raw, False

def main():
    instances = json.loads(open(sys.argv[1]).read()) if len(sys.argv) > 1 else \
                json.loads(open("/Users/kev/kevix/instances_100.json").read())

    # 5 pilot instances
    pilot_ids = ["django__django-16569","django__django-10999","django__django-11138",
                  "pytest-dev__pytest-7205","sympy__sympy-18199"]

    pilot = []
    for i, inst in enumerate(instances):
        if inst["instance_id"] in pilot_ids:
            pilot.append((i, inst))

    print(f"Generating patches for {len(pilot)} instances × 4 arms")
    print("=" * 70)

    all_preds = []
    for idx, inst in pilot:
        iid = inst["instance_id"]
        print(f"\n{'='*50}\n{iid} ({inst['category']})\n{'='*50}")

        # Clone
        repo = clone(inst, idx)

        # Find bug and read context (same for all arms)
        locations = find_bug(repo, inst["problem_statement"])
        print(f"  Found {len(locations)} relevant files")
        code_ctx = read_context(repo, locations)
        print(f"  Context: {len(code_ctx)} chars")

        arms = {}
        for arm in ["direct","generic","memory","auto"]:
            print(f"  [{arm}] ", end="", flush=True)
            try:
                fix = generate_fix(inst["problem_statement"], code_ctx, arm)
                patch, ok = apply_and_diff(repo, fix)
                arms[arm] = {"patch": patch, "ok": ok}
                print(f"{'✓' if ok else '⚠'} {len(patch)} chars")
            except Exception as e:
                arms[arm] = {"patch": "", "ok": False}
                print(f"✗ {e}")

            # Reset repo for next arm
            subprocess.run(["git","checkout","."], cwd=repo, capture_output=True)
            time.sleep(1)


        # Save predictions
        for arm, data in arms.items():
            if data["ok"] and data["patch"]:
                all_preds.append({
                    "instance_id": iid,
                    "model_name_or_path": f"kevix/{arm}",
                    "model_patch": data["patch"],
                })

    # Write predictions per arm
    PREDS_DIR.mkdir(parents=True, exist_ok=True)
    for arm in ["direct","generic","memory","auto"]:
        arm_preds = [p for p in all_preds if f"kevix/{arm}" in p["model_name_or_path"]]
        if arm_preds:
            path = PREDS_DIR / f"predictions_pilot_{arm}.json"
            path.write_text(json.dumps(arm_preds, indent=2, ensure_ascii=False))
            print(f"\n{arm}: {len(arm_preds)} patches → {path.name}")

if __name__ == "__main__":
    main()
