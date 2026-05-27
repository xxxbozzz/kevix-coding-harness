// P56 DirectiveCard — collapsed summary of full directive, expandable on demand

import { Box, Text } from "ink";
import type { PEANDirective } from "../../types.js";

interface Props {
  directive: PEANDirective;
  selected: number;
  expanded: boolean;
}

function smartTruncate(text: string | undefined, max: number): string {
  if (!text) return "(none)";
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  return text.slice(0, cut > max / 2 ? cut : max) + " …";
}

export default function DirectiveCard({ directive, selected, expanded }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} marginY={1}>
      <Text bold color="yellow">Directive ready</Text>

      {expanded ? (
        // Full directive view
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Product Intent</Text>
          <Text dimColor>{directive.product_intent || "(none)"}</Text>
          <Box marginTop={1}><Text bold>Hidden Semantics</Text></Box>
          <Text dimColor>{smartTruncate(directive.hidden_semantics, 300)}</Text>
          <Box marginTop={1}><Text bold>Acceptance Tests</Text></Box>
          <Text dimColor>{smartTruncate(directive.acceptance_tests, 300)}</Text>
          <Box marginTop={1}><Text bold>Constraints</Text></Box>
          <Text dimColor>{smartTruncate(directive.implementation_constraints, 200)}</Text>
          <Box marginTop={1}><Text bold>Red Flags</Text></Box>
          <Text color="red">{directive.red_flags || "None"}</Text>
          <Box marginTop={1}><Text bold>Worker Directive</Text></Box>
          <Text dimColor>{smartTruncate(directive.worker_directive, 400)}</Text>
        </Box>
      ) : (
        // Collapsed summary view
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Intent</Text>
          <Text>{smartTruncate(directive.product_intent, 120)}</Text>

          <Box marginTop={1}><Text bold>Worker Plan</Text></Box>
          <Text dimColor>{smartTruncate(directive.worker_directive, 200)}</Text>

          <Box marginTop={1}><Text bold>Red Flags</Text></Box>
          <Text color="red">{directive.red_flags || "None"}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color={selected === 0 ? "cyan" : undefined}>
          {selected === 0 ? "❯ " : "  "}[Enter] Execute — run Worker with this directive
        </Text>
        <Text color={selected === 1 ? "cyan" : undefined}>
          {selected === 1 ? "❯ " : "  "}[E] Modify — re-run Controller with edits
        </Text>
        <Text color={selected === 2 ? "cyan" : undefined}>
          {selected === 2 ? "❯ " : "  "}[V] {expanded ? "Collapse" : "View full directive"}
        </Text>
        <Text color={selected === 3 ? "cyan" : undefined}>
          {selected === 3 ? "❯ " : "  "}[Esc] Cancel — return to input
        </Text>
      </Box>
      <Text dimColor>↑↓ select  Enter confirm</Text>
    </Box>
  );
}
