# 配灯図リールに音声を入れるプロンプト（Mac用）

`marketing/instagram/out/reel-plan-dots.mp4` は現在**無音**。AivisSpeech は macOS 前提なので、
音声入りへの差し替えは Mac のローカルセッションでやる。下のブロックをそのまま Claude Code に貼る。

---

## コピペ用プロンプト

```
LDK Lighting Lab の配灯図リール（plan-dots）に AI 音声を入れて、無音版の mp4 を差し替える。

## 今の状態

- 構成と台本: marketing/instagram/reels/plan-dots.reel.json（5ショット / 20.4秒 / 1080×1920 / 30fps）
- marketing/instagram/out/reel-plan-dots.mp4 は音声トラックが無音の状態でコミット済み
- 撮影フレーム（output/ 配下）はリポジトリに入っていないので、Mac で撮り直しから始める
- 企画の背景は marketing/instagram/reels/plan-dots.prompt.md

## 必要なもの（無ければそこで止めて報告する）

- /Applications/AivisSpeech.app（AivisSpeech Engine。スクリプトが自動で起動する）
- /Users/hoshi/AI/音声/reel-voice-generator/generate_reel_voice.py
- npm ci 済み、npm run ig:fonts 済み（fonts/ は .gitignore なので初回は取得が要る）

## 手順

別ターミナルで npm run dev を起動してから、次の順に実行する。

    rm -rf output/reel-plan-dots-frames
    REEL_CONFIG=marketing/instagram/reels/plan-dots.reel.json REEL_SMOKE=1 npm run ig:decision-capture
    REEL_CONFIG=marketing/instagram/reels/plan-dots.reel.json npm run ig:decision-capture
    python3 scripts/instagram/generate-reel-voice.py marketing/instagram/reels/plan-dots.reel.json
    REEL_CONFIG=marketing/instagram/reels/plan-dots.reel.json REEL_WITH_VOICE=1 npm run ig:decision-encode

SMOKE撮影（3フレーム）で構図が前回と同じか確認してから本撮影に進む。
本撮影は 660 フレーム。GPUがあれば数分で終わる。

## 台本と許容尺

音声はショットごとに作り、映像の切り替わりに合わせて置く。各ショットの許容尺（cue window）は
撮影尺からクロスフェード0.4秒を引いた値で、超えると generate-reel-voice.py が止まる。

| ショット | 台本 | 許容尺 |
|---|---|---|
| s1-marks | この丸だけで、決めて大丈夫ですか。 | 2.80秒 |
| s2-choice | 四灯か、八灯か。図面では決められません。 | 3.40秒 |
| s3-compare | 変えたのは、照明だけです。 | 5.80秒 |
| s4-indirect | 間接を足すと、奥が明るくなる。 | 2.60秒 |
| s5-outro | 丸の数ではなく、夜の見え方で決める。 | 5.80秒 |

台本は plan-dots.reel.json の各ショットの `voice` にある。直すときはここを編集する。

## 音声の設定（plan-dots.reel.json の先頭）

| キー | 値 | 意味 |
|---|---|---|
| speakerId | 888753760 | 6つの間取りリールと同じ話者 |
| speed | 1.08 | 話速 |
| intonation | 1.05 | 抑揚 |
| tempoDynamics | 1.15 | 緩急 |
| volume | 1.0 | 音量 |

聞いて不自然なら、話速を上げる前に**文を短く切る・読点を足す・話者を変える**を先に試す。

## 尺に入らなかったとき

1. まず台本を短くする（体言止め・助詞を削る）。速度を機械的に上げない。
2. どうしても入らないショットは plan-dots.reel.json の `seconds` を伸ばす。
   ただし尺を変えたら**そのショットのフレーム数が変わる**ので、撮影からやり直す。
3. 全体は20〜23秒に収める。

## 仕上げ

1. `ffprobe marketing/instagram/out/reel-plan-dots.mp4` で 20.4秒前後・音声トラックありを確認する。
2. スマホで再生して、音量・声とテロップのタイミング・冒頭3秒の頭切れを確認する。
3. mp4 をコミットして push する（作業ブランチのみ。staging / main には入れない）。
4. marketing/instagram/BUFFER-QUEUE.md の「4. 配灯図リール」の動画URLのSHAを、
   いま push したコミットのSHAに差し替える。「音声: 未収録」の行も更新する。
5. Buffer へは音声を確認してから登録する（notification公開 / type=reel /
   shouldShareToFeed=true / thumbnailOffset は2500ms付近）。

## やらないこと

- 台本に実照度(lux)・配光を保証する言い回しを足さない。
- 音声を1本の長尺で作って後から重ねない（台本を直したとき映像との対応が崩れる）。
- output/ の中間ファイルをコミットしない。
```

---

## 補足

- `generate-reel-voice.py` は `output/reel-plan-dots-frames/shots.json` を読んでタイミングを決める。
  撮影を飛ばすとここで止まる。
- AivisSpeech Engine は自動起動する。起動失敗のログは `output/reel-plan-dots-audio/aivis-engine.log`。
- エンコード側は音声マニフェストと撮影結果の突き合わせをするので、**台本だけ直して再エンコード**しても
  ズレない（フレーム数が変わっていなければ音声の作り直しだけで済む）。
