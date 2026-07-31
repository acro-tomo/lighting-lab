# Buffer 入稿記録｜判断リール 第3弾（8/5・8/6・8/7）

第1弾（7/30・8/1・8/2）は [BUFFER-QUEUE-3reels.md](BUFFER-QUEUE-3reels.md)、
第2弾（7/31・8/3・8/4）は [BUFFER-QUEUE-2nd.md](BUFFER-QUEUE-2nd.md)。
ターゲットと構成の型は [AUDIENCE-AND-FORMAT.md](AUDIENCE-AND-FORMAT.md)。

> **未登録。** この3本はまだ Buffer に入っていない。下の「未完了」を読んでから触ること。
> 既存の第1弾・第2弾は登録済みなので、消したり作り直したりしない。

## 状態（2026-07-31 時点）

| 工程 | ⑦ 調光 | ⑧ 色温度 | ⑨ スイッチ |
|---|---|---|---|
| 設定ファイル | 済 | 済 | 済 |
| smoke構図確認 | 済 | 済 | 済 |
| 本撮影 | 進行中 | 進行中 | 進行中 |
| エンコード（**音声なし**） | 進行中 | 進行中 | 進行中 |
| 仕様チェック | 進行中 | 進行中 | 進行中 |
| 目視確認 | 進行中 | 進行中 | 進行中 |
| ナレーション音声 | **未** | **未** | **未** |
| Pagesデプロイ | **未** | **未** | **未** |
| md5照合 | **未** | **未** | **未** |
| Buffer登録 | **未** | **未** | **未** |

**未完了の理由**: この3本はリモート環境（Linuxコンテナ）で制作した。以下がこの環境に無い。

- **AivisSpeech / 音声生成器**: `scripts/instagram/generate-reel-voice.py` は
  `/Applications/AivisSpeech.app` と `/Users/hoshi/AI/音声/reel-voice-generator/generate_reel_voice.py`
  を要求する。どちらもmacOS側にしか無い。よって**現状のmp4は無音**（無音のAACトラックは入っている）。
- **Cloudflare の認証情報**: `wrangler whoami` が未認証。環境変数にトークンも無い。
- **外向きネットワーク**: `pages.dev` / `api.cloudflare.com` / Buffer API へのHTTPSが
  ネットワークポリシーで遮断されている（CONNECT に 403）。公開ファイルのmd5照合もできない。

## Mac側で実行する手順

ブランチを取得したあと、リポジトリのルートで実行する。`npm run dev` を別ターミナルで起動しておく。

### 1. 音声を付けて再エンコードする（撮影はやり直さない）

フレームはリモートで撮影済みだが `output/` はコミットしていないため、**Mac側で撮影からやり直す**。
撮影条件は設定ファイルに全部入っている。

```bash
npm run ig:fonts   # 初回のみ
REEL_CONFIG=marketing/instagram/reels/ldk-dimmer-or-not.reel.json      node scripts/instagram/capture-decision-reel.mjs
python3 scripts/instagram/generate-reel-voice.py marketing/instagram/reels/ldk-dimmer-or-not.reel.json
REEL_CONFIG=marketing/instagram/reels/ldk-dimmer-or-not.reel.json      REEL_WITH_VOICE=1 node scripts/instagram/encode-reel.mjs
```

`cph-color-temp-mix` と `hiraya-switch-grouping` も同じ3行を設定ファイル名だけ替えて回す。
撮影は `REEL_HEADLESS=1` を付けない（software GL に落ちる）。

### 2. 検証

```bash
REEL_CONFIG=marketing/instagram/reels/ldk-dimmer-or-not.reel.json      npm run ig:reel-check
REEL_CONFIG=marketing/instagram/reels/cph-color-temp-mix.reel.json     npm run ig:reel-check
REEL_CONFIG=marketing/instagram/reels/hiraya-switch-grouping.reel.json npm run ig:reel-check
```

### 3. デプロイ（既存6本を必ず同じディレクトリに入れる）

本番エイリアスは最新デプロイを指すので、新しい3本だけを上げると
8/1〜8/4 の予約投稿が参照しているURLが404になる。`--branch main` を必ず付ける
（付けないとブランチ名のプレビュー扱いになり本番が差し替わらない）。

```bash
npx wrangler pages deploy <9本入りのdir> --project-name lighting-lab-social-assets --branch main
```

本番は index.html を200で返すフォールバックがあるため、**HTTPステータスだけで成功と判断しない**。
Content-Type と md5 を必ず照合する。

```bash
curl -sI https://lighting-lab-social-assets.pages.dev/reels/reel-ldk-dimmer-or-not.mp4   # Content-Type: video/mp4 か
curl -s  https://lighting-lab-social-assets.pages.dev/reels/reel-ldk-dimmer-or-not.mp4 | md5
md5 marketing/instagram/out/reel-ldk-dimmer-or-not.mp4
```

