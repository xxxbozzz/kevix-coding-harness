// P55 Evidence Validator regression tests

import { describe, it, expect } from "vitest";
import {
  extractEvidenceTerms,
  assessDirectiveConfidence,
  isHighRiskToken,
} from "../src/cli/ink/evidence-validator.js";

const FIXTURE_EVIDENCE = `
import { summarizeOrder } from "../src/summarizeOrder.js";
test("preserves output shape", () => {
  expect(summarizeOrder({ id: "A1", status: "paid", items: [{ price: 5, quantity: 2 }] }))
    .toEqual({ id: "A1", total: 10, status: "paid" });
});
test("handles invalid input", () => {
  expect(() => summarizeOrder(null)).toThrow();
});
`;

function makeEvidenceTerms(): Set<string> {
  return extractEvidenceTerms(
    "src/summarizeOrder.js test/summarizeOrder.test.js " + FIXTURE_EVIDENCE
  );
}

describe("Evidence Validator — High Risk (camelCase/PascalCase)", () => {
  it("flags orderId as high risk when not in evidence", () => {
    const result = assessDirectiveConfidence(
      makeEvidenceTerms(),
      "The function should return { orderId, total, status }"
    );
    expect(result.confidence).toBe("low");
    expect(result.highRisk).toContain("orderId");
  });

  it("flags itemCount as high risk when not in evidence", () => {
    const result = assessDirectiveConfidence(
      makeEvidenceTerms(),
      "Return { itemCount, orderTotal }"
    );
    expect(result.confidence).toBe("low");
    expect(result.highRisk).toContain("itemCount");
  });
});

describe("Evidence Validator — Medium Risk (domain nouns in semantic zones)", () => {
  it("flags cart timestamp pending as medium risk", () => {
    const result = assessDirectiveConfidence(
      makeEvidenceTerms(),
      "The function accepts a cart and returns { timestamp, status: pending }"
    );
    // cart near "accepts", timestamp near "returns", pending near "status:"
    expect(result.mediumRisk.length).toBeGreaterThanOrEqual(2);
    expect(result.confidence).toBe("low");
  });
});

describe("Evidence Validator — Safe (evidence-backed)", () => {
  it("good fixture directive is confident", () => {
    const result = assessDirectiveConfidence(
      makeEvidenceTerms(),
      "Function summarizeOrder accepts order with items, each having price and quantity. Returns { id, total, status }."
    );
    expect(result.confidence).toBe("confident");
  });

  it("evidence-backed fields are safe", () => {
    const ev = makeEvidenceTerms();
    expect(ev.has("summarizeorder")).toBe(true);
    expect(ev.has("id")).toBe(true);
    expect(ev.has("total")).toBe(true);
    expect(ev.has("status")).toBe(true);
    expect(ev.has("items")).toBe(true);
    expect(ev.has("quantity")).toBe(true);
    expect(ev.has("price")).toBe(true);
  });

  it("real TUI directive with protective test red flag stays confident", () => {
    const directive = `
Product Intent
Need to read test/source files before finalizing intent. The implementation must make all npm test assertions pass.
Red Flags
\`test/summarizeOrder.test.js\`
Constraints
- Do not modify the test file or any test expectations.
- Preserve the existing function signature (name, parameters, export) as expected by the tests.
- Do not change any other source files.
Worker Directive
1. Read \`test/summarizeOrder.test.js\` to understand the exact expected output structure and behavior for \`summarizeOrder\`.
2. Read \`src/summarizeOrder.js\` and compare the current implementation to the test expectations.
3. Identify missing or malformed input behavior and ensure the implementation matches the tests.
`;

    const confidence = assessDirectiveConfidence(makeEvidenceTerms(), directive);
    const risk = classifyDirectiveRisk("`test/summarizeOrder.test.js`", directive);

    expect(confidence.confidence).toBe("confident");
    expect(confidence.mediumRisk).toEqual([]);
    expect(risk.level).toBe("protective");
    expect(getApprovalDefaultSelection({
      entityConfidence: confidence.confidence,
      riskLevel: risk.level,
    })).toBe(0);
  });
});

describe("Evidence Validator — Ignored (boilerplate + action)", () => {
  it("boilerplate words are ignored", () => {
    const result = assessDirectiveConfidence(
      makeEvidenceTerms(),
      "Product Intent: read source files before worker directive. Implementation constraints and red flags should be defined."
    );
    // All boilerplate → confident
    expect(result.confidence).toBe("confident");
    expect(result.highRisk).toEqual([]);
    expect(result.mediumRisk).toEqual([]);
  });

  it("action words are ignored", () => {
    const result = assessDirectiveConfidence(
      makeEvidenceTerms(),
      "Fix the reads, multiplies, throws, and validates. Handle invalid input."
    );
    expect(result.confidence).toBe("confident");
    expect(result.highRisk).toEqual([]);
  });
});

describe("Evidence Validator — Casing", () => {
  it("preserves casing: orderId is high risk, orderid is not", () => {
    expect(isHighRiskToken("orderId")).toBe(true);
    expect(isHighRiskToken("orderid")).toBe(false);
  });

  it("PascalCase is high risk", () => {
    expect(isHighRiskToken("ItemCount")).toBe(true);
    expect(isHighRiskToken("itemcount")).toBe(false);
  });
});

// ── P55.1 Directive Risk Classification ──

import { classifyDirectiveRisk, type DirectiveRiskLevel } from "../src/cli/ink/evidence-validator.js";

