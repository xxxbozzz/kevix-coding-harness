// Debug: check raw Review output for 1 clean case
import { REVIEW_SYSTEM } from "../src/provider/pean-system.js";

const API_KEY = process.env.DEEPSEEK_API_KEY!;
const directive = `## Product Intent
Fix login validation.
## Hidden Semantics
Handle null, empty, and whitespace-only inputs.
## Acceptance Tests
1. null username -> error. 2. empty password -> error. 3. valid -> success.
## Implementation Constraints
Preserve function signature. Do not change return type.
## Red Flags
- src/auth/api.ts
## Coding Worker Directive
Add input guards at the top of the function.`;

const patch = `\`\`\`diff
--- a/src/login.ts
+++ b/src/login.ts
@@ -1,5 +1,10 @@
 function processLogin(username: string | null, password: string | null) {
+  if (username == null || username.trim() === "") {
+    return { valid: false, error: "Username required" };
+  }
+  if (password == null || password === "") {
+    return { valid: false, error: "Password required" };
+  }
   return { valid: true };
 }
\`\`\``;

async function main() {
  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      messages: [
        { role: "system", content: REVIEW_SYSTEM },
        { role: "user", content: `## Directive\n\n${directive}\n\n## Patch to Review\n\n${patch}\n\nAudit this patch against the directive. Output JSON only.` },
      ],
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });
  const data = await resp.json() as any;
  const raw = data.choices?.[0]?.message?.content ?? "";
  console.log("RAW OUTPUT:");
  console.log(raw);
  console.log();
  console.log("---");
  try {
    const parsed = JSON.parse(raw);
    console.log("Parsed:", JSON.stringify(parsed, null, 2));
  } catch {
    console.log("(not valid JSON)");
  }
}

main().catch((e) => console.error(e));
