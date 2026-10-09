# pi-tui-status-beautifier

> **专为 Pi TUI 打造的极简状态栏规范化引擎与 AI 可定制排版扩展**  
> 统一碎片化、参差不齐的插件状态字符串，呈现规整、高颜值的终端排版，运行时渲染循环 0 磁盘 I/O 开销。

[![npm version](https://img.shields.io/npm/v/pi-tui-status-beautifier?color=blue)](https://www.npmjs.com/package/pi-tui-status-beautifier)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Built for Pi](https://img.shields.io/badge/Built%20for-Pi%20Coding%20Agent-orange)](https://github.com/earendil-works/pi-coding-agent)
[![Tests](https://img.shields.io/badge/Tests-18%2F18%20Pass%20(100%25)-brightgreen)](extensions/tui-status-beautifier.spec.ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](tsconfig.json)

[English](./README.md) | **简体中文**

```text
  ┌─ 原生底栏（长短不一、缺乏统一规范） ───────────────────────────────────────────────────────────────┐
  │  plannotator: 🟢 3 tasks    pi-mcp-adapter: [connected]    toolflow: active (2/5)    anchor: 3 items │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
  ┌─ pi-tui-status-beautifier（规整对齐、自适应折叠、地道终端质感） ────────────────────────────────────┐
  │  plan ❯ ◆ 3    mcp ❯ ● ready    toolflow ❯ ⌬ 2/5    anchor ❯ ⌖ 3    chrome ❯ ● connected            │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 现实工程痛点

随着 Pi 插件生态日益丰富，开发者在日常会话中常安装多个能力扩展（如 `plannotator`、`pi-mcp-adapter`、`toolflow`、`pi-anchor`、`pi-control-chrome`、`pi-lingual` 等）。底栏状态逐渐暴露出以下问题：

1. **命名风格与状态语法缺乏规范**：各插件作者独立编写状态文本。有的带长包名前缀（`pi-mcp-adapter:`），有的用括号包裹数值（`[2]`），有的输出原生 emoji，长短不一的字符在终端底部不断拉扯视线。
2. **窄屏终端被动折行溢出**：在分屏（tmux、WezTerm 或窗口列宽 `< 80`）环境下，冗长的状态字符串容易被强制折行，把编辑输入框向上挤压，破坏敲代码的心流。
3. **Unicode、CJK 与零宽字符错位**：多字节宽字符、Emoji 与零宽连接符（ZWJ）常使基于普通字符串长度的格式化工具计算失准，导致终端光标抖动和排版错位。
4. **渲染循环的磁盘 I/O 争用**：在终端高频重绘动画中重复读取配置文件，容易引发磁盘 I/O 开销与终端卡顿。

`pi-tui-status-beautifier` 作为纯净的中间层运行。它拦截 `ctx.ui.setStatus` 调用，安全清洗 ANSI 控制序列与多字节代理对，将运行状态映射为结构规整的微型徽章，并在水平列宽紧张时智能折叠闲置插件。

---

## 核心预设画廊与样式对比

键入 `/beautify` 即可实时交互切换不同风格：

```text
  1. stream（默认极简流式）
     chrome ❯ ● ready    toolflow ❯ ⌬ 2/5    anchor ❯ ⌖ 3    plan ❯ ◆ 1

  2. powerline（尖角分界与几何徽记）
     chrome ‹◆ ready›    toolflow ‹◈ 2/5›    anchor ‹⌖ 3›    plan ‹◆ 1›

  3. matrix（点阵微框与星标）
     chrome ⦗✦ ready⦘    toolflow ⦗✧ 2/5⦘    anchor ⦗⌖ 3⦘    plan ⦗✦ 1⦘

  4. glow（高对比度反色胶囊）
     chrome [ ● ready ]  toolflow [ ⌬ 2/5 ]  anchor [ ⌖ 3 ]  plan [ ◆ 1 ]

  5. minimal（10 列等宽排版流）
     chrome     ❯ ● ready    toolflow   ❯ ⌬ 2/5    anchor     ❯ ⌖ 3

  6. custom（与 AI 结对定制）
     通过自然语言描述，由 Coding Agent 生成专属的分隔符、边框字符与状态图腾。
```

---

## 核心架构与物理机制

### 1. 双层格式化作用域（Dual-Scope Architecture）
通过 `/beautify` 可以选择两种控制作用域：
* **`status-only`（默认推荐模式）**：仅规范化插件的 `ctx.ui.setStatus` 徽章。完整保留 Pi 原生的 Git 分支、工作目录、上下文使用百分比、Token 遥测数据（`↑1.2k ↓3.4k R8.9k`）以及深度思考指示（`• high`）。
* **`full-footer`（深度一体化底栏）**：重构整个终端底栏为两行式布局：
  * **第一行**：左侧展示项目目录与 Git 分支，右侧展示上下文缓存命中率、Token 消耗、活跃模型及思考级别。
  * **第二行**：自适应排列全部插件状态徽章。

### 2. 窄屏自适应折叠守卫（< 80 列分屏优化）
当终端被水平分割导致宽度紧缩时，排版求解器将插件状态分为两级优先级：
* **高优先级（活跃/报警/错误）**：包含 `running`、`working`、`starting`、`error`、`failed`、`pause` 的徽章始终完整呈现。
* **低优先级（闲置/就绪/完成）**：当整行宽度超出物理列宽时，就绪与闲置状态自动折叠为紧凑的计数摘要：
  ```text
  toolflow ❯ ⌬ running (2/5)    plan ❯ ▲ error    (+3 idle)
  ```

### 3. 插件语义映射与动态微微旋转器（Micro-Spinners）
引擎自动剥离包体命名冗余后缀（`-extension`、`-plugin`、`-adapter`、`-slash-text`），为常见生态工具建立语义符号映射：
* `plannotator` ➔ `plan`（重点符 `◆`）
* `pi-mcp-adapter` ➔ `mcp`（圆点符 `●`）
* `pi-control-chrome` ➔ `chrome`（圆点符 `●`）
* `pi-anchor` ➔ `anchor`（锚点符 `⌖`）
* `toolflow` ➔ `toolflow`（流向符 `⌬`）
* 执行中的任务（包含 `running`、`working`、`...`）自动激活 300ms 动态旋转器（`◐`、`◓`、`◑`、`◒`）。

### 4. 零代码 AI 结对定制（`/beautify custom`）
想要契合特定审美的终端底栏：
1. 运行 `/beautify` 并选择 `custom`；
2. 输入自然语言风格描述（例如：“北欧冷色调点阵”、“复古绿色终端微框”）；
3. 扩展自动构造结构化 Prompt 发送给当前 Coding Agent；
4. Agent 通过 `ask_user_question` 提供 **3 套 ASCII 视觉样机**供选择，并将选中的样式写入 `./.pi/settings.json`。

---

## 底层硬核工程保证

### Unicode UAX #11 视觉列宽与代理对安全
普通基于 `string.length` 的字符计数会在处理中文、日文平假名、Emoji 或代理对时失准。`pi-tui-status-beautifier` 内置独立的 `codePointAt(0)` 扫描器：
* 精确测量东亚宽字符（2 列）、半角 ASCII（1 列）与零宽控制序列（0 列）；
* 过滤零宽连接符（ZWJ `0x200d`）、Emoji 变体选择符（`0xfe0f`, `0xfe0e`）与组合附加符号（`0x0300..0x036f`）；
* 截断长名称时采用 `sliceToVisualWidth`，避免在多字节代理对中间切断字符导致乱码。

### 渲染循环 0 磁盘 I/O 与 Dirty-Checking 内存缓存
* **单次配置装载**：会话启动时将配置加载至内存，后续 TUI 高频渲染循环中 **0 次调用同步文件读取（`fs.readFileSync`）**；
* **徽章状态 Dirty-Checking**：按 `${key}:${currentStyle}` 缓存徽章渲染结果。如果扩展推送相同状态，跳过字符串构造与重绘；
* **原子化配置持久化**：使用临时文件重命名（`writeFileSync(temp)` + `renameSync(temp, target)`）写入配置，避免中断写入造成文件损坏。

### 零残留物理还原（`off`）
选择 `off` 时，立即还原所有插件的原始状态字符串，卸载 Footer 钩子，并从 `settings.json` 中物理删除 `beautifier` 键名，不留置冗余配置项。

---

## 配置规范

配置项保存在 `./.pi/settings.json`（项目级，优先级更高）或 `~/.pi/agent/settings.json`（全局）：

```json
{
  "beautifier": {
    "style": "stream",
    "fullFooter": false
  }
}
```

### 自定义样式 Schema（`style: "custom"`）
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

## 安装与快速上手

### 作为 Pi 扩展安装
```bash
# 推荐：直接通过 npm 安装官方包
pi install npm:pi-tui-status-beautifier

# 或从 GitHub 安装
pi install git:github.com/3ZEROS12/pi-tui-status-beautifier
```

### 交互命令
在任意 Pi 会话中输入 `/beautify` 呼出交互选择向导：
```text
/beautify
```

### 本地开发与单元测试
```bash
git clone https://github.com/3ZEROS12/pi-tui-status-beautifier.git
cd pi-tui-status-beautifier
npm install
npm test            # 18/18 单元测试全部通过
npm run lint        # ESLint 0 警告
```

---

## 许可证

MIT © [Jason](https://github.com/3ZEROS12)
