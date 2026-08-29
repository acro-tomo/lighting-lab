# 制作プロンプト（Mac側のClaude Codeに渡す）

[room-photo-recreation.md](room-photo-recreation.md) のリールを実際に作るための指示文。
3フェーズに分けてある。**1本にまとめて投げない** — 再現の出来を見てから撮影に進む必要がある。

前提: ブランチ `claude/room-photo-recreation-reel-3xvzcg` を取得していること。
採用写真の配置はフェーズ0でやる。

---

## フェーズ0｜採用写真を配置する

画像ホストに到達できる環境で実行する。Claude Code on the web の既定の
egressポリシーは `images.pexels.com` を403で拒否するので、そこでは通らない。

```
LDK Lighting Lab のリール素材として、Pexelsの写真を1枚リポジトリに配置する。

対象: Cozy Living Room / 撮影 Curtis Adams
ページ: https://www.pexels.com/photo/cozy-living-room-15580493/

手順:
1. ブランチ claude/room-photo-recreation-reel-3xvzcg を最新にする。
2. 上のページから原寸（Original）をダウンロードする。
   直リンクは https://images.pexels.com/photos/15580493/pexels-photo-15580493.jpeg
   の形式と思われるが未検証。通らなければページのダウンロードボタンの遷移先を使う。
3. marketing/instagram/refs/pexels-15580493.jpg として保存する。
   .jpeg で落ちてきたら .jpg にリネームする。
4. 検証する:
   - ファイルが存在し、1MB以上ある
   - 画像として開ける。幅1920px以上（リールは1280×2276で撮るので原寸が要る）
   - 実際に開いて中身を見る。グレーの壁・L字のグレーのソファ・シーリングファン・
     幾何柄のラグ・木製TVボードが写った、昼間のリビングであること。
     違う写真が落ちていたら止めて報告する。

制約:
- この画像はコミットしない。marketing/instagram/refs/*.jpg は .gitignore 済みで、
  フリー素材の再配布を避けるため意図的に除外している。git add -f で強制追加しない。
- 画像以外のファイルは変更しない。
- 画像ホストに到達できない場合は、別経路を探さずその旨を報告して止まる。
```

---

## フェーズ1｜写真から部屋を再現する

```
marketing/instagram/refs/pexels-15580493.jpg を見て、この部屋を LDK Lighting Lab で再現する。

1. 写真から読み取る: 部屋の概寸（W×D×天井高）、カメラのアイレベルと画角、窓と開口の位置、
   主要家具の配置、点いている照明の種類と位置。読み取れないものは推定と明示する。
2. public/demo/rooms/*.json と同じ形式でプロジェクトJSONを作り、
   marketing/instagram/reels/room-photo-recreation.project.json に置く。
   public/demo/rooms/ には入れない（「サンプルの部屋」の選択画面に出さない）。
3. camera.fov / position / target を写真に合わせる。npm run dev で開き、写真と3Dを並べて
   消失点とアイレベルが合うまで追い込む。写真は広角で撮られていることが多いので fov 70〜80 から始める。
4. 写真は昼のカットなので、まず日光ONの昼の状態で写真に合わせる。
   合ったら日光OFFの夜の状態も作り、同じJSONに保存できる形にする（s3-night で昼→夜に落とすため）。
   露出は 0.10〜0.13 の範囲で調整する。

読み取り済みの寸法・開口・家具・カメラの推定は
marketing/instagram/reels/room-photo-recreation.source.md にある。そこから始める。

制約: 専用の3Dモデルは足さない。アプリ標準の壁・窓・開口・扉と、家具/器具カタログの
既製オブジェクトだけで作る。写真そっくりを狙わず、間取りと灯りの構成が写し取れていればよい。

検証: npm run typecheck を通す。見え方は npm run visual-check で確認する。
最後に、写真と再現の並びを見せて、s2-recreate として成立するか判断させてほしい。
```

## フェーズ2｜写真ショットを撮れるようにする

```
scripts/instagram/capture-decision-reel.mjs に still-image ショットモードを足す。

- shot の sequence.mode: "still-image" と imagePath を受け付ける。
  ffmpeg -loop 1 で指定尺のフレーム列に展開する。
  既存の captureStackedCompare が ffmpeg を呼んでいるので、同じ組み立て方に合わせる。
- 出力フレームは VIEWPORT (1280×2276) に合わせる。写真の比率が違うので
  force_original_aspect_ratio=increase + crop で埋める。
- scripts/instagram/encode-reel.mjs の xfade はいま全クリップ一律なので、
  shot ごとに長さを指定できるようにする。未指定なら現在の挙動のまま。

あわせて sequence.mode: "daylight-fade" も足す。daylight の強度を補間して昼から夜へ落とす。
既存の light-property-animation と同じ作りで、動かす対象が日光になるだけ。

制約: 既存3モード（stacked-light-compare / light-toggle-slide / light-property-animation）の
挙動は変えない。

検証: npm run typecheck。REEL_SMOKE=1 で3フレームだけ撮り、写真ショットが出ることを確認する。
```

## フェーズ3｜構成JSONを書いて書き出す

```
marketing/instagram/reels/room-photo-recreation.reel.json を作り、リールを書き出す。

構成は marketing/instagram/reels/room-photo-recreation.md の「1. 推奨構成A」の表の通り。
7ショット・21.5秒。テロップ（eyebrow / headline / sub）と voice もその表から取る。
speakerId / speed / intonation / tempoDynamics は six-rooms.reel.json と同じ値にする。

- s1-photo: still-image モード、imagePath は marketing/instagram/refs/pexels-15580493.jpg
- s2-recreate 以降: projectFile は marketing/instagram/reels/room-photo-recreation.project.json
- s3-night: daylight-fade モードで昼から夜へ落とす
- s1→s2 の xfade だけ 0.6s。他は既存のまま
- 画面内に「Photo: Curtis Adams / Pexels」を小さく出す（プレイブック6-5の例外条件）

テロップは reel.json の shots[].text（eyebrow / headline / sub）に書く。
encode-reel.mjs は REEL_CONFIG があればそこから読む（ファイル冒頭のSHOT_TEXTはフォールバック）。
出力名は config の outName に reel-room-photo-recreation.mp4 と書く。

手順:
1. REEL_SMOKE=1 REEL_CONFIG=... npm run ig:decision-capture で構図確認
2. 本撮影
3. python3 scripts/instagram/generate-reel-voice.py で音声
4. REEL_CONFIG=... REEL_WITH_VOICE=1 npm run ig:decision-encode

検証:
- ffprobe で 1080×1920 / 尺 22.0秒 ±0.5 / 音声トラックあり を確認する
- 0.5s・3.0s・6.0s・10.0s・14.0s のフレームを抜き出して目視する。
  順に 写真 / 昼の再現 / 夜 / 色温度スイープ / 灯数比較 になっていること
- 音声がショット尺を超えたら止めて報告する。話速を上げて詰めない
  （台本を短くするか撮影尺を延ばす）

完成物は marketing/instagram/out/reel-room-photo-recreation.mp4。
中間フレームと音声は output/ 配下に出るので、これはコミットしない。
```

## 投稿時の注意

キャプションは [room-photo-recreation.md](room-photo-recreation.md#8-キャプション案) の雛形を使い、
`<撮影者名>` を **Curtis Adams** に、出典を **Pexels** に置き換える。免責の2行は必ず残す。
