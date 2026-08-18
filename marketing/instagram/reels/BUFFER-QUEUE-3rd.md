# Buffer 入稿記録｜判断リール 第3弾（8/5・8/6・8/7）

第1弾（7/30・8/1・8/2）は [BUFFER-QUEUE-3reels.md](BUFFER-QUEUE-3reels.md)、
第2弾（7/31・8/3・8/4）は [BUFFER-QUEUE-2nd.md](BUFFER-QUEUE-2nd.md)。
ターゲットと構成の型は [AUDIENCE-AND-FORMAT.md](AUDIENCE-AND-FORMAT.md)。

> **既存の第1弾・第2弾は登録済みなので、消したり作り直したりしない。**

## 状態（2026-08-01 時点）

| 工程 | ⑦ 調光 | ⑧ 色温度 | ⑨ スイッチ |
|---|---|---|---|
| 設定ファイル | 済 | 済 | 済 |
| smoke構図確認 | 済 | 済 | 済 |
| **IES適用** | 済（DL6灯） | 済（1灯） | 済（DL4灯） |
| 本撮影 | 済（552F） | 済（546F） | 済（546F） |
| エンコード（**音声あり**） | 済 | 済 | 済 |
| 仕様チェック | PASS | PASS | PASS |
| 目視確認 | 済 | 済 | 済 |
| ナレーション音声 | 済 | 済 | 済 |
| Pagesデプロイ | 済 | 済 | 済 |
| md5照合 | 済 | 済 | 済 |
| Buffer登録 | 済(8/8) | 済(8/9) | 済(8/10) |

## 適用したIES（原本は非コミット。再現に必要なので記録する）

`LightFixture.ies` は原本バイト列の SHA-256 を `assetId` として参照するだけで、
原本は端末の IndexedDB (`iesAssets`) にしか入らない。**原本を失うと再現できない。**

| 項目 | 値 |
|---|---|
| ファイル名 | `LGD1000L_LB1_LED2700_70_420.ies` |
| assetId (SHA-256) | `346379850440146fef54d0ef49e6d9b8bc188113ffc6d950a4470d2bd886342c` |
| メーカー / 型番 | PANASONIC / LGD1000L-LB1（天井埋込ダウンライト） |
| 実測値（本リポジトリのパーサー） | peak 211.991cd / 代表ビーム角 88.06° / 全光束 420.29lm |

| リール | 間取り | 対象器具id |
|---|---|---|
| ⑦ | share-demo-project | light-tv-wall-1/2/3、light-kitchen-1/2/3（dl-medium 6灯） |
| ⑧ | dk-copenhagen-apartment | cph-pendant-dining（model: pendant。**この間取りにDLは0灯**） |
| ⑨ | jp-hiraya-engawa | hiraya-dl-1/2/3（dl-glareless）、hiraya-dl-4（dl-narrow） |

⑧はブラケット4灯と球形ペンダント4灯が `supportsIes` の対象外
（`src/utils/iesAssets.ts:65`）なので、IESが載るのは9灯中1灯だけ。

撮影時は `scripts/instagram/capture-decision-reel.mjs` が原本を
IndexedDB へ先に書いてからプロジェクトを流し込む。IESを外した対照を撮るには
`REEL_IES_OFF=1` を付ける。

### IES適用で絵がどう変わったか（実測）

レンダラは決定的で、同条件2回の差は **0.0%**。よって下の差はすべてIES由来。

| リール | IES有無での変化画素 | 平均輝度比 | A⇔B変化画素（IESなし→あり） |
|---|---|---|---|
| ⑦ | 9.0〜11.4% | 0.978〜1.027 | 95.5% → **96.3%** |
| ⑧ | 8.1〜9.9% | 0.933〜0.945 | R-B差 48.5 → 44.7（輝度比 0.953→0.950） |
| ⑨ | 73.8〜91.9% | 0.821〜0.926 | 74.2% → **93.1%** |

