import { Box, Text } from "ink";
import { useState, useEffect } from "react";

const SPINNER = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

export function PhaseBar({ phase, running, elapsed, idle }: { phase: string; running: boolean; elapsed?: number; idle?: boolean }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 100);
    return () => clearInterval(t);
  }, [running]);

  if (!phase) return null;

  return (
    <Box>
      <Text dimColor>⏺ </Text>
      <Text color={idle ? "yellow" : "cyan"}>{phase}</Text>
      {running && <Text color="cyan"> {SPINNER[frame]}</Text>}
      {elapsed !== undefined && elapsed > 0 && <Text dimColor>  {elapsed}s</Text>}
      {idle && <Text dimColor>  …</Text>}
    </Box>
  );
}
