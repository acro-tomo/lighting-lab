# 再現元のフリー素材候補

[room-photo-recreation.md](../reels/room-photo-recreation.md) の `s1-photo` に使う写真の候補。
**選ぶのは人間**。ここは候補URLと、選定基準に照らした所見を並べただけのリスト。

## 重要な制約（このセッションで判明）

このリモート環境からは画像そのものを取得できない。組織のegressポリシーが
`unsplash.com` / `www.pexels.com` / `images.unsplash.com` / `images.pexels.com` /
`cdn.pixabay.com` / `upload.wikimedia.org` をすべて 403 で拒否する。
検索結果のタイトルとaltテキストは読めるが、**画像を見て構図を判定することはできない**。

したがって下表の「所見」は**タイトルとタグからの推測**で、実物を見た評価ではない。
本当の判定はリンクを開いた人間がやる。

## 候補

「夜」＝日光ではなく照明が主役か。「主題」＝どの器具が画の中心か。
◎○△は選定基準（[room-photo-recreation.md](../reels/room-photo-recreation.md#3-フリー素材の選定基準)）への適合の推測。

### Unsplash

| 適合 | 写真 | 撮影者 | 所見（推測） |
|---|---|---|---|
| ◎ | [Recessed ceiling lights illuminate a dark room](https://unsplash.com/photos/recessed-ceiling-lights-illuminate-a-dark-room-v4iXungques) | Tsuyoshi Kozu | **ダウンライトが主題**。灯数比較（`s4-count`）に直結する。ただしタグが architecture / pattern 寄りで、部屋の全景でなく天井の見上げの可能性がある。最初に開いて確認する1枚 |
| ○ | [A dark room with a couch and a lamp](https://unsplash.com/photos/a-dark-room-with-a-couch-and-a-lamp-pTkAf4EHIcE) | Priscilla Du Preez | タグに night / home。夜条件は満たしていそう。ソファとランプだけなら再現は軽い |
| ○ | [A couch in a dark room with a lamp on](https://unsplash.com/photos/a-couch-in-a-dark-room-with-a-lamp-on-TG1_xtcMB1o) | Rafael Garcin | フランス・ラロシェル。dark room / shadows。影が主題なら差し替えの見せ場は作りやすい。灯数が1灯だけだと `s4` が弱くなる |
| ○ | [Modern living room with fireplace and pendant light](https://unsplash.com/photos/modern-living-room-with-fireplace-and-pendant-light-1i33LW920zc) | — | ペンダントは再現しやすい。**暖炉がカタログに無い**ので、そこだけ絵が寄らないリスク |
| △ | [Black floor lamp on living room sofa](https://unsplash.com/photos/black-floor-lamp-on-living-room-sofa-FV3GConVSss) | — | Zoom背景カテゴリ＝広角の全景である見込み。カメラ合わせは楽な可能性 |
| △ | [A dimly lit living room with a couch and lamp](https://unsplash.com/photos/a-dimly-lit-living-room-with-a-couch-and-lamp-8l2iWXLbxnQ) | Maximilian Bungart | film photography タグ。粒状とカラーシフトが乗っていると、再現との比較で「写真の質感」が邪魔になる |
| △ | [A living room with a couch and a floor lamp](https://unsplash.com/photos/a-living-room-with-a-couch-and-a-floor-lamp-ra10HVdQeu0) | Johnny Briggs | ヴィンテージのチェスターフィールド。**家具がカタログで代替しにくい** |
| ✕ | [Two illuminated ceiling lights against a dark background](https://unsplash.com/photos/two-illuminated-ceiling-lights-against-a-dark-background-ZdD4InkQ5-c) | Mavi Atlas | 器具のクローズアップと思われる。部屋が写らないなら再現の題材にならない |
| ✕ | [white ceiling light turned on in a dark room](https://unsplash.com/photos/VtLXPFtkEjw) | — | 同上 |

### Pexels

| 適合 | 写真 | 撮影者 | 所見（推測） |
|---|---|---|---|
| ◎ | [Brown Pendant Lamps](https://www.pexels.com/photo/brown-pendant-lamps-986735/) | — | 「暗い部屋を暖色で照らすスパイラルのペンダント」。夜条件◎・器具が主題◎。造作が少なければ本命 |
| ○ | [Cozy Living Room](https://www.pexels.com/photo/cozy-living-room-15580493/) | Curtis Adams | 不動産系の広角室内を多く出している撮影者。**1点透視の全景**である見込みが高く、カメラ合わせが早い |
| ○ | [Modern Interior with Stylish Table Lamp](https://www.pexels.com/photo/modern-interior-with-stylish-table-lamp-34237532/) | — | 暖色の室内＋テーブルランプ。ただし「interior」止まりで部屋全景かは不明 |
| ○ | [Photo of a Dining Table](https://www.pexels.com/photo/photo-of-a-dining-table-12127444/) | — | ダイニング＋ペンダント。食卓が写っていると生活感が出て刺さりやすい |
| △ | [Interior of cozy living room](https://www.pexels.com/photo/interior-of-cozy-living-room-4468806/) | Keegan Checks | 夜かどうか不明 |
| △ | [A Simple and Cozy Living Room](https://www.pexels.com/photo/a-simple-and-cozy-living-room-2332909/) | — | 棚・椅子・木のテーブルにランプ。家具は代替しやすそう |
| △ | [Modern living room interior with couch and floor lamp](https://www.pexels.com/photo/modern-living-room-interior-with-couch-and-floor-lamp-6970077/) | — | 黄色い壁。壁色が強いと色温度比較（`s3`）が読み取りにくくなる |
| △ | [Interior of modern living room](https://www.pexels.com/photo/interior-of-modern-living-room-4857757/) | — | 北欧系。カタログ家具で寄せやすい |
| ✕ | [Modern Living Room](https://www.pexels.com/photo/modern-living-room-19899071/) | — | natural light（日中）。主題が照明にならない |
| ✕ | [Brown Wooden Dining Table With Beige Pendant Lamp](https://www.pexels.com/photo/brown-wooden-dining-table-with-beige-pendant-lamp-534172/) | — | bright / contemporary（日中寄り） |

### 自分で探す場合の検索入口

上の候補で決まらないときはここから。夜・照明点灯の写真は「dark」「night」「dimly lit」を
入れると一気に絞れる。

- [unsplash.com/s/photos/living-room-night](https://unsplash.com/s/photos/living-room-night)
- [unsplash.com/s/photos/dark-living-room](https://unsplash.com/s/photos/dark-living-room)
- [unsplash.com/s/photos/interior-lighting](https://unsplash.com/s/photos/interior-lighting)
- [pexels.com/search/room lighting/](https://www.pexels.com/search/room%20lighting/)
- [pexels.com/search/ambient lighting/](https://www.pexels.com/search/ambient%20lighting/)
- [pexels.com/search/night lamp/](https://www.pexels.com/search/night%20lamp/)

## 選んだあとの手順

1. 選んだ写真を原寸でダウンロードし、`marketing/instagram/refs/` に
   `<site>-<photo-id>.jpg`（例: `pexels-986735.jpg`）で置く。
   このディレクトリは [.gitignore](../../../.gitignore) 済みで、**画像はコミットされない**。
   フリー素材の再配布を避けるため意図的にそうしてある
2. 撮影者名と写真URLを、下の「採用」節に追記する（キャプションのクレジットに使う）
3. ローカルのClaude Codeで画像を見せれば、`camera.fov` / `position` / `target` の
   追い込みと再現用プロジェクトJSONの作成に進める。
   このリモートセッションからは画像を取得できないので、そこはMac側で回す

## 採用

<!-- 決まったらここに書く
| ショット | 写真 | 撮影者 | URL |
|---|---|---|---|
| s1-photo | | | |
-->
