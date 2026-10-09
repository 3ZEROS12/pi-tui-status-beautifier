# pi-tui-status-beautifier

> **Minimalist status bar formatter & AI-customizable layout engine for Pi TUI**  
> Normalizes verbose, mismatched extension status badges into clean, coherent typography with zero runtime render-loop disk I/O.

[![npm version](https://img.shields.io/npm/v/pi-tui-status-beautifier?color=blue)](https://www.npmjs.com/package/pi-tui-status-beautifier)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built for Pi](https://img.shields.io/badge/Built%20for-Pi%20Coding%20Agent-orange)](https://github.com/earendil-works/pi-coding-agent)
[![Tests](https://img.shields.io/badge/Tests-18%2F18%20Pass%20(100%25)-brightgreen)](extensions/tui-status-beautifier.spec.ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](tsconfig.json)

**English** | [简体中文](./README_zh.md)

```text
  ┌─ Native Status Bar (Fragmented & Cluttered) ────────────────────────────────────────────────────────┐
  │  plannotator: 🟢 3 tasks    pi-mcp-adapter: [connected]    toolflow: active (2/5)    anchor: 3 items │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
  ┌─ pi-tui-status-beautifier (Normalized, Coherent & Adaptive) ────────────────────────────────────────┐
  │  plan ❯ ◆ 3    mcp ❯ ● ready    toolflow ❯ ⌬ 2/5    anchor ❯ ⌖ 3    chrome ❯ ● connected            │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Why pi-tui-status-beautifier?

As the Pi terminal ecosystem grows, developers routinely install multiple extensions (`plannotator`, `pi-mcp-adapter`, `toolflow`, `pi-anchor`, `pi-control-chrome`, `pi-lingual`). Over time, the footer status bar deteriorates into visual chaos:

1. **Inconsistent Syntax & Naming**: Every extension authors status strings independently. Some prefix long package names (`pi-mcp-adapter:`), some wrap counts in brackets (`[2]`), while others dump raw emojis or status sentences. The lack of standard metrics distracts focus during coding flow.
2. **Narrow Terminal Line Wrapping**: In split-pane layouts (tmux, WezTerm, iTerm2 panes `< 80` columns), long status strings wrap onto multiple lines or tear off the edge of the screen, pushing input prompts up and down.
3. **Surrogate-Pair & CJK Misalignments**: Emojis, East Asian Wide (CJK) characters, and zero-width joiners (ZWJ) trigger width calculation discrepancies in naive string formatters, leading to flickering and cursor misalignment.
4. **Render-Loop Disk Latency**: Reading configuration files inside high-frequency TUI animation loops introduces I/O thrashing and terminal sluggishness.

`pi-tui-status-beautifier` acts as a non-intrusive normalization layer. It intercepts `ctx.ui.setStatus` calls, sanitizes ANSI and surrogate characters, dynamically maps state signals into uniform badges, and folds idle items when horizontal space tightens.

---

## Preset Gallery & Visual Themes

Switch styles interactively with `/beautify`:

```text
  1. stream (Default Minimalist Stream)
     chrome ❯ ● ready    toolflow ❯ ⌬ 2/5    anchor ❯ ⌖ 3    plan ❯ ◆ 1

  2. powerline (Angled Brackets & Distinct Glyphs)
     chrome ‹◆ ready›    toolflow ‹◈ 2/5›    anchor ‹⌖ 3›    plan ‹◆ 1›

  3. matrix (Dot-Matrix Framing & Star Accents)
     chrome ⦗✦ ready⦘    toolflow ⦗✧ 2/5⦘    anchor ⦗⌖ 3⦘    plan ⦗✦ 1⦘

  4. glow (High-Contrast Inverse Pill Badges)
     chrome [ ● ready ]  toolflow [ ⌬ 2/5 ]  anchor [ ⌖ 3 ]  plan [ ◆ 1 ]

  5. minimal (Fixed 10-Column Aligned Stream)
     chrome     ❯ ● ready    toolflow   ❯ ⌬ 2/5    anchor     ❯ ⌖ 3

  6. custom (AI-Assisted Co-Design)
     Generates bespoke separators, framing glyphs, and status indicators matching your aesthetic.
```

---

## Core Capabilities & Architectural Design

### 1. Dual-Scope Formatting Architecture
When configuring `/beautify`, you choose between two execution scopes:
* **`status-only` (Default & Recommended)**: Only hooks `ctx.ui.setStatus` badges. Leaves Pi's native Git branch, working directory, context window percentages, token telemetry (`↑1.2k ↓3.4k R8.9k`), and thinking levels (`• high`) 100% native and untouched.
* **`full-footer` (Integrated Geek Footer)**: Replaces the entire bottom bar with a unified two-line layout:
  * **Line 1**: Folder & Git branch on the left; token metrics, context cache hit rates, model identifier, and reasoning level on the right.
  * **Line 2**: Normalized extension status badges with automatic column budgeting.

### 2. Adaptive Folding for Narrow Terminals (< 80 Cols)
In compact split panes, status items risk overflowing terminal boundaries. `pi-tui-status-beautifier` partitions active extensions into two priority tiers:
* **High-Priority (Active/Warning/Error)**: Badges displaying `running`, `working`, `starting`, `error`, `failed`, or `pause` are always preserved at full fidelity.
* **Low-Priority (Idle/Ready/Ok)**: When line width exceeds maximum available columns, idle badges are automatically condensed into a compact indicator:
  ```text
  toolflow ❯ ⌬ running (2/5)    plan ❯ ▲ error    (+3 idle)
  ```

### 3. Dedicated Extension Identity & Micro-Spinners
The engine strips internal package naming suffixes (`-extension`, `-plugin`, `-adapter`, `-slash-text`) and maps established ecosystem tools to clean semantic identities:
* `plannotator` ➔ `plan` (accent glyph `◆`)
* `pi-mcp-adapter` ➔ `mcp` (status dot `●`)
* `pi-control-chrome` ➔ `chrome` (status dot `●`)
* `pi-anchor` ➔ `anchor` (anchor glyph `⌖`)
* `toolflow` ➔ `toolflow` (flow glyph `⌬`)
* `pi-lingual` ➔ `lingual` (exchange glyph `⇄`)
* In-progress tasks (`running`, `working`, `...`) automatically trigger a 300ms terminal micro-spinner (`◐`, `◓`, `◑`, `◒`).

### 4. Zero-Ceremony AI Co-Design (`/beautify custom`)
Want a unique terminal aesthetic without manually editing code?
1. Run `/beautify` and select `custom`.
2. Enter your desired aesthetic in plain text (e.g. *"Cyberpunk neon dots"*, *"Nordic minimal pastels"*, *"Subtle dashed brackets"*).
3. The beautifier dispatches a structured prompt recipe to your active Coding Agent.
4. Your agent presents **3 distinct ASCII visual mockups** via interactive selection and writes the chosen configuration directly to `./.pi/settings.json`.

---

## Under-The-Hood Engineering

### Unicode UAX #11 & Surrogate-Pair Safety
Terminal character counting based on `string.length` breaks when encountering emojis, Chinese/Japanese characters, or surrogate pairs. `pi-tui-status-beautifier` implements a standalone `codePointAt(0)` scanner (`src/extensions/tui-status-beautifier.ts`):
* Accurately measures East Asian Wide (2 visual columns), ASCII (1 column), and zero-width markers (0 columns).
* Explicitly ignores Zero-Width Joiners (`0x200d`), Emoji Variation Selectors (`0xfe0f`, `0xfe0e`), and combining diacritics (`0x0300..0x036f`).
* Implements `sliceToVisualWidth` to truncate long identifiers without severing multibyte surrogate pairs.

### Zero Render-Loop Disk I/O & Dirty-Checking
* **Cached Memory Reads**: Configuration is loaded into memory at startup. Normal TUI redraw loops perform **zero synchronous file reads (`fs.readFileSync`)**.
* **State Dirty-Checking**: Renders are cached per badge (`${key}:${currentStyle}`). If an extension sends an identical status string, formatting is skipped, avoiding redundant string allocations.
* **Atomic Settings Writes**: Style updates via `/beautify` use atomic file replacement (`writeFileSync(temp)` + `renameSync(temp, target)`), preventing corrupt settings files if the process is terminated mid-write.

### Zero-Trace Physical Cleanup (`off`)
Selecting `off` cleanly restores all original unformatted status strings to `ctx.ui.setStatus`, unhooks the footer, and deletes the `beautifier` block from `settings.json`. It leaves zero orphaned configuration schema behind.

---

## Configuration Reference

Settings reside under `"beautifier"` in `./.pi/settings.json` (project-level) or `~/.pi/agent/settings.json` (global):

```json
{
  "beautifier": {
    "style": "stream",
    "fullFooter": false
  }
}
```

### Custom Style Schema (`style: "custom"`)
```json
{
  "beautifier": {
    "style": "custom",
    "fullFooter": false,
    "custom": {
      "prefix": "",
      "suffix": "",
      "separator": " ❯ ",
      "brackets": ["⦗", "⦘"],
      "inverse": false,
      "padName": false,
      "glyphs": {
        "success": "●",
        "warning": "◌",
        "error": "▲",
        "accent": "◆"
      }
    }
  }
}
```

---

## Installation & Usage

### Install as a Pi Extension
```bash
# Recommended: Install from npm
pi install npm:pi-tui-status-beautifier

# Or install from GitHub
pi install git:github.com/3ZEROS12/pi-tui-status-beautifier
```

### Interactive Command
Type `/beautify` inside any active Pi session to open the interactive style selector:
```text
/beautify
```

### Development & Testing
```bash
git clone https://github.com/3ZEROS12/pi-tui-status-beautifier.git
cd pi-tui-status-beautifier
npm install
npm test            # 18/18 Vitest unit tests pass
npm run lint        # Zero ESLint warnings
```

---

## Author's Note

The reason I created `pi-tui-status-beautifier` comes from a simple aesthetic frustration in daily terminal pairing: visual noise.

As I installed multiple extensions for Pi (`pi-mcp-adapter`, `plannotator`, `toolflow`, `pi-anchor`, `pi-lingual`), the status bar quickly deteriorated into a chaotic billboard. Every extension author used their own punctuation, raw emojis, and arbitrary string widths. In split-pane tmux or compact terminal windows, lines tore, right-side borders wrapped onto new rows, and the screen constantly flickered.

When I looked into existing status bar plugins, many took a sledgehammer approach: completely replacing Pi's native footer via `ctx.ui.setFooter`. In doing so, they wiped out essential platform metrics—token usage, cache read rates, thinking levels, and git branches. Even worse, some plugins read configuration files synchronously inside the animation redraw loop, causing typing sluggishness.

I built this beautifier around three strict constraints:
1. Non-destructive scoping: never hijack host platform telemetry; normalize only the extension status badges;
2. Zero render-loop disk I/O: cache settings in memory and skip duplicate renders;
3. Zero-trace revert: turning it off physically deletes the config block (`delete config.beautifier`), leaving zero psychological or schema clutter.

A good status bar should be quiet, balanced, and invisible until you need it.

---

## License

MIT © [Jason](https://github.com/3ZEROS12)