**比較の読み取りやすさは3本とも落ちていない**（⑨はむしろ大きく上がった）。
ピーク光度だけ見ると 212cd は元の 985〜2996cd より低いが、IESは光束を保ったまま
配光を 52〜60° から 88° へ広げるため、光溜まりが暗くなるのではなく柔らかく広がる。

### 合計光束（IES適用後）

`fixture.lumens` は書き換わらないが、**描画上の光束はIES側の 420.29lm になる**
（`applyIesToSpotLight` が `intensity = peakCandela × 調光率` を入れるため）。
両条件へ同一に適用しているので、揃え方の設計は保たれている。

| リール | 器具データ上（従来の記載） | IES適用後の実効 |
|---|---|---|
| ⑦ | 5560.00 ⇔ 1390.00 | 4241.74 ⇔ 1060.43（**比は 4.000:1 のまま**） |
| ⑧ | 2093.60 ⇔ 2093.60 | 1917.83 ⇔ 1917.83（**差 0.000% のまま**） |
| ⑨ | 4248.40 ⇔ 1454.40 | 3839.31 ⇔ 1162.67（設計どおり揃えない） |

仕様チェックは3本とも 1080×1920 / 30fps / H.264 / AAC 48kHz ステレオ / 17.000秒 で PASS。
目視は `output/reel-check/<名前>/` の等間隔8枚で行い、テロップの重なり・切れ・免責の可読性・
安全領域を確認した。比較が絵として出ているかは、テロップ帯より上（y=60〜960）だけを
切り出して数値でも確かめてある。

| リール | 条件A | 条件B | 読み取れる差 |
|---|---|---|---|
| ⑦ 調光 | 輝度 70.3 | 輝度 36.1 | 明るさが約2倍 |
| ⑧ 色温度 | R-B 113.4 | R-B 59.0 | **輝度は 82.2 ⇔ 84.0 でほぼ動かず、色だけ振れる** |
| ⑨ スイッチ | 輝度 116.7 | 輝度 90.1 | 点灯範囲 |

⑧が輝度ほぼ一定で色だけ動くのは、合計光束を完全一致させた設計と合っている。

**未完了の理由**: この3本はリモート環境（Linuxコンテナ）で制作した。以下がこの環境に無い。

- **AivisSpeech / 音声生成器**: `scripts/instagram/generate-reel-voice.py` は
  `/Applications/AivisSpeech.app` と `/Users/hoshi/AI/音声/reel-voice-generator/generate_reel_voice.py`
  を要求する。どちらもmacOS側にしか無い。よって**現状のmp4は無音**（無音のAACトラックは入っている）。
- **Cloudflare の認証情報**: `wrangler whoami` が未認証。環境変数にトークンも無い。
- **外向きネットワーク**: `pages.dev` / `api.cloudflare.com` / Buffer API へのHTTPSが
  ネットワークポリシーで遮断されている（CONNECT に 403）。公開ファイルのmd5照合もできない。

## Mac側で実行する手順

ブランチを取得したあと、リポジトリのルートで実行する。`npm run dev` を別ターミナルで起動しておく。

### 1. 音声を付けて書き出す

フレームはリモートで撮影済みだが `output/` はコミットしていないため、**Mac側で撮影からやり直す**。
撮影条件は設定ファイルに全部入っているので、同じ絵になる。
（テロップだけを直したいときは撮影を飛ばして `encode-reel.mjs` だけ回せばよい。
今回もリモート側で、折り返しが不自然だった sub 2か所を再エンコードだけで直している。）

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

### 3. デプロイ（**既存9本**を必ず同じディレクトリに入れる）

