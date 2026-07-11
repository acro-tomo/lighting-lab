# ローンチ投稿文ドラフト

marketing-plan.md のコンテンツ型に対応する投稿文の下書き。投稿前に必ず実画像/動画を添付し、URLは `?demo=1` 付きを使う。すべての投稿で「雰囲気比較用・実照度は保証しない」の一言を欠かさない。

共通URL: `https://lighting-lab-46l.pages.dev/?demo=1`

## 1. X ローンチ投稿（型1: Before/After動画添付）

> 新築の後悔ランキング常連の「照明」、契約前に自分の間取りで夜の見え方を試せる無料ツールを作りました。
>
> ・間取り図（PDF/画像）を読み込んで壁と照明を配置
> ・明るさ/色温度を変えて夜のLDKを比較
> ・ブラウザだけ、ログイン不要、無料
>
> ※雰囲気比較用で実照度は保証しません
> （動画: 同じLDKで電球色⇄昼白色を切替）

リプ欄1件目に添付:

> デモの間取り入りで開くリンクはこちら。スマホでも動きます。
> https://lighting-lab-46l.pages.dev/?demo=1
> 気になった点は画面右下の「💬ご意見」から送ってもらえると助かります。

## 2. X 実況スレッド（型2: スクショ連投）

1/ 家の照明計画、図面の丸印だけ見て決めるの不安すぎたので、夜の見え方をブラウザで確認できるツールを自作しました。使い方を実況します
2/ まず間取り図を読み込む。PDFでも画像でもOK。寸法を1辺なぞって縮尺合わせ（スクショ: 2D平面＋背景）
3/ 壁・窓・家具を置いて、照明を配置。ダウンライト、ペンダント、間接照明（テープライト）あたりが揃ってます（スクショ: 配置後の2D）
4/ 3Dに切り替えると夜のLDKに。視点は自由に動かせて、比較したい画は「比較一覧」にストックできます（スクショ: 3D夜景）
5/ ここが本題。明るさと色温度をいじると雰囲気が全然違う。2700Kと5000Kの比較（スクショ2枚並べ）
6/ 「リアル」表示にすると壁や床の反射（間接光）込みでレンダリングされます。数秒待つと画がしっとり収束する（スクショ: パストレ後）
7/ 無料・ログイン不要・ブラウザだけで動きます。デモ間取り入りで開くリンク → https://lighting-lab-46l.pages.dev/?demo=1
※実照度(lux)や施工後の見え方を保証するものではなく、あくまで雰囲気比較用です

## 3. X 議論喚起（型3: 比較画像2枚）

> ダウンライト、「等間隔グリッド配置」と「食卓・ソファなど場所狙い配置」で夜の見え方こんなに変わる。
> どっち派ですか？
> （画像2枚。ツール: https://lighting-lab-46l.pages.dev/?demo=1 ※雰囲気比較用）

## 4. X 色温度クイズ（型5: 画像3枚＋投票）

> 同じLDK、照明の色温度だけ変えました。住むならどれ？
> A: 2700K（電球色）
> B: 3500K（温白色）
> C: 5000K（昼白色）
> （投票つき。正解はないです。自分の間取りで試す→ https://lighting-lab-46l.pages.dev/?demo=1）

## 5. Instagram / Reels キャプション

> 新築・リノベの照明計画、図面だけで決めて後悔しがち。
> 自分の間取り図を読み込んで、夜の見え方をシミュレーションできる無料ツールを作りました🏠💡
> ブラウザで動くのでアプリ不要。プロフィールのリンクから試せます。
> ※雰囲気比較用のツールで、実際の照度や施工後の見え方を保証するものではありません
>
> #家づくり #注文住宅 #照明計画 #新築 #マイホーム記録 #間接照明 #ダウンライト #後悔しない家づくり #ldk #リノベーション

## 6. Show HN（英語）

Title:

> Show HN: A browser-based home lighting simulator with real-time path tracing

First comment:

> I'm planning a house in Japan, and lighting is one of the most common regrets people mention after moving in — but there was no easy way to preview how a lighting plan feels at night.
>
> So I built a free browser tool: import your floor plan (PDF/image), trace the walls, place lights and furniture, then compare how the room looks at night as you change brightness and color temperature. The "realistic" view path-traces the exact scene you're editing (three-gpu-pathtracer + three-mesh-bvh in a worker), so indirect bounce light off walls and floors is included — what you see is what the final render gives you.
>
> It's deliberately NOT a photometric tool: no lux guarantees, no IES/LDT data — it's for comparing mood, and the app says so on screen.
>
> Demo (loads a sample floor plan): https://lighting-lab-46l.pages.dev/?demo=1
> Stack: React 19, Three.js / react-three-fiber, three-gpu-pathtracer, Zustand, Zod, pdfjs-dist. No login, no ads, runs entirely client-side.

## 運用メモ

- 各投稿は素材（画像/動画）ができてから出す。テキストのみでは投稿しない。
- 投稿後24時間はリプライ・引用への反応を最優先（marketing-plan.md Phase 3）。
- 「これで失敗しない」等の断定コピーへの書き換えはしない（免責と矛盾）。
