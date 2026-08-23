# pi-tui-status-beautifier 🎨

Premium layout & brand-inspired status bar beautifier for the **Pi coding agent terminal UI (TUI)**. 

Intercepts raw status updates and renders them with beautiful visual aesthetics including Apple, OpenAI, Anthropic, Google, and Microsoft UI languages, alongside high-end layouts like Glass, Glow, and Retro Matrix.

---

## 🚀 Installation & Usage

Inside your Pi runtime console, install the package using your preferred source:

### Option A: Install from npm (Recommended)
```bash
pi install npm:pi-tui-status-beautifier
```

### Option B: Install from Git (GitHub)
```bash
pi install git:github.com/YOUR_GIT_USER/pi-tui-status-beautifier
```

---

## 🎮 How to Switch Styles

Type the interactive slash-command directly in the Pi TUI prompt:

```bash
/beautify
```

A selection menu will appear in the TUI, allowing you to choose your layout or brand theme. Selected options are instantly redrawn and persisted to your local settings file.

---

## ✨ Features & Styles Showcase

### 1. Minimal & Layout Series
* **minimal** (Default): `name ❯ ●` — Millennial Minimalist, clean and noise-free.
* **glass**: `▕ name ● ▏` — Charm cut-glass badge brackets.
* **glow**: `name [ ● ]` — Bold inverse breathing capsules.
* **matrix**: `name ⦗ ● | 2 ⦘` — Rack-mount retro computing frames.

### 2. High-End Tech Brand Series
* **apple**: `name  │  ●` — Cupertino Mac Menu Bar aesthetic.
* **openai**: `❂ name [2]` — Star Spirograph indicating agent states.
* **anthropic**: `name ✦ ❖ 2` — Humanist Claude star alignment.
* **microsoft**: `⊞ [name] ●` — Direct square Fluent tiled compartments.
* **google**: `n-a-m-e ➔ ●` — Material playful multi-colored letter typography.

### 🔒 Resilient Architecture & Performance
* **Zero Paint Loop I/O Overhead**: Disk files are read exactly once on start-up. Runtime style switching uses dynamic memory caching, leaving the paint pipeline purely synchronous.
* **Memory Leak Protection**: Auto-flushes stale widgets from replaced sessions.
* **Type-Safe Sandbox**: Graceful raw status fallbacks in headless mode or colorless terms to ensure the terminal shell never crashes.

---

## License

MIT © Jason
