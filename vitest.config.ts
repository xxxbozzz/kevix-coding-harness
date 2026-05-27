import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "tests/pean-memory.test.ts",
      "tests/approval-gate.test.ts",
      "tests/review-loop.test.ts",
      "tests/graph.test.ts",
      "tests/entropy-risk.test.ts",
      "tests/auto-assess-graph.test.ts",
      "tests/tradeoff-control-plane.test.ts",
      "tests/persistence.test.ts",
      "tests/ink-test-status.test.ts",
      "tests/evidence-validator.test.ts",
      "tests/scope-contract.test.ts",
      "tests/memory-store.test.ts",
      "tests/tools/bash.test.ts",
      "tests/tools/read.test.ts",
      "tests/tools/write.test.ts",
      "tests/tools/edit.test.ts",
      "tests/tools/grep.test.ts",
      "tests/tools/glob.test.ts",
      "tests/tools/bash-utils.test.ts",
      "tests/tools/glob-utils.test.ts",
      "tests/pean/pean-utils.test.ts",
    ],
    exclude: ["node_modules/**", "dist/**", "tests/smoke-test.ts"],
  },
});
