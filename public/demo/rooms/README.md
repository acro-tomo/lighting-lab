# 投稿用の間取りバリエーション

Instagram の比較リール／カルーセルで **同じ部屋ばかりにならない** ようにするための
プロジェクト JSON 置き場。1ファイル = 1コンセプトで、部屋の形・天井高・照明手法が
すべて別物になるように作ってある。キーの定義は [`src/data/demoRooms.ts`](../../../src/data/demoRooms.ts)。運用方針は
[docs/instagram-playbook.md](../../../docs/instagram-playbook.md)。

## 使い方

1. `npm run dev` でアプリを起動する
2. **`?demo` で選択画面（サムネイル付き）を開く**か、**`?demo=<key>` で直接開く**
   （例: `http://127.0.0.1:5173/?demo=machiya`）。ヘッダーの「プロジェクト読込」から
   `*.json` を選んでも同じ。
3. 日光は **OFF・夜の状態** で保存してあるので、そのまま夜のLDKが出る
   （昼と比べたいときは「日光」を ON にする。日付・時刻・緯度も仕込み済み）
4. 撮影は `npm run ig:rooms`（全部屋。1部屋だけなら `-- <id>`）。色温度や灯数を1つだけ変えて
   撮り直すと、そのまま比較ネタになる

各部屋の投稿は 1部屋 = 1投稿（`d-machiya-toriniwa` 〜 `i-brooklyn-loft`）。
`npm run ig:rooms` は同じカメラ・同じ露出のまま照明だけを「等間隔ダウンライト」に
差し替えた比較用プレート（`room-<id>-flat.png`）も撮る。投稿はこの前後比較を軸にしている。

カメラと露出は各プロジェクトに保存済み。読み込んだ直後の画がそのまま表紙候補になる。

選択画面のサムネイル（`thumbs/*.jpg`）は投稿用プレートから作る。カメラや照明を変えたら
`npm run ig:rooms -- <id> --designed-only` で撮り直し、`npm run demo:thumbs` で作り直す。

## 一覧

| `?demo=` | ファイル | コンセプト | 部屋 (W×D×天井) | 空間の仕掛け | 照明手法 | 投稿ネタ |
|---|---|---|---|---|---|---|
| `machiya` | `jp-machiya-toriniwa.json` | 京町家リノベ｜通り庭と火袋 | 4.2 × 15.0 × 2.35m | 通り庭（土間を全長に通す）＋火袋の吹き抜け | 和紙ペンダント2400K・行灯風ブラケット・障子のアッパー | 「天井2.35mの細長い家は、低い灯りだけで広く見える」 |
| `hiraya` | `jp-hiraya-engawa.json` | 和モダンの平屋｜縁側と建築化照明 | 12.0 × 7.2 × 2.4m | 縁側側の折り上げ天井＋玄関土間 | ダウンライト4灯＋コーブ間接3本 | 「ダウンライト4灯だけで足りる平屋」 |
| `skipfloor` | `jp-skipfloor-tokyo.json` | 都市の狭小3階建て｜スキップフロアのLDK | 7.4 × 8.4 × 4.4m | メザニン（ロフト床）で天井高を2.35 / 4.4m に割る | ロングペンダント1灯＋壁向きスポット＋メザニン間接 | 「天井が高い＝明るい、ではない」 |
| `copenhagen` | `dk-copenhagen-apartment.json` | コペンハーゲンの住戸｜ダウンライトを使わない夜 | 8.6 × 6.4 × 3.25m | 天井3.25mの古い住戸＋北面の縦長窓3つ | **ダウンライト0灯**。低い吊り＋ブラケット計9灯 | 「北欧の家にダウンライトが無い理由」 |
| `mediterranean` | `es-mediterranean-arch.json` | 南欧のアーチの家｜壁を照らす夜 | 9.6 × 8.0 × 3.05m | 現しの梁5本＋アーチ開口＋塗り壁のニッチ | ランタンペンダント2400K＋ブラケット4灯で壁を舐める | 「照らすのは床じゃなくて壁」 |
| `loft` | `us-brooklyn-loft.json` | ブルックリンのロフト｜天井4.2mを照らす | 13.5 × 8.6 × 4.2m | 鋳鉄の柱2本＋スチール工業窓6連 | トラックスポット6灯＋長吊りペンダント5灯 | 「高天井は"低く吊る"で解決する」 |

