# Instagram 投稿画像の生成

`out/<postId>/` の PNG がそのまま投稿できる完成物。1フォルダ = 1カルーセル投稿で、
ファイル名の連番がそのままスライドの並び順になる。運用方針は
[docs/instagram-playbook.md](../../docs/instagram-playbook.md)。

## 使い方

```bash
# 1. フォント取得（初回のみ / fonts/ は .gitignore 済み）
npm run ig:fonts

# 2. 背景プレートをアプリから撮る（別ターミナルで npm run dev を起動しておく）
npm run ig:plates

# 2b. 部屋バリエーションのプレートを撮る（1部屋につき「設計した灯り」と「等間隔ダウンライト」の2枚）
npm run ig:rooms
npm run ig:rooms -- jp-machiya-toriniwa --flat-only

# 3. 投稿画像を書き出す
npm run ig:posts

# セーフゾーンのガイド線入りも一緒に出す（入稿前の確認用）
npm run ig:posts -- --guides

# 特定の投稿だけ作り直す
npm run ig:posts -- b-regret-five
```

文言やスライド構成を変えるときは
[`scripts/instagram/post-designs.mjs`](../../scripts/instagram/post-designs.mjs)
の `POSTS` を編集する。ここだけで完結する。

## 現在の投稿

| postId | トピック | 枚数 |
|---|---|---|
| `a-color-temp` | 色温度4種の比べ方 | 7 |
| `b-regret-five` | 照明で後悔する人の共通点5つ | 7 |
| `c-is-warm-dark` | 電球色って本当に暗い？ | 6 |
| `d-machiya-toriniwa` | 京町家リノベ｜天井2.35mの細長い家 | 6 |
| `e-hiraya-engawa` | 和モダンの平屋｜ダウンライト4灯のLDK | 6 |
| `f-skipfloor-tokyo` | 狭小3階建て｜天井4.4mの吹き抜けLDK | 6 |
| `g-copenhagen-apartment` | 北欧の住戸｜ダウンライト0灯の夜 | 6 |
| `h-mediterranean-arch` | 南欧のアーチの家｜壁を照らす夜 | 6 |
| `i-brooklyn-loft` | ロフト｜天井4.2mの大空間を照らす | 6 |

## ディレクトリ

| パス | 中身 | git |
|---|---|---|
| `out/<postId>/` | 完成画像（投稿するのはこれ） | コミットする |
| `plates/` | アプリから撮った背景レンダー | コミットする |
| `fonts/` | Google Fonts の TTF | 除外（スクリプトで再取得） |

背景プレートを毎回同じ部屋で撮ると絵が単調になる。部屋そのものを変えたいときは
[`public/demo/rooms/`](../../public/demo/rooms/README.md) の JSON を使う（`?demo=<key>` で開ける）。
`npm run ig:rooms` はそこを読んで撮影する。

## サイズ

カルーセルは**全スライドを 4:5（1080×1350）で統一**する。途中で比率が変わると
Instagram 側で表示が崩れる。4:5 はフィードで最も表示面積が大きい比率でもある。

リールのカバー（1080×1920）を作る場合はプロフィールグリッドで 3:4 に切られるため、
文字を中央 1080×1080 に収める必要がある。現在の `POSTS` はカルーセルのみ。

## デザイン仕様

### 配色

アプリ本体（`src/styles.css`）と同じ値を使う。フィード全体が製品と地続きに見えるのが狙い。

| 役割 | 値 | 使いどころ |
|---|---|---|
| ベース | `#070706` | 背景・帯 |
| インク | `#F2EDE1` | 見出し（暖色寄りの生成り。純白は使わない） |
| アンバー | `#F5C64D` | アイキャッチ、番号、ロゴマーク、電球色側のラベル |
| クール | `#9BBEDD` | 昼白色・昼光色側のラベル（`accent: "cool"`） |

**なぜ暗い暖色か**: 住宅系のフィードは白基調・自然光の写真で埋まっている。
黒背景＋電球色はスクロール中に明確に浮くうえ、現在制作している投稿テーマ（夜間の照明比較）と一致している。

### フォント

| 用途 | フォント | ウェイト |
|---|---|---|
| 見出し | Zen Kaku Gothic New | 900 |
| 本文 | Zen Kaku Gothic New | 500 |
| アイキャッチ（小見出し） | Shippori Mincho B1 | 700 |
| 番号・数字・英字・URL | Inter | 700 / 900 |

明朝を細く広い字間で1行だけ入れると、ゴシックだけの構成より一段「照明・インテリア」の
文脈に寄る。Inter はアプリ本体の UI フォントと同じ。

### 文字量の上限

