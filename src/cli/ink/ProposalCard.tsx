// P56 ScopeProposalCard — task boundary check before full directive

import { Box, Text } from "ink";
import type { ScopeProposal } from "./intent-router.js";

interface Props {
  proposal: ScopeProposal;
  selected: number;
  evidenceFiles: string[];
}

export default function ScopeProposalCard({ proposal, selected, evidenceFiles }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginY={1}>
      <Text bold color="cyan">Scope Proposal</Text>
      {evidenceFiles.length > 0 && (
        <Text dimColor>Evidence: {evidenceFiles.slice(0, 3).join(", ")}</Text>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Goal</Text>
        <Text>{proposal.goal || "(analyzing...)"}</Text>

        <Box marginTop={1}><Text bold>Editable Scope</Text></Box>
        <Text color="green">
          {proposal.editableScope.length > 0
            ? proposal.editableScope.map((f) => `  ${f}`).join("\n")
            : "(inferring from evidence...)"}
        </Text>

        <Box marginTop={1}><Text bold>Read-only Evidence</Text></Box>
        <Text color="yellow">
          {proposal.readOnlyEvidence.length > 0
            ? proposal.readOnlyEvidence.map((f) => `  ${f}`).join("\n")
            : "(none)"}
        </Text>

        <Box marginTop={1}><Text bold>Success Check</Text></Box>
        <Text dimColor>{proposal.successCheck || "npm test"}</Text>

        <Box marginTop={1}><Text bold>Plan</Text></Box>
        <Text dimColor>{proposal.plan || "(preparing...)"}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={selected === 0 ? "cyan" : undefined}>
          {selected === 0 ? "❯ " : "  "}[Enter] Approve — confirm scope and proceed to directive
        </Text>
        <Text color={selected === 1 ? "cyan" : undefined}>
          {selected === 1 ? "❯ " : "  "}[E] Edit — modify scope before proceeding
        </Text>
        <Text color={selected === 2 ? "cyan" : undefined}>
          {selected === 2 ? "❯ " : "  "}[Esc] Cancel — return to input
        </Text>
      </Box>
      <Text dimColor>↑↓ select  Enter confirm</Text>
    </Box>
  );
}
