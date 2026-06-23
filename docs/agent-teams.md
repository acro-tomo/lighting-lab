# Agent Teams 使い分けガイド

Claude Code の **agent-teams** は複数のClaudeインスタンスをチームとして並列稼働させる実験的機能。本プロジェクトでは**デフォルトでは使わず**、限定ケースだけ有効化する。

## 結論

| 状況 | 推奨 |
|------|------|
| 通常の開発（調査→実装→検証→レビュー） | **subagents** で十分 |
| 並列コードレビュー（独立した視点） | **agent-teams** が有効 |
| 競合仮説でバグ調査 | **agent-teams** が有効 |
| 独立モジュールの並行実装 | **agent-teams** が有効 |
| 同じファイル編集 / 逐次依存 | **agent-teams は NG**（subagents または single） |
| 1〜2ファイル / 10行以下 | **直接編集** |

## subagents vs agent-teams

|  | subagents | agent-teams |
|---|-----------|-------------|
| コンテキスト | 各自独立、結果のみ親に返る | 各自独立、互いに直接通信できる |
| 通信 | 親↔子のみ | teammate同士で `SendMessage` 可能 |
| コーディネーション | 親が一括管理 | 共有task listを奪い合う |
| トークンコスト | 低（結果のみ戻る） | 高（各teammateが独立Claude） |
| デフォルト | 常に有効 | 無効（環境変数で有効化） |

本プロジェクトの主力は領域別＋作業種別のsubagents（[../CLAUDE.md](../CLAUDE.md) 参照）。teamsはそれで足りないときだけ。

## 有効化

`~/.claude/settings.json`（または一時的に環境変数）:
```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```
```bash
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude
```

## 用途1: 並列コードレビュー
1人のレビュアーは1軸に寄りがち。視点を分けて並列化し、leadで統合する。
```
この差分を3 teammateでレビュー：
- correctness teammate: ロジック・エッジケース・型整合
- rendering teammate: WYSIWYG不変条件・Three.jsリソース管理・パストレ
- data teammate: types↔schema↔storage整合・保存JSON互換
それぞれ独立にfindingsを出してからleadで重複排除・severity統合。
```
本プロジェクトの `reviewer` を agent type として参照可能。

## 用途2: 競合仮説でバグ調査
単独agentは最初の仮説で止まりがち（アンカリング）。複数仮説を並行検証して反証ベースで収束。
```
「リアル表示が真っ黒になる」報告。teammateで以下を独立検証：
1. WebGL2ガード/コンテキスト喪失
2. カメラ/ライト初期化順序
3. helper無効化ロジックが本体ライトまで消している
4. パストレworkerのBVH構築失敗
互いに反証コメントをつけ、消去法で残った仮説をleadがまとめる。
```
修正は**1 teammateに限定**（複数同時編集は後勝ち）。読み取り専用にするなら `permissionMode: plan`。

## 用途3: 独立モジュールの並行実装
編集ファイル集合が完全に分かれる作業だけ。共通インターフェース（`types.ts`）を**先に確定**してからspawnし、ファイル境界をprompt明記。

## 落とし穴
1. **ファイル衝突**: 同一ファイルを複数teammateが編集すると後勝ち。編集は1 teammateに集約。
2. **起動コスト**: teammateごとにCLAUDE.md/skills/git statusのフルロード → トークン線形増。3〜5で頭打ち。
3. **継承なし**: subagent定義をteammateに流用しても `skills` / `mcpServers` は引き継がれない（`tools` と `model` は継承）。
4. **nested不可**: teammateは別teammateをspawnできない（subagentは可）。
5. **lead固定**: 最初のsessionがlead。途中昇格不可。

## 推奨運用
1. デフォルトはsubagents。teamsは限定3用途で手動on。
2. teammate数は3〜5で始める。
3. 編集系は必ず1 teammateに集約。複数teammateはreview/research限定。
4. spawn promptに担当ファイルと触らない場所を明記。
5. 終わったらshutdown指示。`tmux ls` でorphan確認。

## 関連
- 公式: https://code.claude.com/docs/en/agent-teams
- 公式 subagents: https://code.claude.com/docs/en/sub-agents
