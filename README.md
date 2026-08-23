# 🎨 Pi TUI Status Beautifier

A premium status bar beautifier extension for the Pi Terminal TUI. Instantly transforms boring status lines into brand-inspired themes and clean layouts.

## 🚀 Installation & Usage (Recommended)

Since this package is published on GitHub, you can install it instantly in the Pi TUI command environment using the following single line:

```bash
pi install git:github.com/3ZEROS12/pi-tui-status-beautifier
```

### Enable/Disable Styles
Once installed, open the Pi TUI terminal and run the dynamic interactive switch command:
```bash
/beautify
```
This renders a live selectable menu to instantly toggle between brand themes (`Cupertino`, `OpenAI`, `Claude`, `Microsoft Fluent`, `Material`) and layout styles (`Minimal`, `Glass`, `Glow badge`, `Matrix frame`, or `Default/Off`).

---

## 🎨 Layout Themes

* **Minimal (Default)**: `wechat ❯ ●` | `plan ❯ ● (2)`
* **Glass (毛玻璃)**: `▕ wechat ● ▏`
* **Glow Badge**: `wechat [ ● ]`
* **Matrix (机架双线框)**: `wechat ⦗ ● ⦘`

## 🍎 Tech & Brand Themes

* **Mac Cupertino (`apple`)**: Minimal vertical divider with native traffic-light state dots.
* **ChatGPT (`openai`)**: Star/spirograph symbol `❂` wrapping plugin indicators in OpenAI Cyan.
* **Claude Humanist (`anthropic`)**: Artful 4-corner Claude star `✦` styling.
* **Fluent Microsoft (`microsoft`)**: Flat terminal tile layout using Microsoft Fluent block `⊞`.
* **Material Google (`google`)**: Google multi-color letters rendering index name values.

---

## 🛠️ Contribution & Development
The core logic resides in `extensions/tui-status-beautifier.ts`. All status mapping is completely memory-cached to eliminate Paint Loop I/O bottlenecks.
