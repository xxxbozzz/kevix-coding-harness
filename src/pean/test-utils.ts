import { execSync } from "child_process";

function getExitCode(command: string): number {
  try {
    execSync(command, { stdio: "pipe" });
    return 0;
  } catch (error: any) {
    return error.status ?? 1; // treat spawn failure as non‑zero
  }
}

export function runQuickCheck(): { build_ok: boolean; test_ok: boolean } {
  const build_ok = getExitCode("npx tsc --noEmit") === 0;
  const test_ok = getExitCode("npx vitest run") === 0;
  return { build_ok, test_ok };
}
