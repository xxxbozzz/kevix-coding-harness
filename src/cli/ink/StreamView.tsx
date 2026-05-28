// Phase-grouped stream view with ToolCard rendering
import { Box, Text } from "ink";

interface Event { type: string; text: string; ts?: number; card?: ToolCard }

export interface ToolCard {
  id: string;
  type: "read" | "write" | "edit" | "bash" | "grep" | "glob";
  title: string;
  summary: string;
  status: "running" | "done" | "blocked";
  detail?: string;
  diffSummary?: { added: number; removed: number };
  diffPreview?: string; // first 5 changed lines, colored
  durationMs?: number;
}

export function buildToolCard(
  name: string, args: string, resultContent: string, isError: boolean,
  addedLines?: number, removedLines?: number,
): ToolCard {
  const id = `${name}-${Date.now()}`;
  let file = "";
  try { const a = JSON.parse(args); file = (a.file_path || a.command || "").toString(); } catch {}

  const toolType = name as ToolCard["type"];
  // Clean label: use last path segment for files, first 2 words for commands
  let label = file;
  if (name === "bash") {
    const words = file.split(/\s+/).filter(w => w.length > 1 && !w.startsWith("-"));
    label = words.slice(0, 2).join(" ") || file.slice(-40);
  } else if (name === "write" || name === "edit" || name === "read") {
    label = file.split("/").pop() ?? file;
  }
  const title = label ? `${name}(${label.slice(-50)})` : name;

  let summary = "";
  if (name === "read") {
    const lines = resultContent.split("\n").length;
    summary = `${lines} lines`;
  } else if (name === "write" || name === "edit") {
    if (addedLines !== undefined && removedLines !== undefined) {
      summary = `Added ${addedLines}, removed ${removedLines}`;
    } else if (name === "write") {
      summary = `Wrote ${resultContent.length} bytes`;
    } else {
      summary = resultContent.slice(0, 60);
    }
    if (addedLines !== undefined && removedLines !== undefined) {
      return { id, type: toolType, title, summary, status: isError ? "blocked" : "done", detail: resultContent, diffSummary: { added: addedLines, removed: removedLines } };
    }
  } else if (name === "bash") {
    const passed = resultContent.match(/(\d+)\s+passed/)?.[1];
    const failed = resultContent.match(/(\d+)\s+failed/)?.[1];
    if (passed !== undefined) summary = `${passed} passed, ${failed ?? "0"} failed`;
    else summary = resultContent.split("\n")[0]?.slice(0, 80) ?? "";
  } else if (name === "grep") {
    const lines = resultContent.split("\n").filter(l => l.trim()).length;
    summary = lines > 0 ? `${lines} matches` : "no matches";
  } else if (name === "glob") {
    const lines = resultContent.split("\n").filter(l => l.trim()).length;
    summary = `${lines} files`;
  }

  return { id, type: toolType, title, summary: summary || resultContent.slice(0, 60), status: isError ? "blocked" : "done", detail: resultContent };
}

export function StreamView({ events }: { events: Event[] }) {
  const groups: { phase: string; items: Event[] }[] = [];
  let current: { phase: string; items: Event[] } | null = null;

  for (const e of events) {
    if (e.type === "step") {
      if (current) groups.push(current);
      current = { phase: e.text, items: [] };
    } else if (current) {
      current.items.push(e);
    } else {
      if (!current) { current = { phase: "", items: [] }; current.items.push(e); }
    }
  }
  if (current) groups.push(current);

  const recent = groups.slice(-6);

  return (
    <Box flexDirection="column" marginY={1}>
      {recent.map((g, gi) => (
        <Box key={gi} flexDirection="column" marginBottom={1}>
          {g.phase && <Text dimColor>── {g.phase} ──</Text>}

          {g.items.slice(-20).map((e, i) => {
            // ToolCards
            if (e.card) {
              const c = e.card;
              const prefix = c.status === "blocked" ? "⚠" : c.status === "running" ? "○" : "●";
              return (
                <Box key={i} flexDirection="column">
                  <Text>
                    <Text color={c.status === "blocked" ? "yellow" : "cyan"}>{prefix} </Text>
                    <Text>{c.title}</Text>
                  </Text>
                  <Text dimColor>  └ {c.summary}</Text>
                </Box>
              );
            }

            // Task input
            if (e.type === "task") return <Text key={i} color="cyan">{e.text}</Text>;
            // Done
            if (e.type === "done") return <Text key={i} color="green">{e.text}</Text>;
            // Error
            if (e.type === "error") return <Text key={i} color="red">  {e.text}</Text>;
            // Gate
            if (e.type === "gate") return <Text key={i} color="yellow">  ⚠ {e.text.replace("⚠","").trim()}</Text>;
            // Info
            if (e.type === "info") return <Text key={i} dimColor>  {e.text}</Text>;
            // Skip raw tool/text result lines
            if (e.type === "tool_result" || e.type === "tool" || e.type === "stream" || e.type === "step_done") return null;
            // Default
            return <Text key={i} dimColor>  {e.text}</Text>;
          })}
        </Box>
      ))}
    </Box>
  );
}