- 見出しは **1行あたり全角13文字以内・最大3行**。スマホの一覧では約120px幅で表示される。
- 見出しのサイズは行の長さから自動計算して枠いっぱいに寄せる（表紙 最大132px / 中面 最大104px）。
  中面を一段落とすことで、表紙が主役であることを保っている。
- 1画面で主張するのは1つだけ。

### レイアウト6種

| layout | 構成 | 向いている内容 |
|---|---|---|
| `full` | 画像全面＋下部グラデーション | 世界観・1条件の提示 |
| `band` | 上に画像／下に無地の帯 | 文字量が多いリスト系の表紙（最も読みやすい） |
| `compare` | 画像2枚を左右分割 | Before/After・2条件の比較 |
| `quad` | 画像4枚を2×2 | 「全部並べた」系 |
| `point` | 番号＋見出し＋本文 | カルーセル中面のリスト項目 |
| `outro` | 保存導線と URL | カルーセル最終面 |

`point` / `outro` はレンダー画像を不透明度 0.22 で敷いている。読ませるのが目的なので
質感どまりに落とし、可読性を優先する。

どのレイアウトでも左下のロックアップ（ランプマーク＋`LDK LIGHTING LAB` ＋ `@hosh1.921`）は
同じ位置に出る。グリッド全体が1つの作品として見えることを優先している。

## 背景プレートの作り直し

`scripts/instagram/capture-plates.mjs` は日光を OFF にした夜のシーンで、
色温度プリセット4種を同一アングルで撮る。アングルやシーンを変えたいときは、
アプリ側で好みの状態を作ってプロジェクト JSON を保存し、
`public/demo/` に置いたうえでスクリプトの読み込み先を差し替える。

現在のプレートはすべて同じ部屋・同じアングル。数投稿ごとに別プロジェクトで
撮り直さないとフィードが単調になる。

## リールにAI音声を入れる

実際にカメラを動かすリールは、ショットごとに短い音声を作り、映像の切り替わりに合わせて合成する。
1本の長い読み上げを後から重ねると、台本を直したときに映像との対応が崩れるため使わない。

1. 台本・話者・話速・イントネーションを [`reels/ldk-walkthrough.voice.json`](reels/ldk-walkthrough.voice.json) で直す。
2. `npm run ig:reel-capture` の後に `npm run ig:reel-with-voice` を実行する。

`npm run ig:reel-voice` は、AivisSpeech Engine が未起動ならローカルで起動を待ってから、WAV と cue 情報を `output/reel-audio/` に作る。先に聞き直したいときに使う。起動失敗時のログは `output/reel-audio/aivis-engine.log`。
音声がショットの尺を超える場合は処理を止める。速度を機械的に上げず、台本を短くするか撮影尺を延ばす。
生成は `/Users/hoshi/AI/音声/reel-voice-generator` に委譲する。自然さは短い文・句読点・話速・話者・イントネーションを聞き比べて調整する。

## 6つの間取りリールを作る

別ターミナルで `npm run dev` を起動し、次を実行する。

```bash
npm run ig:six-rooms
```

構成・台本・AivisSpeech設定・入出力先は [`reels/six-rooms.reel.json`](reels/six-rooms.reel.json) で直す。
撮影だけを短く確認する場合は `REEL_SMOKE=1 npm run ig:six-rooms-capture` を使う。
完成動画は `marketing/instagram/out/reel-six-rooms.mp4`、中間フレームと音声はそれぞれ
`output/reel-six-rooms-frames/` と `output/reel-six-rooms-audio/` に出力される。

## 設定ファイルから判断比較リールを作る

別ターミナルで `npm run dev` を起動し、`REEL_CONFIG` に対象の設定ファイルを渡す。最初は3フレームだけ撮影して構図を確認する。

```bash
REEL_CONFIG=path/to/reel.json REEL_SMOKE=1 npm run ig:decision-capture
```

構図を確認した後に本撮影、ローカルAivis音声生成、エンコードを順に実行する。

```bash
REEL_CONFIG=path/to/reel.json npm run ig:decision-capture
python3 scripts/instagram/generate-reel-voice.py path/to/reel.json
REEL_CONFIG=path/to/reel.json REEL_WITH_VOICE=1 npm run ig:decision-encode
```

撮影時は各shotの開始時に元のデモJSONを読み直し、比較条件はメモリ上だけに適用する。ディスク上のデモJSONは書き換えない。

### sequence.mode

