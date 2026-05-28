// DirectiveCard — six-point summary, CC-style directive review

import { Box, Text } from "ink";
import type { PEANDirective } from "../../types.js";

interface Props {
  directive: PEANDirective;
  selected: number;
  expanded: boolean;
}

function oneLine(text: string | undefined, max: number = 100): string {
  if (!text) return "(none)";
  const first = text.split("\n")[0] ?? "";
  if (first.length <= max) return first;
  return first.slice(0, max - 1) + "…";
}

function extractPoints(d: PEANDirective): string[] {
  const intent = oneLine(d.product_intent, 80);
  const hidden = d.hidden_semantics?.split("\n").filter(l => l.trim()).slice(0, 1).join(" ") ?? "(none)";
  const tests = d.acceptance_tests?.split("\n").filter(l => l.trim()).slice(0, 1).join(" ") ?? "(none)";
  const constraints = d.implementation_constraints?.split("\n").filter(l => l.trim()).slice(0, 1).join(" ") ?? "(none)";
  const redFlags = d.red_flags && d.red_flags !== "None" ? oneLine(d.red_flags, 80) : "None";
  const worker = d.worker_directive?.split("\n").filter(l => l.trim()).slice(0, 2).join(" ").slice(0, 120) ?? "(none)";
  return [intent, hidden.slice(0, 80), tests.slice(0, 80), constraints.slice(0, 80), redFlags, worker.slice(0, 120)];
}

export default function DirectiveCard({ directive, selected, expanded }: Props) {
  const points = extractPoints(directive);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={expanded ? "yellow" : "cyan"} padding={1} marginY={1}>
      <Text bold color="cyan">Directive — six points</Text>

      {expanded ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>1. Intent</Text>
          <Text>{directive.product_intent || "(none)"}</Text>
          <Box marginTop={1}><Text bold>2. Key Conditions</Text></Box>
          <Text dimColor>{directive.hidden_semantics || "(none)"}</Text>
          <Box marginTop={1}><Text bold>3. Acceptance Tests</Text></Box>
          <Text dimColor>{directive.acceptance_tests || "(none)"}</Text>
          <Box marginTop={1}><Text bold>4. Constraints</Text></Box>
          <Text dimColor>{directive.implementation_constraints || "(none)"}</Text>
          <Box marginTop={1}><Text bold>5. Red Flags</Text></Box>
          <Text color="red">{directive.red_flags || "None"}</Text>
          <Box marginTop={1}><Text bold>6. Worker Plan</Text></Box>
          <Text dimColor>{directive.worker_directive || "(none)"}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text>① {points[0]}</Text>
          <Text dimColor>② {points[1]}</Text>
          <Text dimColor>③ {points[2]}</Text>
          <Text dimColor>④ {points[3]}</Text>
          <Text color="yellow">⑤ {points[4]}</Text>
          <Text dimColor>⑥ {points[5]}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color={selected === 0 ? "cyan" : undefined}>
          {selected === 0 ? "❯ " : "  "}[Enter] Execute
        </Text>
        <Text color={selected === 1 ? "cyan" : undefined}>
          {selected === 1 ? "❯ " : "  "}[E] Modify
        </Text>
        <Text color={selected === 2 ? "cyan" : undefined}>
          {selected === 2 ? "❯ " : "  "}[V] {expanded ? "Collapse" : "View full directive"}
        </Text>
        <Text color={selected === 3 ? "cyan" : undefined}>
          {selected === 3 ? "❯ " : "  "}[Esc] Cancel
        </Text>
      </Box>
      <Text dimColor>↑↓ select  Enter confirm  ·  six-point summary</Text>
    </Box>
  );
}
