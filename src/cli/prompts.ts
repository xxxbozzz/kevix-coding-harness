// CLI interactive prompts — arrow-key selection, CC-style

import * as readline from "node:readline";
import type { PEANDirective, TradeoffEvidence, TradeoffOption, TradeoffChoice } from "../types.js";

const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";
const HIDE = "\x1b[?25l";
const SHOW = "\x1b[?25h";

export interface Prompter {
  askApproval(d: PEANDirective): Promise<"approve" | "reject">;
  askTradeoff(e: TradeoffEvidence, o: TradeoffOption[]): Promise<TradeoffChoice>;
  repl(): AsyncIterable<string>;
  showPrompt(): void;
  setStatus?(text: string): void;
  clearStatus?(): void;
  close(): void;
}

/** Build a keypress selector: ↑↓ to navigate, Enter to confirm */
function select(options: { label: string; value: string }[], prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let selected = 0;

    function render() {
      // Clear previous render
      readline.moveCursor(process.stdout, 0, -(options.length + 1));
      readline.clearScreenDown(process.stdout);

      process.stdout.write(`${prompt}\n`);
      for (let i = 0; i < options.length; i++) {
        const isSelected = i === selected;
        const prefix = isSelected ? `${CYAN}❯${RESET}` : " ";
        const label = isSelected ? `${CYAN}${options[i]!.label}${RESET}` : options[i]!.label;
        process.stdout.write(`  ${prefix} ${label}\n`);
      }
    }

    process.stdin.on("keypress", (_str, key) => {
      if (key.name === "up") {
        selected = (selected - 1 + options.length) % options.length;
        render();
      } else if (key.name === "down") {
        selected = (selected + 1) % options.length;
        render();
      } else if (key.name === "return") {
        process.stdin.removeAllListeners("keypress");
        process.stdout.write(SHOW);
        rl.close();
        resolve(options[selected]!.value);
      }
    });

    process.stdin.setRawMode?.(true);
    readline.emitKeypressEvents?.(process.stdin);
    process.stdout.write(HIDE);
    render();
  });
}

export function createPrompter(): Prompter {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${DIM}kevix${RESET} ${CYAN}›${RESET} ` });

  function setStatus(text: string) {
    rl.setPrompt(`${text}\n${DIM}kevix${RESET} ${CYAN}›${RESET} `);
  }

  function clearStatus() {
    rl.setPrompt(`${DIM}kevix${RESET} ${CYAN}›${RESET} `);
  }

  return {
    async askApproval(d: PEANDirective): Promise<"approve" | "reject"> {
      rl.pause();
      process.stdout.write(`\n  ${YELLOW}⏸${RESET} Directive ready\n`);
      process.stdout.write(`  ${DIM}${d.product_intent.slice(0, 120)}...${RESET}\n`);

      const choice = await select(
        [
          { label: `Approve — continue to Worker`, value: "approve" },
          { label: `Reject — cancel task`, value: "reject" },
        ],
        `${CYAN}?${RESET} Review the directive:`
      );

      process.stdout.write(`\n  ${GREEN}✓${RESET} ${choice === "approve" ? "Approved" : "Rejected"}\n`);
      rl.resume();
      return choice as "approve" | "reject";
    },

    async askTradeoff(e: TradeoffEvidence, o: TradeoffOption[]): Promise<TradeoffChoice> {
      rl.pause();
      process.stdout.write(`\n  ${YELLOW}⚡${RESET} Risk signals: ${e.activeSignals.join(" + ")}  ${DIM}(${e.gateCount} gates, cache ${e.cacheTrend})${RESET}\n`);

      const options = o.map((opt) => ({ label: `${opt.label} — ${opt.description}`, value: opt.id }));
      const choice = await select(options, `${CYAN}?${RESET} Choose path:`);

      process.stdout.write(`\n  ${GREEN}✓${RESET} ${choice === "A" ? "Continue memory" : choice === "B" ? "Upgrade to probe" : "Pause"}\n`);
      rl.resume();
      return choice as TradeoffChoice;
    },

    repl(): AsyncIterable<string> { return rl as unknown as AsyncIterable<string>; },
    showPrompt() { rl.prompt(); },
    setStatus: (text: string) => { setStatus(text); rl.prompt(); },
    clearStatus: () => { clearStatus(); rl.prompt(); },
    close() { rl.close(); },
  };
}