| mode | 何をするか |
|---|---|
| `stacked-light-compare` | 上下2分割。下段の照明を等間隔ダウンライトのグリッドに置換する |
| `light-toggle-slide` | 指定IDを途中でONにしながらカメラを横スライド |
| `light-property-animation` | ペンダントのコード長と高さを補間 |
| `fixture-variant-move` | 器具バリアントを切り替えながらカメラを動かす。カメラを止めれば同一フレームのA/B切替 |
| `daylight-split-timelapse` | 上下2分割で同じ時刻を同時に送る。変数は上下のバリアント差だけ |

`fixture-variant-move` と `daylight-split-timelapse` は config 直下の `variants` を参照する。
バリアントは「無効化 / 数値の上書き / 追加」の3操作だけで表す。

```json
"variants": {
  "pendant": {},
  "downlight": {
    "disableLightIds": ["light-dining-pendant"],
    "lightOverrides": { "light-tv-wall-1": { "dimmer": 40 } },
    "addLights": [ { "id": "reel-dining-dl-west", "...": "LightFixture と同じ形" } ]
  }
}
```

### 判断比較リールの設定ファイル

| 設定ファイル | 間取り | 判断 | 出力 |
|---|---|---|---|
| `reels/dining-pendant-vs-downlight.reel.json` | 寸法入り架空LDK | 食卓の上の器具種別 | `reel-dining-pendant-vs-downlight.mp4` |
| `reels/void-pendant-vs-spot.reel.json` | 狭小3階スキップフロア | 吹き抜けの照らし方 | `reel-void-pendant-vs-spot.mp4` |
| `reels/engawa-cove-dusk.reel.json` | 和モダン平屋 | 縁側の建築化照明の要否 | `reel-engawa-cove-dusk.mp4` |

企画の根拠・固定条件・排除した案は [`reels/PLAN-3reels.md`](reels/PLAN-3reels.md)。

### Macでの実行手順

撮影にはGPUが要る。ソフトウェア描画では約46秒/フレームかかるので、CI/コンテナではなくMacで実行する。
音声生成は AivisSpeech（`/Applications/AivisSpeech.app`）と
`/Users/hoshi/AI/音声/reel-voice-generator` に依存する。

```bash
npm install
npm run ig:fonts   # 初回のみ
npm run dev        # 別ターミナルで起動したままにする
```

**まず構図確認**（各3フレームだけ撮る）。カメラ経路は設計値なので、必ずここで見る。

```bash
npm run ig:reel-dining-smoke
npm run ig:reel-void-smoke
npm run ig:reel-engawa-smoke
```

フレームは `output/reel-{dining,void,engawa}-frames/<shotId>/f0000.png`。見るべき点:

| リール | 確認する点 |
|---|---|
| dining | 寄り切った位置（`s2`/`s3`の最終フレーム）で丸テーブルが画面に収まっているか |
| void | チルト上端（`s3`の最終フレーム）で天井と壁の上部が見えているか |
| engawa | `s1`(16:30)で外が明るく、`s3`の最終フレームで暗くなっているか |

ズレていれば設定ファイルの `move` / `daylight` を直してから本番へ。

```bash
npm run ig:reel-dining    # 撮影 → 音声 → エンコードまで通す
npm run ig:reel-void
npm run ig:reel-engawa
```

**最後に必ず検証する。** 「生成した」で完成扱いにしない。

```bash
REEL_CONFIG=marketing/instagram/reels/dining-pendant-vs-downlight.reel.json npm run ig:reel-check
```

仕様（1080×1920 / 30fps / H.264 / AAC / 音声トラックあり）は自動で判定する。
`output/reel-check/<name>/` に等間隔のフレームが出るので、テロップの重なり・比較対象が
見えているか・免責が読めるかは目で確認する。

### 安全領域について（未決）

現在の版面は下端から400px（`.text` は免責ありのとき520px、免責行は420px）を空けている。
1920pxに対して約21%。一方 Meta の広告向けデザイン指針は下35%（672px）を空けることを勧めている。
組織投稿のReels UIと広告の安全領域は同じではないため、**どちらに合わせるかは未決**。
下げる場合は `encode-reel.mjs` の `.text` / `.reel-disclaimer` の `bottom` を上げる。

**比較を成立させるための約束**: 「同じ役割を別の手段で果たす」比較（上2件）は、
バリアント間で**全灯の合計光束を揃える**（`dimmer` で調整）。片方が明るいだけの絵にしないため。
「入れるか入れないか」の比較（縁側の建築化照明）は、光束の差そのものが判断対象なので揃えない。

## 表記の注意

画像にもキャプションにも、実照度(lux)・IES/LDT配光・照度計算書を保証する表現は
入れない（[CLAUDE.md](../../CLAUDE.md) の誠実性の不変条件）。
キャプションの雛形には免責を1行入れてある。
