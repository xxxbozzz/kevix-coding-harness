// Composer — multi-line input with cursor movement, Ctrl+A/E, paste
import { useState } from "react";
import { Box, Text, useInput } from "ink";

interface ComposerProps {
  onSubmit: (text: string) => void;
  running: boolean;
  history?: string[];
  mode?: string;
}

export function Composer({ onSubmit, running, history = [], mode = "chat" }: ComposerProps) {
  const [lines, setLines] = useState<string[]>([""]);
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Flatten to single string for submission
  const getText = () => lines.join("\n").trim();

  // Insert text at cursor position. Handles paste and multi-line input in one
  // state update so cursor math does not race React's async updates.
  const insertText = (text: string) => {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const pieces = normalized.split("\n");
    const next = lines.map((l) => l);
    const currentLine = next[cursor.row] ?? "";
    const before = currentLine.slice(0, cursor.col);
    const after = currentLine.slice(cursor.col);

    if (pieces.length === 1) {
      next[cursor.row] = before + pieces[0] + after;
      setLines(next);
      setCursor({ row: cursor.row, col: cursor.col + pieces[0]!.length });
      return;
    }

    const replacement = [
      before + pieces[0],
      ...pieces.slice(1, -1),
      pieces[pieces.length - 1] + after,
    ];
    next.splice(cursor.row, 1, ...replacement);
    setLines(next);
    setCursor({
      row: cursor.row + replacement.length - 1,
      col: pieces[pieces.length - 1]!.length,
    });
  };

  // Delete before cursor
  const deleteBefore = () => {
    setLines((prev) => {
      const next = prev.map((l) => l);
      if (cursor.col > 0) {
        const line = next[cursor.row]!;
        next[cursor.row] = line.slice(0, cursor.col - 1) + line.slice(cursor.col);
        setCursor((c) => ({ ...c, col: c.col - 1 }));
      } else if (cursor.row > 0) {
        // Merge with previous line
        const prevLine = next[cursor.row - 1]!;
        const curLine = next[cursor.row]!;
        const prevLen = prevLine.length;
        next.splice(cursor.row, 1);
        next[cursor.row - 1] = prevLine + curLine;
        setCursor({ row: cursor.row - 1, col: prevLen });
      }
      return next;
    });
  };

  useInput((val, key) => {
    if (running) return;

    const isReturn = key.return || val === "\r" || val === "\n";
    const text = getText();

    // History: up/down in history
    if (key.upArrow && history.length > 0) {
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      const h = history[history.length - 1 - idx]!;
      setLines(h.split("\n"));
      setCursor({ row: h.split("\n").length - 1, col: h.split("\n").slice(-1)[0]!.length });
      return;
    }
    if (key.downArrow && historyIdx >= 0) {
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      if (idx === -1) { setLines([""]); setCursor({ row: 0, col: 0 }); }
      else { const h = history[history.length - 1 - idx]!; setLines(h.split("\n")); setCursor({ row: h.split("\n").length - 1, col: h.split("\n").slice(-1)[0]!.length }); }
      return;
    }

    // Enter for newline (Shift+Enter or Ctrl+Enter)
    if (isReturn && (key.shift || key.ctrl)) {
      insertText("\n");
      return;
    }

    // Submit
    if (isReturn && text) {
      onSubmit(text);
      setLines([""]);
      setCursor({ row: 0, col: 0 });
      setHistoryIdx(-1);
      return;
    }

    if (isReturn && !text) return; // ignore empty submits

    // Cursor movement
    if (key.leftArrow) {
      if (cursor.col > 0) { setCursor((c) => ({ ...c, col: c.col - 1 })); }
      else if (cursor.row > 0) { setCursor({ row: cursor.row - 1, col: lines[cursor.row - 1]!.length }); }
      return;
    }
    if (key.rightArrow) {
      const curLine = lines[cursor.row]!;
      if (cursor.col < curLine.length) { setCursor((c) => ({ ...c, col: c.col + 1 })); }
      else if (cursor.row < lines.length - 1) { setCursor({ row: cursor.row + 1, col: 0 }); }
      return;
    }
    // Ctrl+A: start of line
    if (key.ctrl && (val === "a" || val === "A")) { setCursor((c) => ({ ...c, col: 0 })); return; }
    // Ctrl+E: end of line
    if (key.ctrl && (val === "e" || val === "E")) { setCursor((c) => ({ ...c, col: lines[c.row]!.length })); return; }

    // Backspace / Delete
    if (key.backspace || key.delete) { deleteBefore(); return; }

    // Paste: multi-char val means paste or IME input
    if (val.length > 1) {
      const normalized = val.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const trailingSubmit = normalized.endsWith("\n");
      const body = trailingSubmit ? normalized.slice(0, -1) : normalized;
      const isSingleLine = !body.includes("\n");

      if (trailingSubmit && isSingleLine) {
        const line = lines[cursor.row] ?? "";
        const submitted = [
          ...lines.slice(0, cursor.row),
          line.slice(0, cursor.col) + body + line.slice(cursor.col),
          ...lines.slice(cursor.row + 1),
        ].join("\n").trim();
        if (submitted) {
          onSubmit(submitted);
          setLines([""]);
          setCursor({ row: 0, col: 0 });
          setHistoryIdx(-1);
        }
        return;
      }

      insertText(val);
      return;
    }

    // Normal character input
    if (val && !key.ctrl && !key.meta) {
      insertText(val);
    }
  });

  return (
    <Box flexDirection="column">
      {historyIdx >= 0 && <Text dimColor>(history)</Text>}
      {lines.map((line, i) => (
        <Box key={i}>
          {i === 0 ? <Text><Text color="cyan">kevix</Text><Text dimColor>/{mode}</Text><Text color="cyan"> › </Text></Text> : <Text>      </Text>}
          {i === cursor.row ? (
            <Text>
              {line.slice(0, cursor.col)}
              <Text inverse>{line[cursor.col] || " "}</Text>
              {line.slice(cursor.col + 1)}
            </Text>
          ) : (
            <Text dimColor>{line || " "}</Text>
          )}
        </Box>
      ))}
      {!running && <Text dimColor>Shift+Enter newline  ↑↓ history  Ctrl+A/E  /commands</Text>}
    </Box>
  );
}
