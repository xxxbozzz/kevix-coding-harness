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
