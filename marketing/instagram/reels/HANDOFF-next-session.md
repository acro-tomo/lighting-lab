# 次セッションへの引き継ぎプロンプト

以下をそのまま新しいセッションに貼る。

````
LDK Lighting Lab（/Users/hoshi/AI/家/照明計画）の Instagram リール運用の続き。

## まず状況を把握する

git checkout claude/instagram-thumbnail-design-vjvc4o
git pull origin claude/instagram-thumbnail-design-vjvc4o

読むもの:
  marketing/instagram/reels/AUDIENCE-AND-FORMAT.md   ← ターゲットと構成の型。判断軸の台帳。最重要
  marketing/instagram/reels/BUFFER-QUEUE-2nd.md      ← 第2弾の登録記録
  marketing/instagram/reels/BUFFER-QUEUE-3reels.md   ← 第1弾の登録記録
  marketing/instagram/reels/HANDOFF-local-codex.md   ← 制作手順
  CLAUDE.md                                          ← 不変条件

PLAN-3reels.md は企画の経緯として残っているだけ。中身は作り直しているので信じないこと。

## 済んでいること

- リール6本を書き出し・仕様チェックPASS・目視確認済み
- 動画は Cloudflare Pages に6本配置済み（mp4はgitにコミットしない方針）
  https://lighting-lab-social-assets.pages.dev/reels/*.mp4
- Buffer 予約6件（無料プラン上限10件）:
  7/31 12:00 コペンハーゲン(リール) / 7/31 20:00 電球色カルーセル(別件)
  8/1 スキップフロア / 8/2 縁側 / 8/3 ロフト / 8/4 南欧
- ターゲットを確定: 間取り確定済みで電気図面の打ち合わせが目前の施主
- 構成の型を確定: s1=3.4秒、再生1.3秒付近でバリアント切替。以降 5.8〜6.0/5.0/3.8秒

## やってほしいこと

1. 8/5以降の在庫がゼロ。毎日投稿を続けるなら新しいリールが要る。
   未使用の判断軸は AUDIENCE-AND-FORMAT.md の台帳にある
   （調光の有無 / 色温度を部屋の中で混ぜるか揃えるか / スイッチの分け方）。
   未使用のデモ間取りは町家だけだが下記の理由で使えないので、既出の間取りで軸を変える。

2. 未実施: プロフィールのリンクに ?utm_source=instagram を付ける（手作業）

## 踏んだ地雷（同じ失敗を繰り返さないこと）

- **描画を見る前に台本を書かない。** 器具の実データ（position/target/beamAngle）を読んで、
  smokeで実際のフレームを見てから文言を決める。これで2案を捨てた。

- **成立しない軸（再検討しないこと）**
  - 町家の奥行き: 奥の座敷は間仕切(z=0)と袖壁(x=0.55, z=-3.4〜-7.42)の裏で、
    土間から構造的に見えない。15mの奥行きは1カットにできない
  - 南欧のビーム角 120°→34°: 合計光束は完全一致するが壁が遠く差が読めない

- **撮影は headed で回す。** REEL_HEADLESS=1 にすると software GL に落ちて
  32秒/フレームになる（headedなら約1.1秒/フレーム、17秒のリールで約10分）。

- **撮影中に ffmpeg（ig:reel-check）を同時に回さない。** 取り合いでフレームレートが落ちる。

- **wrangler pages deploy には --branch main を必ず付ける。**
  付けないと現在のgitブランチ名でプレビュー扱いになり本番が差し替わらない。
  しかも本番は index.html を200で返すフォールバックがあるので、mp4のURLを叩くと
  200が返ってきて成功に見える（中身はHTML）。必ず md5 で照合する。
  デプロイは既存の全mp4を同じdirに入れる（本番エイリアスは最新デプロイを指すため、
  新しいぶんだけ上げると既存の予約投稿が参照するURLが消える）。
  index.html も自分で作り直さないと消える。

- **テロップは 1080x1920 の y=1000〜1500 に載る。** 主役はここより上（画面の上半分）に置く。
  天井が主役なら見上げず、ピッチを下げて天井を上半分へ持ち上げる。

- **settleMs を下げない。** 60msだと描画完成前に撮れて露出が途中状態で焼き付く。
  既定400＋ショット先頭に1200msの暖機が入っている。

- テロップはエンコード時合成なので、文字だけ直すなら撮影不要。
  REEL_CONFIG=<config> REEL_WITH_VOICE=1 node scripts/instagram/encode-reel.mjs

- ナレーションは実測5.8字/秒。ショット尺-0.4秒(xfade)を超えると音声生成が止まる。

## 守ること

- public/demo/** と src/** は読むだけ。書き換えない
- 各リールで変える条件は1つだけ。合計光束（lumens×dimmer/100 の総和）を0.1%以内で揃える。
  揃えないのは「足すか足さないか」自体が判断のときだけ
- 免責の焼き込みとキャプションの免責2行を消さない。
  実照度(lux)やIES/LDT配光を保証する文言、「これが正解」という言い切りを足さない
- 既存のBuffer投稿を上書き・再登録しない（二重投稿になる）。直すなら既存postを編集する
- SNS素材は staging / main に入れない。作業はこのSNS専用ブランチで行う
````

## ブランチについて

SNS素材の置き場は `claude/instagram-thumbnail-design-vjvc4o`（CLAUDE.md 指定）。

リール作業は一時 `claude/lighting-lab-reel-strategy-ahjya2` で進めていたが、
2026-07-31 にこのSNS専用ブランチへマージして一本化した。次からはSNS専用ブランチで作業する。
