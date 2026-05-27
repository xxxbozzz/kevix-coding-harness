export type TestStatus = "pass" | "fail" | null;

export function detectTestStatus(output: string): TestStatus {
  const text = output.toLowerCase();

  const tapFail = text.match(/#\s*fail\s+(\d+)/);
  if (tapFail) {
    return Number(tapFail[1]) === 0 ? "pass" : "fail";
  }

  const tapPass = text.match(/#\s*pass\s+(\d+)/);
  if (tapPass && !tapFail) {
    return "pass";
  }

  if (/\b(test files|tests?)\b[\s\S]*\bfailed\b/.test(text)) {
    return "fail";
  }

  if (/\b(test files|tests?)\b[\s\S]*\bpassed\b/.test(text)) {
    return "pass";
  }

  if (/\b\d+\s+failed\b/.test(text) || /\bfailures?:\s*[1-9]\d*/.test(text)) {
    return "fail";
  }

  if (/\b\d+\s+passed\b/.test(text) || /\bok\b/.test(text) && /\btests?\b/.test(text)) {
    return "pass";
  }

  return null;
}