describe("classifyDirectiveRisk — normal", () => {
  it("returns normal for undefined red flags", () => {
    const result = classifyDirectiveRisk(undefined, "Fix the bug");
    expect(result.level).toBe("normal");
    expect(result.reasons).toEqual([]);
  });

  it("returns normal for None red flags", () => {
    expect(classifyDirectiveRisk("None", "task").level).toBe("normal");
    expect(classifyDirectiveRisk("None.", "task").level).toBe("normal");
  });

  it("returns normal for empty red flags", () => {
    expect(classifyDirectiveRisk("", "task").level).toBe("normal");
  });
});

describe("classifyDirectiveRisk — protective", () => {
  it("returns protective for ordinary scope path", () => {
    const result = classifyDirectiveRisk("Do not modify test/summarizeOrder.test.js", "fix bug");
    expect(result.level).toBe("protective");
    expect(result.reasons).toContain("directive has red flags requiring scope review");
  });

  it("returns protective for public API guard", () => {
    const result = classifyDirectiveRisk("Do not change public API", "fix bug");
    expect(result.level).toBe("protective");
  });

  it("returns protective for backward compat constraint", () => {
    const result = classifyDirectiveRisk("Keep backward compatibility", "fix bug in src/foo.ts");
    expect(result.level).toBe("protective");
  });

  it("returns protective for whitespace-only red flags", () => {
    expect(classifyDirectiveRisk("   ", "task").level).toBe("normal");
  });
});

describe("classifyDirectiveRisk — high (secrets/credentials)", () => {
  it("returns high when red flags mention .env", () => {
    const result = classifyDirectiveRisk("Do not touch .env files", "fix config loading");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes(".env"))).toBe(true);
  });

  it("returns high for credential mention in directive text", () => {
    const result = classifyDirectiveRisk(undefined, "This fix involves credential handling and token refresh");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("secrets/credentials"))).toBe(true);
  });

  it("returns high for API key mention", () => {
    const result = classifyDirectiveRisk("None", "Rotate the API_KEY for the auth module");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("secrets/credentials"))).toBe(true);
  });

  it("returns high for password mention", () => {
    const result = classifyDirectiveRisk(undefined, "Reset password validation logic");
    expect(result.level).toBe("high");
  });

  it("returns high for SSH keys mention", () => {
    const result = classifyDirectiveRisk("Don't touch .ssh/config", "fix ssh wrapper");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("SSH"))).toBe(true);
  });

  it("returns high for AWS config mention", () => {
    const result = classifyDirectiveRisk(undefined, "Update .aws/credentials parser");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("AWS"))).toBe(true);
  });
});

describe("classifyDirectiveRisk — high (destructive/permission)", () => {
  it("returns high for auth bypass mention", () => {
    const result = classifyDirectiveRisk("None", "Implement auth bypass for testing");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("bypass"))).toBe(true);
  });

  it("returns high for permission bypass mention", () => {
    const result = classifyDirectiveRisk(undefined, "Allow permission bypass in admin mode");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("bypass"))).toBe(true);
  });

  it("returns high for rm -rf mention", () => {
    const result = classifyDirectiveRisk("None", "Clean up with rm -rf /tmp/cache");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("destructive shell"))).toBe(true);
  });

  it("returns high for chmod -R 777 mention", () => {
    const result = classifyDirectiveRisk(undefined, "Fix permissions: chmod -R 777 on data dir");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("chmod"))).toBe(true);
  });

  it("returns high for DROP TABLE mention", () => {
    const result = classifyDirectiveRisk("None", "Migration must DROP TABLE legacy_users");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("DB op"))).toBe(true);
  });

  it("returns high for TRUNCATE mention", () => {
    const result = classifyDirectiveRisk(undefined, "TRUNCATE TABLE cache_entries before reload");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("DB op"))).toBe(true);
  });

  it("returns high for destructive migration mention", () => {
    const result = classifyDirectiveRisk("None", "Run destructive migration to drop column");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("migration"))).toBe(true);
  });

  it("returns high for system config path /etc/", () => {
    const result = classifyDirectiveRisk(undefined, "Read /etc/hosts for resolution");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("system config"))).toBe(true);
  });

  it("returns high for /usr/bin path", () => {
    const result = classifyDirectiveRisk("None", "Check /usr/bin/node version");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("binary"))).toBe(true);
  });

  it("returns high for sudo mention", () => {
    const result = classifyDirectiveRisk(undefined, "Use sudo to restart daemon");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("privileges"))).toBe(true);
  });

  it("returns high for root mention", () => {
    const result = classifyDirectiveRisk("None", "Run as root for install phase");
    expect(result.level).toBe("high");
    expect(result.reasons.some((r) => r.includes("privileges"))).toBe(true);
  });
});

// ── P55.1 getApprovalDefaultSelection ──

import { getApprovalDefaultSelection } from "../src/cli/ink/evidence-validator.js";

describe("getApprovalDefaultSelection", () => {
  it("low + normal → Regenerate (1)", () => {
    expect(getApprovalDefaultSelection({ entityConfidence: "low", riskLevel: "normal" })).toBe(1);
  });

  it("low + protective → Regenerate (1)", () => {
    expect(getApprovalDefaultSelection({ entityConfidence: "low", riskLevel: "protective" })).toBe(1);
  });

  it("low + high → Regenerate (1) — entity confidence wins", () => {
    expect(getApprovalDefaultSelection({ entityConfidence: "low", riskLevel: "high" })).toBe(1);
  });

  it("confident + protective → Approve (0)", () => {
    expect(getApprovalDefaultSelection({ entityConfidence: "confident", riskLevel: "protective" })).toBe(0);
  });

  it("confident + high → Reject (2)", () => {
    expect(getApprovalDefaultSelection({ entityConfidence: "confident", riskLevel: "high" })).toBe(2);
  });

  it("confident + normal → Approve (0)", () => {
    expect(getApprovalDefaultSelection({ entityConfidence: "confident", riskLevel: "normal" })).toBe(0);
  });
});
