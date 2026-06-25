# LDK Lighting Lab — CLAUDE.md

MacBook上でローカル実行する個人用の照明シミュレーター。1階LDK・階段・吹き抜けを簡易3D化し、家具と照明の位置・明るさ・色温度を変えて夜の見え方を比較する。**住宅CAD/照度帳票ではなく、雰囲気比較用の視覚シミュレーション**。詳細は [README.md](README.md)。

## スタック

Vite + React 19 + TypeScript / Three.js + @react-three/fiber + @react-three/drei / Zustand / Zod / pdfjs-dist / three-gpu-pathtracer + three-mesh-bvh。

## コマンド

| 目的 | コマンド |
|---|---|
| 開発サーバ | `npm run dev`（通常 http://127.0.0.1:5173/） |
| 型チェック（主ゲート） | `npm run typecheck` |
| ビルド | `npm run build` |
| 視覚検証（スクショ＋3D canvas非空） | `npm run visual-check -- <url>` （`--render-peek` / `--render`） |

## 不変条件（破らない）

- **WYSIWYG**: 「リアル（常駐パストレ）」表示は編集用シーンをそのままパストレする。非物理の補助光・霧・接地影・選択枠は常駐パストレ時に**無効化**する。
- ヘッダー「レンダリング開始」のPNG書き出し用最終レンダーは、プロジェクトデータから**別の軽量レンダーシーンを再構築**する（編集用と同一メッシュではない）。この区別を保つ。
- **データ同期**: `types.ts` ↔ `schema/projectSchema.ts` ↔ `storage/projectStorage.ts` を一致させ、保存済みJSONの後方互換に配慮する。
- **誠実性**: 実照度(lux)・IES/LDT配光・帳票を保証するような実装/文言を入れない。画面の免責表示を真に保つ。

## エージェント編成

入力は基本このメイン会話が受け、内容に応じて専門エージェントへ委任する（メイン会話が実質オーケストレーター）。**1〜2ファイル・10行以下・自明な編集は委任せず直接編集**してよい。

### 領域別（コードの担当エリア — 編集の主力）
| エージェント | 担当ファイル |
|---|---|
| `render-3d` | Scene3D.tsx, rendering/pathTracer.ts, renderContext.ts |
| `plan-2d` | components/Plan2D.tsx, utils/floorplanImport.ts |
| `state-data` | store/projectStore.ts, types.ts, schema/, storage/, data/ |
| `lighting-domain` | utils/lighting.ts, data/calibrationProject.ts, 照明物理の数値マッピング |

### 作業種別（横断 — 領域に属さない作業）
| エージェント | 役割 |
|---|---|
| `code-explore` | 読み取り専用の横断探索。結論＋file:line引用だけ返す |
| `implementer` | 領域に属さないUIシェル（App / Inspector / HeaderBar / SceneStrip / main）と横断編集 |
| `builder` | typecheck / build 実行とエラー診断 |
| `visual-verify` | dev起動＋Playwrightで描画確認。PASS/FAILと観察だけ返す |
| `reviewer` | 読み取り専用コードレビュー（重大度付き） |
| `debugger` | 根本原因分析＋最小修正 |
| `web-researcher` | Three.js等の外部ライブラリ/仕様調査（一次情報＋URL） |
| `session-summarizer` | セッションをJSON記録。コンテキスト逼迫時の退避に使う |

### 振り分けルール
- 3D描画/パストレ → `render-3d`、2D平面 → `plan-2d`、状態/型/スキーマ/保存 → `state-data`、照明の数値/色温度/配光 → `lighting-domain`。
- 上記に属さないファイルの編集 → `implementer`。
- 「どこに何があるか」調査 → `code-explore`。原因不明の不具合 → `debugger`。
- 型/ビルド検証 → `builder`、実際の見え方確認 → `visual-verify`、変更レビュー → `reviewer`。

## 標準ワークフロー

1. **調査** — `code-explore` で対象ファイル・影響範囲を確定（コード変更前に）。
2. **計画** — 分解・優先度付け。5タスク超ならユーザー確認。
3. **実装** — 領域エージェント or `implementer` に委任（または直接編集）。
4. **検証** — `builder`（型/ビルド）＋必要に応じ `visual-verify`、非自明な変更は `reviewer`。
5. **報告** — 目的 / 変更ファイル / 検証結果 / 残課題 / 次アクション。
6. **記録** — 完了 or コンテキスト逼迫時に `session-summarizer` でJSON退避。

## 原則

- 既存のスタイル・命名・react-three-fiber idiom を尊重。リファクタは依頼/必要が明確なときだけ。
- 最小変更。過剰防御・YAGNI違反を避ける。検証は境界（ユーザー入力・読込JSON・取込ファイル・WebGL2チェック）のみ。
- コメントは「なぜ」だけ。タスク経緯はコミットメッセージへ。不確実なら「不明」と明示し、推測でパス/API/コマンドを作らない。
- 返答は日本語、コード/識別子は英語。詳細は `response-style` スキル。

## トークン規律

- subagentコールは関連作業をまとめる（目安5〜8変更点 / 2000行以内）。A→B→A の往復を避ける。
- 軽い読み取り/要約/検証は安いモデル、深い領域作業はメイン継承。詳細は `token-efficiency` スキル。
- エージェントチームの使い分けは [docs/agent-teams.md](docs/agent-teams.md)。デフォルトはsubagents、限定3用途でのみteams。

## スキル

`response-style`（返答）/ `token-efficiency`（コスト）/ `code-quality`（品質）/ `git-workflow`（コミット）/ `secret-hygiene`（機密）。関連する時だけ読む。

## Git / 触らない場所

- **作業単位の完了ごとに必ずセマンティックコミットする**（履歴を残さず放置しない）。複数の不具合修正・機能追加をまとめて行った場合も、論理単位ごとに分けてコミットする。検証（typecheck/build）が通ってからコミットする。
- **コミット前に必ず `git status` / `git diff` で意図しない変更が混ざっていないか確認**してから `git add` する。
- push はユーザーが依頼したときだけ。`main` 直push・force系は事前確認。
- 生成物はコミットしない: `dist/`, `output/`, `.playwright-cli/`。

## メモリ

Claude Code の auto memory（プロジェクトの `memory/MEMORY.md`）は自動で蓄積される。同じ補足/間違いを繰り返したら `/memory` で確認し、このCLAUDE.mdに昇格する。長文の完了記録は `session-summarizer` が担当。
