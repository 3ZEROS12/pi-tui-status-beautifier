# pi-tui-status-beautifier

Minimalist status bar formatter & AI-customizable layout engine for the [Pi](https://github.com/earendil-works/pi-coding-agent) terminal TUI.

Automatically normalizes verbose extension status strings (`plannotator`, `pi-mcp-adapter`, `pi-subagents`, `toolflow`, etc.) into clean, visually aligned 10-column status badges with zero runtime disk I/O overhead.

## Installation

```bash
pi install npm:pi-tui-status-beautifier
```

## Usage

Run `/beautify` inside Pi to switch status bar layouts or generate a custom style with your AI agent:

- **`custom` — [AI Prompt Recipe]**: Pre-fills a structured prompt into your terminal editor so your coding agent can inspect `tui-status-beautifier.ts` and craft a bespoke status bar layout tailored to your exact aesthetic.
- **`minimal`**: Clean chevron indicator (`name       ❯ ● (2)`)
- **`glass`**: Framed capsule badge (`▕ name       ● (2) ▏`)
- **`glow`**: High-contrast inverse pill (`name       [ ● 2 ]`)
- **`off`**: Pass through raw status strings untouched

## Engineering Highlights

- **Unicode & Surrogate-Pair Safe**: Full `codePointAt(0)` visual cell width measurement across CJK ideographs, Hiragana/Katakana, Hangul, emojis, and zero-width joiners (`0x200d`, `0xfe0f`).
- **Zero Render-Loop Disk I/O**: Reads `~/.pi/agent/settings.json` once at startup and performs dirty-checked in-memory rendering; atomic temp-file rename (`writeFileSync` + `renameSync`) only when switching styles via `/beautify`.
- **ReDoS-Safe ANSI Stripping**: Fast-path bypass when no ESC/CSI bytes are present.

## License

MIT