> **2026-08-01 に踏んだ罠。** この手順書はもともと「既存6本」と書いていたが、
> 実際に予約投稿が参照している mp4 は **9本**あった。6本だけ入れてデプロイしたところ、
> 8/5・8/6・8/7 の予約が参照する下の3本がデプロイから抜けた。
>
> ```
> reel-copenhagen-dimming.mp4
> reel-ldk-kitchen-light-position.mp4
> reel-hiraya-plant-beam-angle.mp4
> ```
>
> **本番URLは直後もエッジキャッシュのおかげで200 video/mp4 を返し続けたため、
> 本番URLを叩くだけでは異常に気づけなかった。** デプロイ固有URL
> (`https://<id>.lighting-lab-social-assets.pages.dev/...`) を叩いて初めて
> HTMLフォールバックが返ることが分かった。12本入りで再デプロイして復旧済み。
>
> **教訓: 抜けの検出はデプロイ固有URLで行う。本番URLはキャッシュで嘘をつく。**
> 入れるべき本数は `list_posts` で scheduled と sent を両方引いて、
> `assets[].source` を実際に数えてから決める。

本番エイリアスは最新デプロイを指すので、新しい3本だけを上げると
既存の予約投稿が参照しているURLが404になる。`--branch main` を必ず付ける
（付けないとブランチ名のプレビュー扱いになり本番が差し替わらない）。

なお、7/22に投稿済みの `lighting-lab-reel-04-story-voice-fixed.mp4`（ルート直下）は
今回のデプロイに含めていないため配信されない。**投稿済みなのでInstagram側に
取り込み済みで、実害は無い**と判断した（配信元URLは公開後は参照されない）。

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

## 投稿キュー（**予定枠は埋まっていた。要判断**）

投稿時刻は **20:00 JST**。

> **2026-08-01 の実測。** この手順書が想定していた 8/5・8/6・8/7 20:00 は
> **すでに別の3本で埋まっている**（2026-07-31T06:34 に別セッションが登録したもの）。
> 空き枠ではなかった。

Buffer の実状態（organization: My Organization / 予約上限 **10件**、現在 **7件**）:

| 日時(JST) | 既存の予約内容 | 動画 | post ID |
|---|---|---|---|
| 8/1(土) 20:00 | スキップフロア｜壁を照らすか | reel-skipfloor-wall-wash | 6a6ab043bf2d4c6e41991379 |
| 8/2(日) 20:00 | 縁側｜夜の窓 | reel-engawa-window-at-night | 6a6ab076bf2d4c6e41991867 |
| 8/3(月) 20:00 | ロフト｜ペンダントの吊り高さ | reel-loft-pendant-height | 6a6b5dc55f73b8f6cc132148 |
| 8/4(火) 20:00 | 南欧｜天井を照らすか | reel-mediterranean-ceiling | 6a6b5dd847d2f41dce37a3ab |
| **8/5(水) 20:00** | **調光、図面に入っていますか** | reel-copenhagen-dimming | 6a6c41df961582f29ff2fcd5 |
| **8/6(木) 20:00** | **その3灯、天板の上ですか** | reel-ldk-kitchen-light-position | 6a6c41ebb4358423d4b5f182 |
| **8/7(金) 20:00** | **植栽の一部か、全体か** | reel-hiraya-plant-beam-angle | 6a6c41f9cc9eb43b4c2129d9 |

**⑦（調光の有無）は 8/5 の既存投稿と判断軸が重複する**（どちらも調光）。

空き枠は3件（7件 + 3件 = 上限10件ちょうど）。次の空き日時は 8/8・8/9・8/10 の20:00。

**登録実績**（2026-08-01。既存7件には一切触れていない。合計10件＝無料プラン上限ちょうど）:

| 日時(JST) | 内容 | 動画 | post ID |
|---|---|---|---|
| 8/8(土) 20:00 | ⑦ LDK｜調光の有無 | reel-ldk-dimmer-or-not | `6a6d2d6a2368e968d93b749a` |
| 8/9(日) 20:00 | ⑧ コペンハーゲン｜色温度を混ぜるか揃えるか | reel-cph-color-temp-mix | `6a6d2d79f93d764d93833a36` |
| 8/10(月) 20:00 | ⑨ 平屋｜スイッチの分け方 | reel-hiraya-switch-grouping | `6a6d2d86e4816623867690a1` |

Buffer が取り込んだ尺は 17.4s / 17.0s / 17.0s で、ローカルのmp4と一致する。

**上限に達したので、次の登録の前に1件は消化されている必要がある。**

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
