# ローカル作業の引き継ぎ（Codex 等のローカルエージェント向け）

撮影・音声生成・エンコードは GPU と AivisSpeech が要るため、リモート環境では実行できない。
この文書は、Mac 上のエージェントにその工程を任せるための指示書。

**この文書の下半分「そのまま渡すプロンプト」をコピーして渡せば足りる。**

---

## 前提（実行前に確認する）

| 項目 | 期待 | 確認方法 |
|---|---|---|
| リポジトリ | `claude/lighting-lab-reel-strategy-ahjya2` の最新 | `git log --oneline -1` |
| 依存 | インストール済み | `npm install` |
| フォント | `marketing/instagram/fonts/*.ttf` | `npm run ig:fonts`（初回のみ） |
| devサーバ | 起動したまま | `npm run dev`（別ターミナル） |
| AivisSpeech | 起動可能 | `/Applications/AivisSpeech.app` |
| 音声生成器 | 存在する | `/Users/hoshi/AI/音声/reel-voice-generator/generate_reel_voice.py` |

---

## 破ってはいけない前提

企画は承認済み（[PLAN-3reels.md](PLAN-3reels.md)）。以下は**勝手に変えない**。
変える必要が出たら、手を止めて依頼者に確認する。

1. **元のデモJSONを書き換えない。** `public/demo/**` と `src/data/**` は読むだけ。
   比較条件はメモリ上だけに適用される仕組みになっている。
2. **1本1間取り。** 各設定ファイルの `projectFile` は全ショットで同一。増やさない。
3. **変える条件は1つだけ。** 各リールで変わるのは以下だけ。他を動かすと比較が壊れる。
   - dining: 食卓直上の器具種別のみ
   - void: 吹き抜けを照らす手段のみ
   - engawa: 縁側の建築化照明3本の有無のみ（時刻送りは上下共通の文脈で、変数ではない）
4. **合計光束を崩さない。** dining と void はバリアント間で全灯の合計光束を揃えてある
   （差 0.04% / 0.11%）。`dimmer` や `lumens` を触ると「片方が明るいだけ」の比較になる。
   engawa だけは「足すか足さないか」が判断そのものなので揃えていない。
5. **免責を消さない・弱めない。** 全ショットに「雰囲気比較用。実照度・施工後の見え方は保証しません」
   が焼き込まれる。実照度(lux)・IES/LDT配光・照度計算書を保証する文言は入れない。
6. **既存の動画を上書きしない。** 出力名は3本とも新規。
7. **台本が尺を超えたら、話速を上げて詰めない。** 台本を短くするか撮影尺を延ばす。
   音声スクリプトは尺超過で処理を止める仕様。

---

## 手順

### 1. 構図確認（必ず最初にやる）

各3フレームだけ撮る。カメラ経路は設計値のままで、まだ誰も描画を見ていない。

```bash
npm run ig:reel-dining-smoke
npm run ig:reel-void-smoke
npm run ig:reel-engawa-smoke
```

フレームは `output/reel-{dining,void,engawa}-frames/<shotId>/f0000.png`。

**見る点はこれだけ。**

| リール | 確認 | ズレていたら直す場所 |
|---|---|---|
| dining | `s2-pendant` / `s3-downlight` の最終フレームで丸ダイニングテーブルが画面に収まっているか | 設定の `move.to.position` / `move.to.target` |
| void | `s3-spot` の最終フレームで天井と壁の上部が見えているか | 設定の `move.to.target.y`（現在 3.9） |
| engawa | `s1-dusk` で窓の外が明るく、`s3-night` 最終フレームで暗くなっているか | 設定の `daylight.fromHour` / `toHour` |

`Daylight.hour` は「ローカル太陽時」として扱われる（`src/types.ts:266`）。
実時刻とズレる可能性があるので、engawa は特に実際の絵で判断する。

**構図がおかしい場合、設定ファイルの `move` と `daylight` は直してよい。**
それ以外（`variants` / `variantTimeline` / テロップ / 台本）を直したくなったら、手を止めて確認する。

### 2. 本番

1本ずつ実行する。撮影→音声→エンコードまで通る。

```bash
npm run ig:reel-dining
npm run ig:reel-void
npm run ig:reel-engawa
```

撮り直すときは、その設定の `framesDir` を消してから実行する（前回のフレームが混ざる）。

### 3. 検証（「生成した」で完成にしない）

```bash
REEL_CONFIG=marketing/instagram/reels/dining-pendant-vs-downlight.reel.json npm run ig:reel-check
REEL_CONFIG=marketing/instagram/reels/void-pendant-vs-spot.reel.json        npm run ig:reel-check
REEL_CONFIG=marketing/instagram/reels/engawa-cove-dusk.reel.json            npm run ig:reel-check
```

仕様（1080×1920 / 30fps / H.264 / AAC / 音声トラック）は自動判定。
`output/reel-check/<name>/` に等間隔フレームが出るので、**以下は目で見る**。

- テロップが重なっていない
- 文字が切れていない、安全領域に収まっている
- 比較対象（食卓の光 / 吹き抜けの上部 / 縁側と窓）が画面内で判別できる
- 免責が読める
- 夜専用ツールに見える構成になっていない（engawa は夕方から始まる）
- 映像と音声が最後まで再生できる

### 4. コミット

検証が通ってから、論理単位ごとにコミットする。

```bash
git add marketing/instagram/out/reel-*.mp4
git commit -m "feat(instagram): 判断比較リール3本を書き出し"
git push -u origin claude/lighting-lab-reel-strategy-ahjya2
```

生成物のうち `output/` はコミットしない（`.gitignore` 済み）。

---

## 報告してほしいこと

1. 3本それぞれの `ig:reel-check` の結果（PASS / FAIL と実測値）
2. 目視で気づいた点（特に構図と、比較が絵として成立しているか）
3. 設定ファイルを直した場合は、どこをどう直したか
4. 判断に迷って止めた点

---

## そのまま渡すプロンプト

```
LDK Lighting Lab リポジトリ（ブランチ claude/lighting-lab-reel-strategy-ahjya2）で、
Instagram用リール3本をローカル生成してほしい。

手順と守るべき前提は marketing/instagram/reels/HANDOFF-local-codex.md に全部書いてある。
まずそれを読んでから始めること。企画の背景が要るときは同じディレクトリの PLAN-3reels.md。

重要:
- 必ず smoke（各3フレーム）で構図を確認してから本番を回すこと。まだ誰も実際の描画を見ていない。
- 元のデモJSON（public/demo/** と src/data/**）は読むだけ。書き換えない。
- 各リールで変えてよい条件は1つだけ。合計光束の揃え方を崩さない。
- 免責の焼き込みを消さない。実照度(lux)やIES/LDT配光を保証する文言を足さない。
- 構図がズレていたら設定ファイルの move / daylight は直してよい。
  それ以外（variants / テロップ / 台本）を変えたくなったら、手を止めて私に聞くこと。
- 完成後は必ず ig:reel-check を実行し、抽出フレームを目視してから完了と言うこと。
```
