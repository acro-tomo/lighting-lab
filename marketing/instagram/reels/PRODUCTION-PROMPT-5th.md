# 第5弾リール制作プロンプト

[fifth-wave-six-reels.md](fifth-wave-six-reels.md) の6本を実際に mp4 にするために、
新しいセッションへそのまま貼るプロンプト集。第4弾のプロンプトは
[PRODUCTION-PROMPT.md](PRODUCTION-PROMPT.md)。

**使い方**: 別ターミナルで `npm run dev` を起動しておき、
「0. 着手前の確認」→「共通ルール」→「作りたい1本のブロック」の順に貼る。

**並行させない。逐次なら繋げてよい。** 撮影スクリプトは実行のたびに Chromium を起動して閉じ、
config ごとに `framesDir` を持つ。共有状態は `output/reel-overlays`（`BUILD_DIR`）だけで、
ファイル名が `<shot.id>.png` なのでショットIDが違えば衝突しない。
複数本を1セッションで通す場合は[最後の節](#複数本を1セッションで通す)を使う。

---

## 0. 着手前の確認（**最初に1回だけ。ここを飛ばさない**）

```
LDK Lighting Lab の Instagram リール第5弾に着手する前に、次の2点を確認して報告する。
まだ何も作らない。

## 確認1: git の外で作られた制作物の回収

直近8本（day1-am-all-100-question / day1-pm-plan-approval-checklist /
day2-am-kitchen-three-lights-quiz / day2-pm-table-before-fixture /
day3-am-reference-photo-reality / day3-pm-night-window-timelapse /
ldk-downlight-center-vs-wall / reel-table-wiring）と、第4弾の案A・案B・案C
（reel-b-eye-height / reel-c-touch ほか）は Instagram に投稿済みだが、
**このリポジトリに設定ファイルが1つも無い**（全ブランチを検索して不在を確認済み）。

さらに、第4弾が必須としていたパイプライン変更3点
（silent ショット / eyebrow・sub の省略 / XFADE の可変化）が
scripts/instagram/encode-reel.mjs に入っていない（XFADE は定数 :29、eyebrow は無条件描画 :175）。
にもかかわらず案A・B・Cはその仕様で完成している。

次を確認する。
- `git status` と `git stash list` に未コミットの制作物・スクリプト変更が無いか
- 上の8本＋案A/B/C の reel config と encode-reel.mjs の変更が、どこかに残っていないか
- 残っていれば、このブランチにコミットする（mp4 と設定JSONだけ。output/ は入れない）
- 残っていなければ、「再現不能である」と明記して報告する

**ここを放置したまま6本足さない。** 再現できない制作物がさらに増える。

## 確認2: パイプライン変更の実装

確認1で変更が見つからなかった場合、次の3点を encode-reel.mjs に実装する。
第4弾 next-four-reels.md 6節と同じ内容。

1. `text.silent = true` のショットでは、完全に透明なオーバーレイを出す
   （scrim もロックアップも文字も無し）。shots は `TEXTS[shot.id]` の存在で
   フィルタしている（:196-201）ので、text を省略するのではなく silent フラグで表現する。
2. eyebrow / sub / cta を省略可能にする。現状は未定義でも `<p>` が描画されて
   "undefined" が出る（:175, :177）。1画面1文にするため headline 1行だけで成立させる。
3. XFADE が定数 0.4 秒で固定（:29）。1.5〜2.0秒のショットが並ぶので
   config から上書きできるようにし、既定を 0.2 にする。

実装したら `npm run typecheck` は不要（スクリプトはTSではない）だが、
`REEL_SMOKE=1` で1本流して overlay PNG が意図どおり透明／1行になることを確認する。
```

---

## 共通ルール（毎回、案のブロックの前に貼る）

```
LDK Lighting Lab の Instagram リールを1本作る。設計は
marketing/instagram/reels/fifth-wave-six-reels.md、リールの規約は
marketing/instagram/reels/AUDIENCE-AND-FORMAT.md、第4弾の設計と経緯は
marketing/instagram/reels/next-four-reels.md にある。**3つとも先に読むこと。**
食い違う点は fifth-wave-six-reels.md 2節「6本に共通する型」に
引き継ぐ項目と上書きする項目が整理してあるので、それに従う。
**判断の軸の在庫は fifth-wave-six-reels.md 1節が正**で、
AUDIENCE-AND-FORMAT.md の在庫表は古い（Buffer実データで確認済み）。

## 前提
- 別ターミナルで `npm run dev` が起動済み（http://127.0.0.1:5173/）。
- 撮影は scripts/instagram/capture-decision-reel.mjs、エンコードは
  scripts/instagram/encode-reel.mjs。どちらも REEL_CONFIG で設定ファイルを渡す。
- 初回のみ `npm run ig:fonts` でフォントを取得する（fonts/ は .gitignore 済み）。
- 撮影にはGPUが要る。`REEL_HEADLESS=1` は付けない（software GL に落ちて約46秒/フレーム）。

## 絶対に守ること
- 実照度(lux)・IES/LDT配光・照度計算書を保証する表現を、テロップにもキャプションにも
  入れない。メーカー名・型番・価格も出さない。CLAUDE.md の誠実性の不変条件。
- テロップは1画面1文・全角14文字以内。設計ファイルの文言を勝手に増やさない。
- 構図規約を守る。テロップは y=1000〜1500 に載るので、主役は画面の上半分（y<1000）に
  収める。天井が主役でも見上げず、ピッチを下げて天井を上半分へ持ち上げる。
- **冒頭2.0秒はテキストもロックアップも一切乗せない。**「見出しがないと分かりにくい」等の
  理由で足さない。この変数を測ることが第5弾の目的の半分なので、ここを崩すと意味が消える。
- 音声は入れない（REEL_WITH_VOICE は使わない）。ナレーションは実測5.8字/秒で、
  1.5秒ショットには (1.5-0.4)×5.8 ≒ 6字しか入らない。9〜12秒の尺では成立しない。
- **最後は問いで終える。答えを書き足さない。**
- 比較で条件を変えるときは、バリアント間で合計光束（lumens × dimmer / 100 の総和）を
  0.1%以内に揃える。ただし「足すか足さないか」自体が判断の本は揃えない
  （①⑤がこれ。設計ファイルに明記してある）。
- ディスク上のデモJSON（public/demo/rooms/*.json、public/demo/share-demo-project.json）は
  書き換えない。比較条件はメモリ上のプロジェクトへ適用する。
- 生成物のうち mp4 と設定JSONだけをコミットする。output/ 以下（中間フレーム）は入れない。
- このブランチの内容を staging / main へマージしない（SNS素材のため）。

## 進め方（この順を守る）
1. 設計ファイルの該当ブロックを読み、reel config を書く。
2. `REEL_CONFIG=<config> REEL_SMOKE=1 npm run ig:decision-capture` で3フレームだけ撮り、
   構図を確認する。破綻していたらカメラ値を直してやり直す。本撮影に進まない。
3. 本撮影 → エンコード。
4. 出力 mp4 の 0.0 / 1.9 / 2.1 / 中盤 / 末尾 のフレームを書き出して目視で確認し、
   何が映っているかを文章で報告する。「できました」で終わらせない。
5. 判断できない点は「要確認」と明示する。推測でパスやAPIを作らない。

## 受け入れ基準
- 尺が設計どおり（±0.5秒）。
- 0.0〜1.9秒のフレームに文字・ロックアップ・暗幕が一切写っていない。
- 各テロップが全角14文字以内で、1画面に1文だけ。
- 末尾にURLと免責が出ている。最後のテロップが問いになっている。
- 実照度を保証する表現がどこにも無い。
```

---

## ①｜何灯目で、足りたと思いますか（最初に作る）

```
①「何灯目で、足りたと思いますか」を作る。11.0秒・無音。

## 素材
public/demo/share-demo-project.json（8.6×6.4 / 天井2.42m / 9灯）をそのまま使う。

## この案の狙い
灯数を「AかBか」ではなく連続で見せ、判断を視聴者に渡す。
テーマではなく構造が新しい。8/12 20:30 の投稿（リーチ167・再生226、唯一プールを抜けた1本）と
同じ「問いで終わる」型を、比較ではなく積み上げでやる。
**合計光束は揃えない。**増やすこと自体が判断の中身。

## バリアント
n1〜n9 の9バリアント（または n0 を足して10）。各バリアントで
**まだ点いていない灯**を disableLightIds に入れる。器具本体は画に残すので
removeLightIds は使わない。点灯順は次のとおり。

  1: light-dining-pendant
  2: light-kitchen-2
  3: light-kitchen-1
  4: light-kitchen-3
  5: light-tv-tape
  6: light-tv-wall-2
  7: light-tv-wall-1
  8: light-tv-wall-3
  9: light-stair-bracket

## ショット構成
| id | 秒 | 内容 | テロップ |
|---|---|---|---|
| e1-dark  | 2.0 | 消灯 → 1灯目 → 2灯目。カメラ微速前進 | なし（silent） |
| e2-three | 1.6 | 3灯目 | 3灯 |
| e3-five  | 1.6 | 5灯目 | 5灯 |
| e4-seven | 1.6 | 7灯目 | 7灯 |
| e5-nine  | 2.2 | 9灯（全点灯） | 図面はここです |
| e6-ask   | 1.6 | 静止 | 何灯目で足りた？ |
| e7-outro | 1.0 | 静止 | outro（URL＋免責） |

sequence.mode は fixture-variant-move。カメラを止めれば同一フレームでの切替、
動かせばドリーになる。静止ショットは move.from と move.to を同じ値にする。

## 要確認（分かったら報告する）
- e1-dark の全消灯フレームが真っ黒に潰れないか。潰れる場合は 0灯から始めず
  1灯目が点いた状態から始める。**冒頭2秒に文字が無いことは維持する。**
- 1.6秒ショットで変化を2回入れると1回0.8秒しかない。切替が読めるか smoke で見る。

## 出力
- config: marketing/instagram/reels/e-how-many-lights.reel.json
- framesDir: output/reel-e-how-many-lights-frames
- outName: reel-e-how-many-lights.mp4
```

---

## ②｜図面に、家具は描かれていません

```
②「図面に、家具は描かれていません」を作る。10.5秒・無音。

## 素材
public/demo/rooms/dk-copenhagen-apartment.json（8.6×6.4 / 天井3.25m /
低い位置の9灯 / 家具17点）。低い灯りなので家具が入ると光の当たる面が移る。

## 変える条件
家具の有無だけ。**照明は1灯も触らない。**合計光束は自動的に完全一致（0.000%）。

## 必要な実装
capture-decision-reel.mjs の applyVariant（:161付近）は lights しか触らない。
removeFurnitureIds と furnitureOverrides を足す。applyProject はプロジェクト全体を
setProject で流し込んでいる（:225-230）ので、furniture を差し替えれば反映される。
10行程度。lights 側の4操作（撤去/無効化/上書き/追加）と同じ書き方に揃える。

## ショット構成
| id | 秒 | 画 | テロップ |
|---|---|---|---|
| g1-empty | 2.0 | 家具ゼロ。床に光だまり。カメラゆっくり前進 | なし（silent） |
| g2-drop  | 1.5 | 家具が入る | 家具を入れました |
| g3-hold  | 2.0 | 静止 | 照明は変えてません |
| g4-floor | 2.0 | 床へ寄る | 光の当たる先が変わる |
| g5-ask   | 2.0 | 引き | 図面に家具はある？ |
| g6-outro | 1.0 | 静止 | outro（URL＋免責） |

## 言葉づかい — ここは厳しく守る
**「暗くなる」と書かない。**ラスター編集表示のバウンス近似
（src/components/scene3d/lightingFill.ts:23-31 の rasterBounceIntensity）は
光束と床面積だけの関数で、家具の有無も色も見ていない。家具を入れても間接光は変わらない。
画で実際に起きるのは直接光の遮蔽と影だけなので、言えるのは「光の当たる先が変わる」まで。
テロップもキャプションもここで止める。

## 要確認
- 家具を全部外した部屋が、床と壁だけののっぺりした箱にならないか。
  なる場合はラグと観葉植物だけ残して「ほぼ空」にする。
- 家具の出入りは variantTimeline では瞬時切替になる。滑らかに見せたいならショットを分ける。

## 出力
- config: marketing/instagram/reels/g-no-furniture-on-plan.reel.json
- framesDir: output/reel-g-no-furniture-frames
- outName: reel-g-no-furniture-on-plan.mp4
```

---

## ③｜床の色を変えただけ（**成立判定から始める**）

```
③「床の色を変えただけ」は、成立するかどうかの検証から始める。
これは第4弾の案Dの引き継ぎで、案A・B・Cは投稿済みだがこれだけ未実施のまま残っている。
設計は marketing/instagram/reels/next-four-reels.md 3節「案D」。

## なぜ検証が先か
ラスター編集表示のバウンス近似（src/components/scene3d/lightingFill.ts:23-31 の
rasterBounceIntensity）は光束と床面積だけの関数で、マテリアルの色を参照していない。
床を暗くしても間接光は変わらない設計。反射の相互作用はパストレ側の効果で、
現行の撮影スクリプト（capture-plates.mjs / capture-decision-reel.mjs）は
すべてラスター表示のスクリーンショットで、パストレ表示を撮る経路が存在しない。

## 検証の前に必ず直すこと（放置すると確実に偽陰性が出る）
6部屋では床のマテリアルがどこからも参照されていない。
ラスターは src/components/scene3d/sceneRoot.tsx:85 が
materialMap.get("floor-oak") ?? project.materials[0]、
パストレは src/rendering/pathTracer/sceneBuilder.ts:130 が
materials.get("cal-floor-oak") ?? materials.get("floor-oak")、無ければ固定色 #9d754a。
id floor-oak を持つのは share-demo-project.json だけで、6部屋の materials[0] はすべて壁材
（wall-shikkui / wall-lime-white / plaster-lime / plaster-jurakukabe / wall-plaster-gray /
brick-red）。床は壁の材質で描かれ、最終レンダーでは固定色になる。
各部屋が持つ floor-oak-nara, floor-herringbone は未使用。

このまま測ると床の色を変えても画素が1つも変わらず、成立しうる案を捨てることになる。
リール用のメモリ上プロジェクトに id floor-oak のマテリアルを足してから測る
（ラスターとパストレの両方がこの id を拾う）。アプリ本体は直さない（別件）。

## 検証手順
1. デモ部屋を1つ開き、上のとおり id floor-oak のマテリアルを足す。
2. ヘッダーの「レンダリング開始」で床が明るいオークのPNGを1枚書き出す。
3. その floor-oak の baseColor だけを濃い色へ変え、同じカメラでもう1枚書き出す。
4. **目視で判定しない。** 1080相当へ縮小してRGB差を取り、|Δ|>12 の画素の割合を測って
   数値を報告する。

判定は **40%以上で成立**。記録されている水準は、数灯の色温度変更が0.1〜2%（絵にならない）、
ロフトの5灯が22〜36%（見た目は弱い）、採用済みの第3弾⑧が92%、
全灯2700K→6500Kの対照が99%。**36%以下ならこの案は捨てる。無理に成立させない。**

## 差が出た場合の作り方
撮影スクリプトは書かない。書き出した3〜4枚のPNGを ffmpeg でクロスフェードして
連番フレームにし、既存の encode-reel.mjs でテロップを乗せる。追加実装ゼロ。
最終レンダーPNGには右下に透かしが入る（src/app/appUtils.ts:17-27）ので、
テロップのレイアウトが重ならないか確認する。

## 確認すること
- 壁の色を変える3枚目・4枚目も、同じカメラ・同じ照明で書き出せているか。
- 床と同じ問題が壁にもあるか。壁は wall.materialId で個別に引いている
  （src/components/scene3d/roomShell.tsx:129）ので効くはずだが、実際に測って確認する。

## 出力
- outName: reel-d-floor-color.mp4
```

---

## ④｜穴の位置は決まった。器具はまだ替えられる

```
④「穴の位置は決まった。器具はまだ替えられる」を作る。10.0秒・無音。

## 素材
public/demo/share-demo-project.json のダウンライト6灯
（light-tv-wall-1/2/3、light-kitchen-1/2/3）。

## 変える条件
6灯の model と beamAngleDeg だけ。dl-diffuse(110°) ⇔ dl-narrow(34°)。
位置・lumens・dimmer・色温度・カメラ・露出は同一。
lumens も dimmer も触らないので**合計光束は完全一致（0.000%）**。
ペンダント・ブラケット・テープは触らない。

## 絵になる根拠（実測済み・推測ではない）
marketing/instagram/reels/BUFFER-QUEUE-3rd.md の IES 適用実績に、
位置を1mmも変えずに配光だけを 52〜60° から 88° へ広げたとき
変化画素が 73.8〜91.9% だったという実測がある（⑨ 平屋のDL4灯）。
同じ穴で配光だけ変えれば絵は動く、はこの数字で裏が取れている。

## ショット構成
| id | 秒 | 画 | テロップ |
|---|---|---|---|
| h1-swap | 2.0 | 広配光 → 集光へ切替。カメラ微速で寄り | なし（silent） |
| h2-hold | 1.5 | 静止 | 穴は同じ位置です |
| h3-back | 2.0 | 集光 → 広配光へ戻す | 替えたのは器具だけ |
| h4-ab   | 2.0 | カメラ固定で A/B/A | 光の広がりが変わる |
| h5-ask  | 1.5 | 静止 | 図面はどっち？ |
| h6-outro| 1.0 | 静止 | outro（URL＋免責） |

## 守ること
- 8/7 に投稿済みの「植栽の一部か、全体か」（屋外スポット 20°/55°）と軸名が同じ「配光」。
  **キャプションで配光角の数字を主役にしない。**主役は「穴の位置を変えずに
  替えられるものがある」ほう。度数はテロップに出さない。
- 8/14 の ldk-downlight-center-vs-wall と同じ間取りなので**カメラを変える。**
  あちらはリビング側。こちらはキッチン側から、天板と床の光だまりが同時に入る画にする。

## ゲート
smoke の後、A条件とB条件の変化画素（1080相当へ縮小して |Δ|>12 の画素割合）を測る。
40%を下回るなら画角を詰め直し、それでも下回るならこの案は捨てる。

## 出力
- config: marketing/instagram/reels/h-same-hole-different-optic.reel.json
- framesDir: output/reel-h-same-hole-frames
- outName: reel-h-same-hole-different-optic.mp4
```

---

## ⑤｜夜中、この階段を降りますか

```
⑤「夜中、この階段を降りますか」を作る。9.5秒・無音。

## 素材
public/demo/rooms/jp-skipfloor-tokyo.json（7.4×8.4 / 天井4.4m）。
階段は skip-stair（x=2.55, z=-0.35 / 1.05×2.9）、
階段の足元灯は skip-bracket-stair（300lm / dimmer 72）。

## 変える条件
点灯する灯りだけ。
- 条件A: 全消灯（skip-bracket-stair も消灯）
- 条件B: skip-bracket-stair の1灯だけ点灯

**合計光束は揃えない。**足すか足さないか自体が判断の中身。
器具は撤去ではなく disableLightIds で消灯する（本体は画に残す）。

## ショット構成
| id | 秒 | 画 | テロップ |
|---|---|---|---|
| s1-dark | 2.0 | 全消灯の階段。カメラゆっくり階段へ寄る | なし（silent） |
| s2-on   | 1.5 | 足元の1灯が点く | 1灯だけ点けました |
| s3-hold | 2.0 | 静止 | 300ルーメンです |
| s4-off  | 2.0 | 消す | 消すとこうなります |
| s5-ask  | 1.0 | 静止 | 図面に入ってる？ |
| s6-outro| 1.0 | 静止 | outro（URL＋免責） |

## 守ること
- 「300ルーメン」は器具データの値そのものなので出してよい。
  **これを「明るさが足りる」根拠のように書かない。**照度の保証に読める表現は不可。
- 「危ない」「転ぶ」と書かない。安全を保証する表現になる。問いのまま終える。

## 要確認
- 全消灯フレームが真っ黒に潰れないか。潰れる場合は daylight を足さず、
  camera.exposure を上げる前にカメラを階段へ詰める。
- 階段が画面の上半分（y<1000）に入るか。既定カメラは
  pos(-2.9, 1.55, 3.45) / target(1.4, 1.5, -2.3) で階段方向を向いているので、
  ここから寄せて調整する。

## 出力
- config: marketing/instagram/reels/s-stair-at-night.reel.json
- framesDir: output/reel-s-stair-at-night-frames
- outName: reel-s-stair-at-night.mp4
```

---

## ⑥｜外から見た、うちの夜（**smoke で成否が決まる**）

```
⑥「外から見た、うちの夜」を作る。10.0秒・無音。
**6本のうち最も不確実。撮影より先に smoke でゲートを通す。**

## 素材
public/demo/rooms/jp-hiraya-engawa.json（12×7.2 / 縁側の大きな窓）。

## この案の狙い
31本すべて室内から撮っていて、外から見た画は一度も無い。カメラだけを室外に置く。
照明は1灯も触らない（合計光束は自動的に一致）。

## 先に通すゲート
REEL_SMOKE=1 で o1-out の3フレームだけ撮り、次の3点を目視で確認して報告する。
1. 建物が箱として成立しているか
2. 窓から光が漏れて見えるか
3. 天井の上端が破綻していないか（屋根のジオメトリは無い）

**1つでも崩れたらこの案は捨てる。無理に成立させない。**
カメラを下げてピッチを水平寄りにすれば上端は隠せるはずだが、それでも駄目なら捨てる。
2 が弱い場合も捨てる。差が窓の映り込みだけになると、8/13 に投稿済みの
「夜の窓」と見分けがつかなくなるため。

## 分かっていること
- 壁は THREE.DoubleSide で描かれている（src/components/scene3d/wallMeshes.tsx:125）ので、
  外から見ても壁は消えない。
- showCeiling はこの部屋も true。
- 日光の地面プレーンがある（src/components/scene3d/daylight.tsx:107）。
- 夜（日光OFF）に室外へ出したときの外壁・窓ガラスの見え方は**未検証**。

## ショット構成（ゲートを通った場合）
| id | 秒 | 画 | テロップ |
|---|---|---|---|
| o1-out  | 2.0 | 室外（庭側）から。窓から灯りが漏れている。ゆっくり寄る | なし（silent） |
| o2-near | 1.5 | 窓へ寄る | 外から見た夜です |
| o3-in   | 2.5 | 窓を抜けて室内へ（1本の補間） | 中はこうなっています |
| o4-hold | 2.0 | 室内で静止 | 照明は変えてません |
| o5-ask  | 1.0 | 静止 | 外から見たことある？ |
| o6-outro| 1.0 | 静止 | outro（URL＋免責） |

o3-in は壁を突き抜ける補間になる。途中で壁の内側に潜り込んで真っ暗になるなら、
中間キーフレームを1つ足すか、窓の開口部を通る経路に直す。

## 出力
- config: marketing/instagram/reels/o-from-outside.reel.json
- framesDir: output/reel-o-from-outside-frames
- outName: reel-o-from-outside.mp4
```

---

## 投稿まわり（6本共通）

**ここが第5弾でいちばん重要な変更。**

- **投稿時刻を 20:00〜20:30 JST に固定する。`addToQueue` を使わず
  `customScheduled` で登録する。** 8/11〜8/16 の実績では 20:00〜20:37 の4本が
  平均リーチ 130.5、12:00台の4本が 105.8、21時以降の2本が 101.5 だった。
  案A・案Bだけが 21時以降・addToQueue で出ており、冒頭2秒の変数を測るはずの2本に
  時刻という別の変数が混ざっている。6本を時刻固定で出して測り直す。
- **CTAは「自分の間取り図を読み込んで」にしない。**「リンクを開くとこの部屋が出ます」に限定する。
  壁の自動認識は未実装で、自分の図面から始める経路はリール直後に踏める行動ではない。
- bioのリンクは `?demo=<key>` の直リンクにする（`src/app/hooks/useProjectPersistence.ts:30`）。
  ①④は share-demo、②は copenhagen、⑤は skipfloor、⑥は hiraya。
- キャプションの型と免責は [docs/instagram-playbook.md](../../../docs/instagram-playbook.md) 5節に従う。
  末尾は問いで終える（動画の最後のテロップと揃える）。
- **登録前に `list_posts` で scheduled を数える。** Buffer 無料プランの予約上限は10件。
  上限に当たったら消化を待って分割登録する。
- 入稿記録は BUFFER-QUEUE-3rd.md と同じ形式で `BUFFER-QUEUE-5th.md` に追記する。

---

## 複数本を1セッションで通す

```
ブランチ claude/ldk-lighting-reel-strategy-8kn4vt で作業する。
第5弾の ① → ② → ⑤ → ④ の順で、1セッションのうちに作る。設計は
marketing/instagram/reels/fifth-wave-six-reels.md、規約は
marketing/instagram/reels/AUDIENCE-AND-FORMAT.md（在庫表だけは設計ファイル1節が正）、
各案の詳細は marketing/instagram/reels/PRODUCTION-PROMPT-5th.md の該当ブロックにある。
まず3つとも読むこと。

## 前提
- 別ターミナルで `npm run dev` が起動済み（http://127.0.0.1:5173/）。
- PRODUCTION-PROMPT-5th.md の「0. 着手前の確認」が済んでいる。
  未実施なら、①に着手する前にそれを先に済ませる。

## 順序の理由
① と ⑤ は追加実装ゼロ。② は applyVariant への家具操作の追加だけ。
④ は実装ゼロだが変化画素のゲートがある。
③ と ⑥ はゲートで死ぬ可能性があるので、この4本が終わってから別セッションで扱う。

## 全体の進め方
1本ずつ完結させる。次へ進む前に必ず `rm -rf output/reel-overlays` を実行する。
フレーム（output/reel-*-frames）は消さない。撮り直さずに再エンコードできるようにしておく。

**1本が失敗しても止まらず次へ進む。** 4本は互いに独立していて、1本の失敗は他を汚さない。
失敗した本は「どこで・何が起きて・次に何を確認すべきか」を記録して次へ移る。
勝手に代替案へ作り変えない。設計と違うものを作るくらいなら作らずに報告する。

## 各本のゲート
- 撮影前に必ず `REEL_SMOKE=1` で3フレームだけ撮り、構図を確認してから本撮影に進む。
- ④ は smoke 後に A/B の変化画素（1080相当へ縮小して |Δ|>12 の割合）を測り、
  40%未満なら画角を詰め直す。それでも下回るなら作らずに捨てる。目視で判定しない。

## 共通で守ること
- 実照度(lux)・IES/LDT配光・照度計算書を保証する表現を入れない。
  メーカー名・型番・価格も出さない。
- テロップは1画面1文・全角14文字以内。設計の文言を勝手に増やさない。
- テロップ帯は y=1000〜1500。主役は画面の上半分に収める。
- 冒頭2.0秒はテキストもロックアップも一切乗せない。「分かりにくい」を理由に足さない。
- 最後は問いで終える。答えを書き足さない。
- 音声は入れない（REEL_WITH_VOICE は使わない）。
- ①⑤は合計光束を揃えない（足す/足さないが判断の中身）。②④は自動的に一致する。
- public/demo 以下のJSONは書き換えない。
- mp4 と設定JSONだけをコミットする。output/ 以下はコミットしない。
- staging / main へマージしない。

## 出力
| 案 | config | framesDir | outName |
|---|---|---|---|
| ① | marketing/instagram/reels/e-how-many-lights.reel.json | output/reel-e-how-many-lights-frames | reel-e-how-many-lights.mp4 |
| ② | marketing/instagram/reels/g-no-furniture-on-plan.reel.json | output/reel-g-no-furniture-frames | reel-g-no-furniture-on-plan.mp4 |
| ⑤ | marketing/instagram/reels/s-stair-at-night.reel.json | output/reel-s-stair-at-night-frames | reel-s-stair-at-night.mp4 |
| ④ | marketing/instagram/reels/h-same-hole-different-optic.reel.json | output/reel-h-same-hole-frames | reel-h-same-hole-different-optic.mp4 |

## 最後に報告すること
4本それぞれについて、次を1つの表にまとめる。
- 成否（完成 / ゲートで破棄 / 失敗）
- 完成したものは尺と、0.0 / 1.9 / 2.1 / 中盤 / 末尾のフレームに何が映っているか
- 破棄・失敗したものは、どの判定値・どのエラーでそうなったか
- 次のセッションで確認すべきこと

「できました」だけで終わらせない。判断できない点は「要確認」と明示し、
推測でパスやAPIを作らない。
```