### 4. Buffer 登録

**登録前に既存予約を確認する。** 同じ動画URL・同じ投稿名の重複、8/5〜8/7 の既存予約、
無料プラン上限10件を超えないことを見てから作成する。直すときは新規作成ではなく既存postを編集する。

## 動画の配信元（登録後に有効になるURL）

```
https://lighting-lab-social-assets.pages.dev/reels/reel-ldk-dimmer-or-not.mp4
https://lighting-lab-social-assets.pages.dev/reels/reel-cph-color-temp-mix.mp4
https://lighting-lab-social-assets.pages.dev/reels/reel-hiraya-switch-grouping.mp4
```

## 共通の登録設定

第1弾・第2弾と同じ。

| 項目 | 値 |
|---|---|
| channelId | `6a607539e2638b94d7b26c75`（hosh1.921 / instagram business） |
| organizationId | `6a5504c078bb5f9e641df332` |
| mode | `customScheduled` |
| schedulingType | `automatic` |
| metadata.instagram.type | `reel` |
| metadata.instagram.shouldShareToFeed | `true` |
| thumbnailOffset | `1500`（ms） |

## 投稿キュー（予定）

投稿時刻は **20:00 JST**。第1弾は全て20:00、第2弾もロフト8/3・南欧8/4が20:00で、
7/31の12:00は同日20:00に電球色カルーセルが入っていたための一度きりの回避。
直近に登録した2本（8/3・8/4）が20:00なので、それに合わせる。

| 日時 | 内容 | post ID |
|---|---|---|
| 8/5(水) 20:00 | ⑦ LDK｜調光の有無 | 未登録 |
| 8/6(木) 20:00 | ⑧ コペンハーゲン｜色温度を混ぜるか揃えるか | 未登録 |
| 8/7(金) 20:00 | ⑨ 平屋｜スイッチの分け方 | 未登録 |

---

## 7. LDK｜調光、うちにも要りますか

- **投稿予定**: 2026-08-05(水) 20:00
- **動画**: `reel-ldk-dimmer-or-not.mp4`
- **判断の軸**: 調光の有無
- **間取り**: `public/demo/share-demo-project.json`（8.6×6.4×天井2.42m・9灯）
- **変えた条件**: 全灯の `dimmer` のみ（100% ⇔ 25%）。位置・器具・色温度・カメラ・露出は同一
- **合計光束**: 5560.00 ⇔ 1390.00。**揃えていない。**
  調光して減光できるかどうか自体が判断の中身なので、揃えると比較にならない
- **カメラ**: pos(2.80, 2.30, 2.60)→(2.35, 2.28, 2.30) / target(-2.20, 0, -1.40)→(-2.35, 0, -1.45) / fov 84 / exposure 0.19

```
調光、うちにも要りますか。

照明の打ち合わせでは「調光を付けますか」と聞かれます。
器具の数や位置ほど話題にならないまま、決まっていくところです。

同じLDKで、全灯100%のときと、絞ったときを入れ替えました。
器具も位置も色温度もそのままで、動かしたのは明るさだけです。

全開だと部屋のどこも同じ明るさになって、灯りがどこにあるか分からなくなります。
絞ると、灯りを置いた場所だけが残って、部屋に濃淡が出ます。

要るかどうかは、その部屋で夜に何をするかで変わります。

うちの部屋ならどこまで絞るか気になる人は、
プロフィールのリンクから自分の間取り図で試せます。
（登録なし・ブラウザだけで動きます）

※雰囲気を比較するための視覚シミュレーションです。
　実際の照度(lux)や仕上がりを保証するものではありません。

#注文住宅 #照明計画 #マイホーム計画中 #家づくり記録 #新築一戸建て #調光 #調光器 #リビング照明 #ダイニング照明 #ダウンライト #間接照明 #インテリア照明 #家づくり #マイホーム #新築 #一戸建て #おうちづくり #住宅設計 #家づくり打ち合わせ #照明
```

---

## 8. コペンハーゲン｜1つの部屋に、2つの色

- **投稿予定**: 2026-08-06(木) 20:00
- **動画**: `reel-cph-color-temp-mix.mp4`
- **判断の軸**: 色温度を部屋の中で混ぜるか、揃えるか
- **間取り**: `public/demo/rooms/dk-copenhagen-apartment.json`（8.6×6.4×天井3.25m・9灯）
- **変えた条件**: `colorTemperatureK` のみ。
  揃える＝全9灯 2700K ／ 混ぜる＝手元と食卓の5灯（ダイニング／角／ソファ脇／窓辺のペンダントと
  フロアランプ代わりの吊り）だけ 5000K、壁のブラケット4灯は 2700K のまま
