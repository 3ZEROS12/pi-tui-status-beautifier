# pi-tui-status-beautifier

面向 Pi TUI 的极简状态栏规范化引擎与可定制排版扩展。

告别混乱杂乱的终端底栏。统一扩展状态字符串，分屏自动折叠，渲染循环 0 磁盘 I/O 开销，绝不劫持系统原生遥测。

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

## 一键安装

在 Pi 终端内直接运行：

```bash
pi install npm:pi-tui-status-beautifier
```

安装即可直接生效。输入 `/beautify` 随时交互式切换预设风格。

---

## 核心价值：为什么需要它？

随着 Pi 插件生态日益丰富，开发者通常会安装多个扩展（`plannotator`、`pi-mcp-adapter`、`toolflow`、`pi-anchor`、`pi-lingual` 等）。底栏状态常面临四重困扰：

### 1. 命名风格与格式杂乱无章
各插件作者独立编写状态文本。有的带长包名前缀（`pi-mcp-adapter:`），有的用括号包裹数值（`[2]`），有的输出原生 emoji。长短不一的字符串在屏幕底部不断拉扯视线。
`pi-tui-status-beautifier` 自动剥离包名后缀，将杂乱状态统一规范为结构清晰的微型徽章。

### 2. 窄分屏下强制折行溢出
在 tmux、WezTerm 等多分屏环境下（列宽 `< 80`），冗长的状态字符串容易被强制折行，把编辑输入框向上挤压，破坏打字心流。
插件内置列宽预算守卫。当宽度紧张时，自动将闲置状态折叠为 `(+3 idle)`，优先保全报错与执行中状态。

### 3. 绝不劫持系统原生遥测数据
许多底栏美化工具采用粗暴的全局覆盖，把 Pi 原生的 Git 分支、Token 消耗（`↑1.2k ↓3.4k`）、上下文缓存率和思考级别（`• high`）全部冲掉。
本扩展默认采用**非侵入式微钩子（status-only）**：仅规范化插件状态徽章，Pi 原生的所有底层遥测数据 100% 原样保留。

### 4. 渲染循环 0 磁盘 I/O 损耗
在终端高频重绘动画中读取配置，极易引发磁盘 I/O 争用与打字卡顿。
本扩展在启动时完成内存装载，并在渲染层执行 Dirty-Checking 缓存，**TUI 重绘循环中 0 次调用同步文件读取**。

---

## 工作机制：行为-结果矩阵

```text
  /beautify （随时调出交互式主题切换器）
```

| 模式 / 场景 | 你做什么 | 插件幕后动作 | 底栏最终呈现 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **`stream`** *(默认极简)* | 正常安装各扩展 | 剥离冗长包名与杂乱符号，规范徽章 | `plan ❯ ◆ 3  mcp ❯ ● ready  anchor ❯ ⌖ 3` | 干净极简，日常主力推荐 |
| **窄分屏自适应** | tmux 分屏宽度 `< 80` 列 | 识别活跃状态，自动折叠就绪状态 | `toolflow ❯ ⌬ running (2/5)  (+3 idle)` | 多分屏防挤压折行 |
| **`full-footer`** *(全景)* | 开启全量底栏模式 | 接管两行底栏，第一行系统遥测，第二行徽章 | 行 1: 目录/Git/Token/模型；行 2: 规范徽章 | 极客全景视窗 |
| **`off`** *(彻底还原)* | 运行 `/beautify off` | 物理删除 `settings.json` 中的 `beautifier` 键 | 100% 还原原生底栏，零残留 | 随时无痛试用与反悔 |

---

## 预设画廊与视觉风格

键入 `/beautify` 即可实时交互切换不同风格：

