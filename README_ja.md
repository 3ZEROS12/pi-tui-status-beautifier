# pi-tui-status-beautifier

Pi TUI 向けのミニマリストなステータスバー整形・レイアウトエンジン。

拡張機能ごとにバラバラなステータス文字列を統一。狭い分割ペインでの自動折りたたみ、描画ループ内のディスク I/O ゼロ、そしてシステム本来のテレメトリ（トークン数・Git ブランチ等）を一切奪わない非侵襲設計を備えています。

[![npm version](https://img.shields.io/npm/v/pi-tui-status-beautifier?color=blue)](https://www.npmjs.com/package/pi-tui-status-beautifier)
[![npm downloads](https://img.shields.io/npm/dm/pi-tui-status-beautifier?color=22c55e&label=downloads)](https://www.npmjs.com/package/pi-tui-status-beautifier)
[![GitHub stars](https://img.shields.io/github/stars/3ZEROS12/pi-tui-status-beautifier?style=flat&color=f59e0b)](https://github.com/3ZEROS12/pi-tui-status-beautifier/stargazers)
[![Built for Pi](https://img.shields.io/badge/Built%20for-Pi%20Coding%20Agent-orange)](https://github.com/earendil-works/pi-coding-agent)
[![Tests](https://img.shields.io/badge/Tests-18%2F18%20Pass%20(100%25)-brightgreen)](extensions/tui-status-beautifier.spec.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[English](./README.md) | **日本語** | [简体中文](./README_zh.md)

<p align="center">
  <img src="assets/hero-en.svg" alt="pi-tui-status-beautifier Presets" width="820">
</p>

```text
  ┌─ ネイティブのステータスバー (表記が不統一で雑然とした状態) ────────────────────────────────────────┐
  │  plannotator: 🟢 3 tasks    pi-mcp-adapter: [connected]    toolflow: active (2/5)    anchor: 3 items │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
  ┌─ pi-tui-status-beautifier (正規化・整列・幅に応じた自動折りたたみ) ────────────────────────────────┐
  │  plan ❯ ◆ 3    mcp ❯ ● ready    toolflow ❯ ⌬ 2/5    anchor ❯ ⌖ 3    chrome ❯ ● connected            │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## クイックスタート

Pi 内で直接インストールできます：

```bash
pi install npm:pi-tui-status-beautifier
```

インストール後すぐに反映されます。`/beautify` と入力すれば、いつでも対話メニューからスタイルを切り替えられます。

---

## コアバリュー：なぜ必要なのか？

Pi の拡張機能（`plannotator`, `pi-mcp-adapter`, `toolflow`, `pi-anchor`, `pi-lingual` など）を複数導入すると、下部のステータスバーで 4 つの問題が起きます：

### 1. 表記スタイルの不統一と視覚的ノイズ
各拡張機能が独自のフォーマット（長いパッケージ名プレフィックス、括弧、生の絵文字など）で文字列を出力するため、画面下部の視認性が悪化します。
`pi-tui-status-beautifier` は冗長なパッケージ接頭辞を取り除き、構造化されたマイクロバッジへ統一します。

### 2. 狭い分割ペインでの強制折り返し
tmux や WezTerm の分割ペイン（`< 80` カラム）では、長すぎるステータス行が複数行に折り返され、入力欄が上下に揺れてタイピングの妨げになります。
内蔵のカラム幅ガードが画面幅を検知し、狭い画面では待機中のバッジを自動的に `(+3 idle)` に折りたたみ、実行中やエラーのバッジを優先表示します。

### 3. システム本来のテレメトリを奪わない（`status-only`）
`ctx.ui.setFooter` でフッター全体を置き換えるプラグインは、Git ブランチ名、トークン消費量（`↑1.2k ↓3.4k`）、キャッシュ率、思考レベル（`• high`）まで消してしまいます。
本拡張機能はデフォルトで**非侵襲マイクロフック（`status-only`）**として動作し、ネイティブのシステム指標を 100% 残したまま拡張バッジのみを整形します。

### 4. 描画ループ内のディスク I/O ゼロ
高頻度の TUI 再描画ループ内で設定ファイルを同期読み込み（`fs.readFileSync`）すると、タイピング遅延の原因になります。
本拡張機能は起動時に設定をメモリへ読み込み、Dirty-Checking キャッシュを用いることで**描画ループ内のファイル読み込みをゼロ**に抑えています。

---

## プリセット一覧

`/beautify` で以下の 6 スタイルをリアルタイムに切り替えられます：

```text
  1. stream (デフォルト・ミニマリストストリーム)
     chrome ❯ ● ready    toolflow ❯ ⌬ 2/5    anchor ❯ ⌖ 3    plan ❯ ◆ 1

  2. powerline (アングルブラケット＆幾何学グリフ)
     chrome ‹◆ ready›    toolflow ‹◈ 2/5›    anchor ‹⌖ 3›    plan ‹◆ 1›

  3. matrix (ドットマトリクス枠＆スターアクセント)
     chrome ⦗✦ ready⦘    toolflow ⦗✧ 2/5⦘    anchor ⦗⌖ 3⦘    plan ⦗✦ 1⦘

  4. glow (高コントラスト反転ピルバッジ)
     chrome [ ● ready ]  toolflow [ ⌬ 2/5 ]  anchor [ ⌖ 3 ]  plan [ ◆ 1 ]

  5. minimal (10 カラム固定幅整列ストリーム)
     chrome     ❯ ● ready    toolflow   ❯ ⌬ 2/5    anchor     ❯ ⌖ 3

  6. custom (AI 協調デザイン)
     好みのスタイルを自然言語で伝えると、3 種類の ASCII モックアップを生成します。
```

---

## コマンド＆設定

```bash
/beautify                # 対話型スタイル選択メニューを開く
/beautify stream         # stream プリセットへ直接切り替え
/beautify off            # ネイティブ表示へ戻し、設定ファイルから beautifier キーを物理削除
```

---

## 検証とテスト

```bash
npm test            # Vitest ユニットテスト 18/18 通過
npm run lint        # ESLint 警告ゼロ
```

---

## Ecosystem: Pi Terminal Suite

4 つの拡張機能はそれぞれ異なるターミナルスロット（`aboveEditor`、`belowEditor`、`status-only` フッター、実行時ツールフック）にマウントされるため、単体でも全種併用でも UI が干渉しません：

| パッケージ | ターミナル配置スロットと機構 | インストール |
| :--- | :--- | :--- |
| **[`pi-lingual`](https://github.com/3ZEROS12/pi-lingual)** | `二 ⇄ two` `aboveEditor` 二言語 HUD（最大 9 行・UAX #11 ツリーレイアウト）＆英語プロンプト変換（履歴トークン消費 0） | `pi install npm:pi-lingual` |
| **[`toolflow`](https://github.com/3ZEROS12/toolflow)** | `⌬` 実行時ツールフック —— フェーズ別 MCP マウント＆40 行超のログ自動ディスク退避（ログトークン 95% 削減） | `pi install npm:toolflow` |
| **[`pi-tui-status-beautifier`](https://github.com/3ZEROS12/pi-tui-status-beautifier)** *(現在)* | `status-only` フッターフック —— 6 種のバッジプリセット、`<80` 列での待機バッジ折りたたみ `(+N idle)`、描画ループ内ディスク I/O ゼロ | `pi install npm:pi-tui-status-beautifier` |
| **[`pi-anchor`](https://github.com/3ZEROS12/anchor)** | `⌖` `belowEditor` 1 行常駐付箋バー、0ms `pin:` インターセプト、ミニ進捗バー `[■■□□]` ＆ `↪` セッション復帰 | `pi install npm:pi-anchor` |

---

## ライセンス

MIT © [Jason](https://github.com/3ZEROS12)
