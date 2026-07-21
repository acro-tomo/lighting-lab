# Build Week デモ動画 タイムライン

対象: `output/demo-video/lighting-lab-openai-build-week-demo.mp4`(1920×1080 / 30fps / H.264+AAC 48kHz / 2:58)

ナレーション: `/Users/hoshi/AI/kokoro tts/output/lighting_lab.wav`(165.1秒、無加工。動画先頭から **+3.0秒** オフセットで配置。ラウドネス整音 loudnorm I=-16 のみ適用 — 速度・ピッチ・内容は不変)。

照明状態はすべて実際のアプリ操作(Zustandストアの公開アクション)で変更した実挙動。表示は全編ラスター編集ビュー(夜設定 20:00)。

| 動画時間 | 場面 | 使用素材 | ナレーション | カメラ | 照明設定 / 編集内容 |
|---|---|---|---|---|---|
| 0:00–0:18.5 | 冒頭フック: リビングからダイニング・キッチンを見る緩やかな前進 | S1-open 連番フレーム(30fps) | P1「Choosing lighting… before the house is built.」(0:05.4–0:15.6) | 構図B: (-4.6,1.62,3.5)→(-3.5,1.58,2.45) 注視点ダイニング | 完成状態(全灯2700K・調光82%・アイランド配光110°) 冒頭0.5sフェードイン |
| 0:18.5–0:33.8 | 課題提起: ほぼ静止の緩やかな横ドリフト | S2-drift 連番フレーム | P2「It is hard to know from a drawing…」(0:18.6–0:33.8) | 構図B 微小横移動 | 同上 |
| 0:33.8–0:39.5 | 2D間取り全画面。カーソルが Import floor plan をホバー | U12 連番フレーム(実操作、30fps) | P3前半「With Lighting Lab, you start from your own floor plan. Load it in the browser…」 | 2D最大化(Fit to view済) | — |
| 0:39.5–0:50.6 | 2D→通常レイアウト復帰、同じ間取りが3Dの部屋として表示 | U12 連番フレーム | P3後半「…recreate your future rooms in three dimensions. There is no complex design software to learn.」+無音ホールド | 3Dパネル: 構図B相当 | — |
| 0:50.6–1:00.6 | 照明の選択と配置: 2Dでペンダント選択→インスペクタ表示→吊り長さ700→1000mmをドラッグ、3Dが即追従 | U12 連番フレーム | P4「Then, pick a light, and place it where you want it. The room updates right away…」+無音ホールド | 同上(固定) | Dining pendant west 選択、cordLength 0.7→1.0m |
| 1:00.6–1:12.05 | 電球色 | stills/A-warm | P5「Here is the light above the dining table. … a warm light…」+無音2s | 構図A固定: (-2.4,1.45,-1.0)→(0.15,1.0,-2.65) fov70 | 全灯2700K・82% |
| 1:12.05–1:20.1 | 温白色 | stills/A-neutral | P6「Now, a more natural light…」+無音2s | 構図A固定(同一) | 全灯3500Kのみ変更 |
| 1:20.1–1:28.2 | 昼光色 | stills/A-white | P7「And now, a white light…」+無音2s | 構図A固定(同一) | 全灯6500Kのみ変更 |
| 1:28.2–1:32.8 | 3色の再確認(1秒ずつ 2700→3500→6500) | stills A-warm/neutral/white | P8「Same room, same furniture. Only the light has changed.」 | 構図A固定(同一) | 色のみ順次変更 |
| 1:32.8–1:36.5 | 明るさ: 基準→明るく | stills A-warm→A-bright | P9「Brightness is just as easy. Turn it up for cooking or homework.」 | 構図A固定(同一) | 全灯調光82→100%(色2700K固定) |
| 1:36.5–1:41.5 | 明るく→暗く、余韻 | stills/A-dim | P9「Turn it down for a quiet evening.」+無音3s | 構図A固定(同一) | 全灯調光15%(色固定) |
| 1:41.5–1:46.6 | 光の広がり: 狭い(カウンター中央だけ照らす) | stills/C-narrow | P10「You can also change how far the light spreads. Keep it focused on the center of the table,」 | 構図C固定: (-0.9,1.5,-0.6)→(3.0,0.95,-2.8) fov70 | アイランドダウンライト配光22°(色・明るさ固定) |
| 1:46.6–1:53.0 | 広い(カウンター全面へ広がる)、余韻4s | stills/C-wide | P10「or open it up to light the whole surface.」+無音 | 構図C固定(同一) | 配光110°のみ変更 |
| 1:53.0–2:00.0 | 部屋の中を歩く(1): リビングへ — 南壁のアート・TV壁・ソファ・西側の縦長窓を見ながら前進 | S6a-living 連番フレーム | P11「And you are not limited to one view. Walk through the room, and see how the lighting feels from the sofa…」 | 目線高さ1.5m (0.3,1.5,-0.6)→(-0.9,1.5,0.3) 注視点リビング南西 | 完成状態(2700K・82%・配光110°) |
| 2:00.0–2:06.0 | 部屋の中を歩く(2): ダイニングへ接近、キッチン方向へ視線 | S6b-dining 連番フレーム | 「…or from the kitchen.」+無音6s | (-3.0,1.5,1.6)→(-1.35,1.5,-0.25) | 同上 |
| 2:06.0–2:09.9 | プロジェクト保存の実操作(Save projectクリック→保存通知) | U3 連番フレーム(実操作) | P12「Each plan can be saved, so you can compare your ideas side by side.」 | 通常レイアウト(固定) | — |
| 2:09.9–2:13.0 | LDK全景へ切替(静止) | S8-pan 先頭フレーム | 無音 | 構図B広角: (-5.0,1.7,3.6) fov78 | 完成状態 |
| 2:13.0–2:28.4 | LDK全体の緩やかな横パン | S8-pan 連番フレーム | P13「This project was built with Codex and GPT five point six…」 | (-5.0,1.7,3.6)→(-4.15,1.7,3.75) | 完成状態 |
| 2:28.4–2:30.4 | ホールド | S8-pan 最終フレーム | 無音 | 固定 | 完成状態 |
| 2:30.4–2:40.1 | 緩やかな後退でLDK全景の完成ショットへ | S9-pull 連番フレーム | P14「Lighting Lab does not tell you there is one correct answer…」 | (-3.7,1.6,2.5)→(-4.9,1.7,3.6) | 完成状態 |
| 2:40.1–2:52.0 | 完成ショット固定(余韻)。2:43.5でナレーション終了 | S9-pull 最終フレーム | P15「See your lighting first. Then build your home.」(2:41.2–2:43.5)→無音 | 構図B広角 固定 | 完成状態。末尾0.6sフェードアウト |
| 2:52.0–2:58.0 | エンドカード「Lighting Lab / Plan your lighting before you build. / OpenAI Build Week」 | assets/endcard.png | 無音 | — | フェードイン0.4s・フェードアウト0.8s |

## 編集内容の要点

- ストレートカットのみ(フェードは冒頭・エンドカード前後のみ)。
- 色比較・明るさ比較・配光比較はカメラ/家具/時刻/表示設定を完全固定し、対象パラメータのみ変更した静止画ホールド。ケルビン値の字幕・強調表示なし。
- 無音区間には結果確認ホールド(2〜4秒)または移動ショットを配置し、無音を削っていない。
- BGM・効果音なし。
- UI操作はPlaywrightの実操作をフレームステップ(30fps)でキャプチャ(疑似カーソル表示付き)。
- 字幕は別ファイル `lighting-lab-openai-build-week-demo.srt`(焼き込みなし)。

## 制作パイプライン(再現手順)

```
npm run dev -- --port 5174        # dev server
node scripts/demo-video/capture-demo-assets.mjs   # 静止画・移動ショット連番フレーム
node scripts/demo-video/capture-ui-frames.mjs     # UI操作の連番フレーム
node scripts/demo-video/capture-walk2.mjs         # 歩行ショット(リビング/ダイニング)
node scripts/demo-video/make-endcard.mjs          # エンドカードPNG
node scripts/demo-video/compose.mjs               # ffmpeg合成 → MP4
```