```text
  1. stream (默认极简流式)
     chrome ❯ ● ready    toolflow ❯ ⌬ 2/5    anchor ❯ ⌖ 3    plan ❯ ◆ 1

  2. powerline (尖角分界与几何徽记)
     chrome ‹◆ ready›    toolflow ‹◈ 2/5›    anchor ‹⌖ 3›    plan ‹◆ 1›

  3. matrix (点阵微框与星标)
     chrome ⦗✦ ready⦘    toolflow ⦗✧ 2/5⦘    anchor ⦗⌖ 3⦘    plan ⦗✦ 1⦘

  4. glow (高对比度反色胶囊)
     chrome [ ● ready ]  toolflow [ ⌬ 2/5 ]  anchor [ ⌖ 3 ]  plan [ ◆ 1 ]

  5. minimal (10 列等宽排版流)
     chrome     ❯ ● ready    toolflow   ❯ ⌬ 2/5    anchor     ❯ ⌖ 3

  6. custom (与 AI 结对定制)
     用自然语言描述审美需求，由 Agent 提供 3 套 ASCII 视觉样机并自动入库。
```

---

## 核心特性与工程机制

- 🛡️ **非侵入式双层作用域**：
  * `status-only`（默认推荐）：仅规范化插件徽章，100% 完整保留 Pi 原生 Git 分支、Token 遥测与思考级别；
  * `full-footer`（深度一体化）：重构底栏为两行式布局，第一行系统状态，第二行插件状态。
- 📐 **Unicode UAX #11 与代理对安全**：内置独立字符宽度扫描器，精确计算东亚宽字符（2 列）、ASCII（1 列）与 ANSI 控制序列（0 列），彻底消除光标抖动与排版错位。
- ⚡ **渲染循环 0 磁盘 I/O**：会话启动时将配置加载至内存，重绘循环 0 磁盘读取；对相同状态执行 Dirty-Checking 缓存，避免重复构建字符串。
- ◐ **动态微型旋转器**：执行中的任务（`running`、`working`）自动触发 300ms 动态旋转器（`◐`、`◓`、`◑`、`◒`）。
- 🗑️ **零残留物理还原（Zero-Trace Revert）**：选择 `off` 时，不仅即时还原所有插件原生状态，还会从 `settings.json` 中物理删除 `beautifier` 键名，绝不留置废弃配置。

---

## 常用命令与配置

### 交互命令
```bash
/beautify                # 打开交互式主题选择菜单
/beautify stream         # 直接切换为 stream 风格
/beautify off            # 彻底关闭并清理配置
```

### 配置文件规范
配置自动持久化在 `./.pi/settings.json`（项目级）或 `~/.pi/agent/settings.json`（全局）：

```json
{
  "beautifier": {
    "style": "stream",
    "fullFooter": false
  }
}
```

---

## 作者手记

做 `pi-tui-status-beautifier` 的初衷，源于敲代码时的视觉烦躁。

随着装的 Pi 扩展越来越多，终端底栏逐渐变成了一个杂乱的广告牌。每个插件作者都有自己的标点风格、原生 emoji 和字符宽度。一旦进入 tmux 分屏，底栏经常被挤成两行，整块屏幕不断抖动。

市面上有些状态栏插件做法很激进：直接调用 `ctx.ui.setFooter` 把原生底栏整个端掉。结果把最重要的 Token 消耗、缓存命中率、思考级别和 Git 分支全给弄没了，有的甚至在每帧渲染里调用 `readFileSync` 读配置，打字都变钝。

这套扩展遵循三条硬约束：
1. **绝不吞原生遥测**：只修饰插件徽章，系统状态原汁原味；
2. **渲染循环 0 磁盘读取**：内存缓存，重复状态直接跳过；
3. **零残留反悔**：关掉时物理删除配置，不留半个孤儿键。

一个好的状态栏应当是安静、克制、整齐的，在你不需要它的时候近乎隐形。

---

## 质量验证

```bash
npm test            # 物理单元测试套件 (18/18 全部通过)
npm run lint        # ESLint 零警告
```

---

## 开源协议

MIT © [Jason](https://github.com/3ZEROS12)
