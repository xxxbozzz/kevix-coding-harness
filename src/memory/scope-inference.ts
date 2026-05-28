// P61: Scope inference — L0 intent recognition from problem text + filesystem

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { ScopeContract } from "../types.js";

/** Infer a ScopeContract from problem text by scanning for evidence files. */
export function inferScopeContract(
  problem: string,
  cwd: string = process.cwd(),
): ScopeContract {
  const candidates = extractFilePaths(problem);
  const editableScope: string[] = [];
  const readOnlyEvidence: string[] = [];

  for (const f of candidates) {
    const abs = resolve(cwd, f);
    if (!existsSync(abs)) continue;

    if (isTestFile(f)) {
      readOnlyEvidence.push(f);
    } else {
      editableScope.push(f);
    }
  }

  // If we found source files, try to find matching test files
  for (const sourceFile of [...editableScope]) {
    const testVariant = sourceToTest(sourceFile);
    if (testVariant && !readOnlyEvidence.includes(testVariant)) {
      const abs = resolve(cwd, testVariant);
      if (existsSync(abs)) {
        readOnlyEvidence.push(testVariant);
      }
    }
  }

  // If we found test files, try to find matching source files
  for (const testFile of readOnlyEvidence) {
    const sourceVariant = testFileToSource(testFile);
    if (sourceVariant && !editableScope.includes(sourceVariant)) {
      const abs = resolve(cwd, sourceVariant);
      if (existsSync(abs)) {
        editableScope.push(sourceVariant);
      }
    }
  }

  // Guess success check
  const successChecks: string[] = [];
  if (readOnlyEvidence.length > 0 || editableScope.length > 0) {
    const hasNodeTest = readOnlyEvidence.some((f) => f.includes(".test.") && (f.endsWith(".js") || f.endsWith(".ts")));
    successChecks.push(hasNodeTest ? "npm test" : "npm test");
  }

  return {
    editableScope: editableScope.length > 0 ? editableScope : [],
    readOnlyEvidence,
    successChecks,
  };
}

/** Extract candidate file paths from problem text. */
function extractFilePaths(text: string): string[] {
  const files = new Set<string>();
  // Full paths: src/foo.ts, test/foo.test.ts, lib/bar.js
  for (const m of text.matchAll(/(?:src|lib|tests?|app)\/[\w.\-/]+\.\w{1,4}/g)) {
    files.add(m[0]);
  }
  // Bare filenames with extensions
  for (const m of text.matchAll(/\b([\w.-]+\.(?:ts|tsx|js|jsx|py|go|rs))\b/g)) {
    files.add(m[0]);
  }
  return [...files].slice(0, 10);
}

function isTestFile(filePath: string): boolean {
  return /test|spec|__tests__/.test(filePath) ||
    filePath.includes(".test.") ||
    filePath.includes(".spec.") ||
    filePath.includes("_test.");
}

function sourceToTest(sourcePath: string): string | null {
  // src/foo.ts → test/foo.test.ts
  const name = sourcePath.replace(/^src\//, "").replace(/^lib\//, "").replace(/^app\//, "");
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx < 0) return null;
  const base = name.slice(0, dotIdx);
  const ext = name.slice(dotIdx);
  for (const dir of ["test", "tests", "__tests__", "spec"]) {
    for (const suffix of [".test", ".spec", "_test"]) {
      const candidate = `${dir}/${base}${suffix}${ext}`;
      if (candidate !== sourcePath) return candidate;
    }
  }
  return null;
}

function testFileToSource(testPath: string): string | null {
  // test/summarizeOrder.test.js → src/summarizeOrder.js
  const name = testPath
    .replace(/^tests?\//, "")
    .replace(/^__tests__\//, "")
    .replace(/\.test\./, ".")
    .replace(/\.spec\./, ".")
    .replace(/_test\./, ".");

  const ext = name.split(".").pop();
  if (!ext) return null;

  // Try common source directories
  for (const dir of ["src", "lib", "app"]) {
    const candidate = `${dir}/${name}`;
    if (candidate !== testPath) return candidate;
  }

  return name;
}