同じ画にならないように、次の軸を全部ずらしてある。

- **平面比率**: 細長(1:3.6) / 横長(1:0.6) / ほぼ正方形 / 大空間
- **天井高**: 2.35 / 2.4 / 4.4(段違い) / 3.25 / 3.05 / 4.2m
- **断面の仕掛け**: 吹き抜け・折り上げ・メザニン・下げ床（土間）・梁現し
- **色温度**: 2200〜2400K（町家・南欧）/ 2700K（平屋・北欧）/ 3000K（キッチンとロフト）
- **主役の器具**: ペンダント / 建築化照明 / スポット / ブラケット

## 参考にした部屋の傾向

実在の住宅の図面をトレースしたものは1つも無い。各国・各様式の**類型**（間取りの成り立ち、
天井の作り方、夜の灯りの置き方）を下の資料で確認して、寸法と家具配置はこのリポジトリ用に
起こしたオリジナル。

**日本**

- [京町家から学ぶ「通り庭」のススメ｜フロー建築事務所](https://froh-arch.net/sekkei/plan/370/) — 通り庭（見世庭・走り庭）と「ウナギの寝床」の断面
- [京町家を彩る「坪庭」の魅力](https://www.machiya-inn-japan.com/blog/ja/tsuboniwa/) — 細長い敷地に光と風を落とす仕組み
- [住み継がれた京町家｜toolbox](https://www.r-toolbox.jp/stories/usersreport/49362/) — 町家リノベで走り庭がキッチンになる使い方
- [古民家におすすめのアンティーク照明](https://rafuju.jp/antique-log/old-japanese-style-house-lighting-14178) — 和紙・行灯まわりの色温度感
- [「土間のある家」リノベーションアイデア集｜リノベる。](https://www.renoveru.jp/journal/5194) / [土間の実例集｜R+house](https://www.r-plus-house.com/photo-gallery/doma) — 土間の広さと段差（150mm前後）
- [新築住宅の間接照明（建築化照明）の実例40選｜iezoom](https://iezoom.jp/column/entry-2301.html) — 折り上げ天井とコーブの納まり
- [狭小住宅の間取りアイデア｜三菱地所ホーム](https://www.mitsubishi-home.com/column/4765/) / [スキップフロアのある家の間取り事例8選](https://www.heiseikensetu.co.jp/blog/column/housing/) — スキップフロアと吹き抜けの組み合わせ

**海外**

- [Scandinavian lighting ideas｜Livingetc](https://www.livingetc.com/ideas/scandinavian-lighting-ideas) / [Scandinavian design trends 2026](https://www.livingetc.com/ideas/scandinavian-design-trends-2026) — 小さな灯りを複数置く（＝ダウンライトを使わない）作法
- [Spanish modern living & dining rooms with arched doors｜HGTV](https://www.hgtv.com/profiles/professionals/blackband-design/spanish-modern-living-dining-rooms-arched-doors-pictures) / [Spanish style homes guide｜Amitabha Studio](https://www.amitabha.studio/design-blog/spanish-style-homes) — アーチ開口・現し梁・塗り壁の質感とランタン
- [Architectural characteristics of NYC lofts｜Fontan Architecture](https://fontanarchitecture.com/architectural-characteristics-of-nyc-lofts/) / [7 next-level lofts in NYC｜Dwell](https://www.dwell.com/article/best-modern-lofts-new-york-city-fd8780b2) / [Loft interior design ideas｜Mammoth](https://www.mammothnewyork.com/blog/loft-interior-design-ideas) — 鋳鉄柱・工業窓・レンガをスポットで舐める夜の作り方

## 注意

- **誠実性**: これは雰囲気比較用の視覚シミュレーションで、照度(lux)の保証はしない。
  投稿で「◯◯lxになります」といった言い方はしない。
- ルーメン値・色温度は器具カタログの代表値ベース。実機の配光(IES/LDT)ではない。
- 露出はプロジェクトごとに 0.10〜0.13 に調整済み。灯数を増やす編集をしたら露出も見直す。
