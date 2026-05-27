#!/usr/bin/env python3
"""Kevix Coding Harness — Terminal UI Mockup (Rich-based, Blue Theme)"""

from rich.console import Console
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.live import Live
from rich import box
from rich.columns import Columns
import time

# ── Blue-centric palette ─────────────────────────────────────────────
BLUE     = "bright_blue"
CYAN     = "cyan"
DIM      = "dim"
GREEN    = "green"
YELLOW   = "yellow"
MAGENTA  = "magenta"
WHITE    = "white"
BG       = "on #0a1628"

# ── Live data ────────────────────────────────────────────────────────
DATA = {
    "mode": "auto", "model": "deepseek-v4-pro",
    "phases": "worker → probe_plan → probe_verify",
    "cache": "99.84%", "gates": "11",
    "tradeoff": "B — upgrade to probe",
    "tokens": "134,617,888", "cost": "$0.4821",
    "elapsed": "00:02:37", "progress": 84,
}

LOGS = [
    ("12:41:09", "controller",        CYAN,     "directive ready"),
    ("12:41:09", "worker",            CYAN,     "tool loop running"),
    ("12:41:12", "gate",              YELLOW,   "risk detected (r:0.72) — requires tradeoff"),
    ("12:41:12", "tradeoff_required", MAGENTA,  "choose B: upgrade to probe (expected Δ success +18.7%)"),
    ("12:41:14", "probe_plan",        GREEN,    "plan generated (steps: 7)"),
    ("12:41:16", "probe_verify",      GREEN,    "passed (confidence: 0.93)"),
    ("12:41:16", "controller",        CYAN,     "advancing to next phase"),
]

# Pixel whale — kevix logo
PIXEL_WHALE = [
    "            ▄           ",
    "          ▄ █ ▄         ",
    "        ▄▄█████▄▄       ",
    "      ▄███████████▄     ",
    "  ▄▄    ███████████████ ",
    "  ███▄▄▄██████  ███████ ",
    "  ▀███████████████████▀ ",
    "    ▀▀█████████████▀▀   ",
]

# ── Panel builder helpers ────────────────────────────────────────────

def blue_panel(content, title="", **kw) -> Panel:
    return Panel(content, title=title, border_style=BLUE, box=box.ROUNDED, **kw)

def icon_label(text: str) -> Text:
    """Small dim label above a value"""
    return Text(text, style=DIM)


# ── Sections ─────────────────────────────────────────────────────────

def build_header() -> Panel:
    art = Text()
    for line in PIXEL_WHALE:
        art.append(line + "\n")
    art.stylize(CYAN)

    title = Text()
    title.append("Kevix Coding Harness\n", style=f"bold {CYAN}")
    title.append("AI-native coding harness\n", style=f"{DIM} italic")
    title.append("for autonomous engineering\n\n", style=f"{DIM} italic")
    title.append("> ", style=CYAN)
    title.append("kevix run\n", style=WHITE)
    title.append("▔▔▔▔▔▔▔▔▔▔▔", style=f"{DIM}")

    t = Table(show_header=False, box=None, padding=(0, 6))
    t.add_column(width=26)
    t.add_column()
    t.add_row(art, title)
    return Panel(t, box=None)


def build_dashboard() -> Panel:
    """2x3 metric grid — left: config, right: runtime"""
    items = [
        ("\U0001f680  Mode",        DATA["mode"],      CYAN),
        ("\U0001f4e6  Model",       DATA["model"],     CYAN),
        ("\U0001f4c8  Phase",       DATA["phases"],    CYAN),
        ("\U0001f5c4  Cache",       DATA["cache"],     CYAN),
        ("\U0001f6e1  Gates",       DATA["gates"],     CYAN),
        ("⚖️   Tradeoff",            DATA["tradeoff"],  CYAN),
    ]

    grid = Table(show_header=False, box=None, padding=(0, 4), expand=True)
    grid.add_column(width=28)
    grid.add_column(width=30)
    grid.add_column(width=28)
    grid.add_column(width=30)

    rows = []
    for i in range(0, len(items), 2):
        lk, lv, lc = items[i]
        rk, rv, rc = items[i + 1] if i + 1 < len(items) else ("", "", DIM)
        rows.append([Text(lk, style=DIM), Text(lv, style=lc), Text(rk, style=DIM), Text(rv, style=rc)])

    for row in rows:
        grid.add_row(*row)

    return blue_panel(grid, title="[cyan]Status Dashboard[/cyan]")


def build_logs() -> Panel:
    t = Table(show_header=True, box=None, padding=(0, 2), expand=True)
    t.add_column("Time", width=10, style=DIM)
    t.add_column("Tag",  width=22)
    t.add_column("Message", style=WHITE)

    for ts, tag, color, msg in LOGS:
        t.add_row(ts, f"[{color}][{tag}][/{color}]", msg)

    return blue_panel(t, title="[cyan]Live Log[/cyan]")


def build_status_bar() -> Panel:
    bar = Text()
    bar.append("> kevix status", style=f"{CYAN} bold")
    bar.append("  │  ", style=DIM)
    bar.append(f"Tokens: ", style=DIM)
    bar.append(DATA["tokens"], style=CYAN)
    bar.append("  │  ", style=DIM)
    bar.append(f"Cost: ", style=DIM)
    bar.append(DATA["cost"], style=CYAN)
    bar.append("  │  ", style=DIM)
    bar.append(f"Elapsed: ", style=DIM)
    bar.append(DATA["elapsed"], style=CYAN)
    bar.append("  │  ", style=DIM)

    p = DATA["progress"]
    filled = int(p / 5)
    bar.append("█" * filled, style=CYAN)
    bar.append("▒" * (20 - filled), style=DIM)
    bar.append(f" {p}%", style=f"{CYAN} bold")

    return blue_panel(bar)


def build_input() -> Text:
    inp = Text()
    inp.append("\n> kevix ", style=f"{CYAN} bold")
    inp.append("_", style=f"blink {CYAN}")
    return inp


# ── Layout ───────────────────────────────────────────────────────────

def build_layout() -> Layout:
    root = Layout()
    root.split(
        Layout(name="header",     size=13),
        Layout(name="dashboard",  size=7),
        Layout(name="logs"),
        Layout(name="status_bar", size=3),
        Layout(name="input",      size=1),
    )
    return root


def main():
    console = Console()
    layout = build_layout()
    layout["header"].update(build_header())
    layout["dashboard"].update(build_dashboard())
    layout["logs"].update(build_logs())
    layout["status_bar"].update(build_status_bar())
    layout["input"].update(build_input())

    with Live(layout, console=console, refresh_per_second=4, screen=True):
        time.sleep(120)


if __name__ == "__main__":
    main()