- **合計光束**: 2093.60 ⇔ 2093.60（差 **0.000%**）。
  色温度は輝度正規化して扱う実装（`photometric/src/core/color.ts`）なので、
  Kを変えても光束は動かない
- **カメラ**: pos(-3.10, 2.30, 2.80)→(-2.70, 2.24, 2.50) / target(2.00, 0.80, -1.90)→(2.10, 0.80, -1.95) / fov 82 / exposure 0.10。
  第2弾④は同じ間取りを南東から西向きに撮っている。こちらは南西から東向きで、画角が重ならない

```
1つの部屋に、2つの色。

電球色か昼白色か。部屋ごとには決めても、
同じ部屋の中で混ぜるかどうかは、あまり聞かれません。

同じリビングダイニングで、食卓まわりの灯りだけを白い光にして、
壁を照らす灯りは電球色のままにしました。
変えたのは色温度だけで、合計の明るさは同じです。

揃えると、部屋がひと続きに見えます。
混ぜると、食べる場所とくつろぐ場所が分かれて見えます。

どちらが向いているかは、その部屋で何をするかで変わります。

うちのLDKなら揃えるか気になる人は、
プロフィールのリンクから自分の間取り図で試せます。
（登録なし・ブラウザだけで動きます）

※雰囲気を比較するための視覚シミュレーションです。
　実際の照度(lux)や仕上がりを保証するものではありません。

#注文住宅 #照明計画 #マイホーム計画中 #家づくり記録 #新築一戸建て #色温度 #電球色 #昼白色 #ペンダントライト #ブラケットライト #ダイニング照明 #リビング照明 #インテリア照明 #家づくり #マイホーム #新築 #おうちづくり #住宅設計 #家づくり打ち合わせ #照明
```

---

## 9. 平屋｜スイッチ1つだと、全部いっしょに点きます

- **投稿予定**: 2026-08-07(金) 20:00
- **動画**: `reel-hiraya-switch-grouping.mp4`
- **判断の軸**: スイッチの分け方
- **間取り**: `public/demo/rooms/jp-hiraya-engawa.json`（12×7.2×天井2.4m・12灯）
- **変えた条件**: 点灯する回路のみ。
  1回路＝12灯すべて点灯 ／ 分ける＝玄関とリビングの4灯（グレアレスDL リビング西・東、
  玄関DL、玄関ブラケット）だけ点灯し、キッチン手元DL・縁側の建築化照明3本・
  ダイニングペンダント2灯・植栽スポット・飾り棚の間接を消灯。
  器具は撤去ではなく `disableLightIds` で消灯している（本体は画に残る）
- **合計光束**: 4248.40 ⇔ 1454.40。**揃えていない。**
  どの回路を点けるか自体が判断の中身なので、揃えると比較にならない
- **カメラ**: pos(2.40, 2.32, -0.20)→(2.00, 2.30, -0.05) / target(-3.20, 0, 1.00)→(-3.30, 0, 1.05) / fov 82 / exposure 0.115。
  第1弾③は同じ間取りを北西から南東（縁側向き）に撮っている。こちらは東から西向きの俯瞰で重ならない

```
スイッチ1つだと、全部いっしょに点きます。

照明の数は図面で数えられますが、
どれとどれを同じスイッチにするかは、図面を見ても想像しにくいところです。

同じ平屋で、全部を1つの回路にした場合と、
玄関とリビングだけを別の回路にした場合を入れ替えました。
器具は減らしていません。変えたのは点ける範囲だけです。

まとめると、帰ってきて1つ押すだけで全部点きます。
分けると、使うところだけ点けられます。そのぶんスイッチは増えます。

いくつに分けるかは、その部屋の使い方で変わります。

うちならいくつに分けるか気になる人は、
プロフィールのリンクから自分の間取り図で試せます。
（登録なし・ブラウザだけで動きます）

※雰囲気を比較するための視覚シミュレーションです。
　実際の照度(lux)や仕上がりを保証するものではありません。

#注文住宅 #照明計画 #マイホーム計画中 #家づくり記録 #新築一戸建て #スイッチ #照明スイッチ #平屋 #縁側 #間接照明 #建築化照明 #和モダン #リビング照明 #インテリア照明 #家づくり #マイホーム #新築 #おうちづくり #住宅設計 #照明
```

---

## 投稿とは別に、手でやること（第1弾から未実施のまま）

**プロフィールのリンクに `?utm_source=instagram` を付ける。**

```
https://lighting-lab-46l.pages.dev/?utm_source=instagram
```
