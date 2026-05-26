import { Box, Text } from "ink";

export function StatusBar({ mode, cache, gates, calls, elapsed, running, retrying }: {
  mode: string;
  cache: { hit: number; count: number };
  gates: number;
  calls?: number;
  elapsed?: number;
  running?: boolean;
  retrying?: boolean;
}) {
  const parts: string[] = [
    `mode: ${mode}`,
    `v4-pro`,
  ];
  if (running && calls === 0) parts.push("waiting...");
  else if (calls !== undefined) parts.push(`calls: ${calls}`);
  if (retrying) parts.push("retrying...");
  if (cache.count > 0) parts.push(`cache: ${cache.hit.toFixed(0)}%`);
  if (gates > 0) parts.push(`gates: ${gates}`);
  if (elapsed !== undefined && elapsed > 0) parts.push(`${elapsed}s`);

  return (
    <Box borderStyle="single" borderColor="blue" paddingX={1}>
      <Text dimColor>{parts.join("  |  ")}</Text>
    </Box>
  );
}
