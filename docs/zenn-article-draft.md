# Zenn記事ドラフト

技術軸ローンチ用（marketing-plan.md 2章）。技術内容は実コード（rendering/pathTracer.ts、utils/lighting.ts、docs/lighting-calibration-report.md）と照合済み。公開前の残作業はスクリーンショット差し込みのみ。

---

title: ブラウザだけで動く「夜の照明シミュレーター」を作った — three-gpu-pathtracerでWYSIWYGパストレーシング
emoji: 💡
type: tech
topics: [threejs, react, webgl, typescript, 個人開発]

---

## 作ったもの

家を建てるとき、入居後の後悔として必ず挙がるのが「照明」です。図面のダウンライト記号を眺めても、夜のLDKがどう見えるかは分かりません。そこで、間取り図（PDF/画像）を読み込み、壁と照明を配置して、明るさ・色温度を変えながら夜の見え方を比較できる無料ブラウザツールを作りました。

デモ間取り入りで開くリンク: https://lighting-lab-46l.pages.dev/?demo=1

先に断っておくと、これは照度計算ツールではありません。実照度(lux)やIES/LDT配光は扱わず、「雰囲気の比較」に特化しています（画面にも常時表示しています）。この記事はその実装の話です。

スタック: Vite / React 19 / TypeScript / Three.js + @react-three/fiber + @react-three/drei / three-gpu-pathtracer + three-mesh-bvh / Zustand / Zod / pdfjs-dist

## 1. 編集シーンをそのままパストレする（WYSIWYG）

照明の「見え方」を比較するツールで一番怖いのは、編集画面と最終画像で印象が違うことです。そこで表示モードを2つにしました。

- **編集（ラスター）**: WebGLRendererによるリアルタイム描画。配置・操作用。
- **リアル（常駐パストレ）**: 編集中のシーングラフを**そのまま** three-gpu-pathtracer に渡す。カメラ静止後、壁・天井・床の反射（間接光）込みで数秒かけて収束する。

同一シーンを共有するため「見たまま＝最終結果」になります。代償として、ラスター用の非物理な演出（補助光・霧・接地影・選択ハイライト）はパストレ時に必ず無効化する必要があり、これをアプリの不変条件にしています。片方だけに写る要素が1つでもあるとWYSIWYGが嘘になるからです。

[スクショ: ラスター vs パストレ収束後の同一アングル比較]

## 2. BVH構築をworkerに逃がす

three-gpu-pathtracerはレンダリング前にシーンのBVH（three-mesh-bvh）構築が必要で、メインスレッドでやるとその間UIが完全に止まります。ここは自前でworkerを書く必要はなく、three-mesh-bvhが提供する `GenerateMeshBVHWorker` を `WebGLPathTracer.setBVHWorker()` に渡すだけでBVH構築がWeb Worker側に逃げます。

```ts
import { GenerateMeshBVHWorker } from "three-mesh-bvh/src/workers/index.js";

const pathTracer = new WebGLPathTracer(renderer);
const bvhWorker = new GenerateMeshBVHWorker();
pathTracer.setBVHWorker(bvhWorker);
```

構築中は進捗コールバックで「BVH生成中」の表示を出し、その後のサンプリングは `renderSample()` を1サンプルずつ回して毎回 `requestAnimationFrame` に返す（進捗バー更新と `AbortSignal` チェックをここに挟む）ことで、長時間レンダー中でも停止ボタンが効くようにしています。高負荷モードではタイル分割（`pathTracer.tiles`）で1フレームあたりのGPU占有も抑えます。

高解像度PNG書き出し用の最終レンダーは、編集シーンとは別に、プロジェクトデータから軽量なレンダー専用シーンを再構築します。ビューポートの常駐パストレ（同一シーン共有）とは役割を分けています。

## 3. ルーメン・色温度をThree.jsの光に落とす

ユーザーが入力するのは照明器具のカタログ値（光束lm、色温度K、ビーム角）です。これをThree.jsの光へ変換しますが、**ラスター用とパストレ用で変換式を分けています**。

- 色温度→RGB: 黒体放射の近似式（Tanner Helland系）でKelvinをRGBに変換。1000〜12000Kでクランプ
- パストレ側: 調光(%)を掛けたlmを**そのまま `light.power` に渡す**（物理単位）。AmbientLight/HemisphereLightは一切足さず、Multiple Importance Samplingを明示的に有効化
- ラスター側: 同じlmに器具タイプ別の経験係数（ダウンライト0.0062、ペンダント/テープ0.0048、ブラケット0.0032）を掛けて表示用intensityへ

この分離に落ち着くまでに一度「パストレすると画面が真っ黒」という事故を踏んでいて、原因調査の結論が面白かったので共有します。犯人は3つありました。

1. **ジオメトリ**: 部屋の外殻をboxで作っていたため、光を受ける内側の面が曖昧で、不要な暗い側面が生じていた → 法線を室内に向けた片面planeで部屋を組み直し
2. **光の単位**: lmを一度「表示用係数」で変換した値を、パストレ側でさらに乗算していた（二重変換）→ パストレは素のlm（`power`）に統一
3. **シーン分離**: リアルタイムプレビューには補助光が入っていたので、プレビューが明るくてもパストレの正しさの証明になっていなかった

露出やカラースペース（ACES/SRGB）を疑いがちですが、実測ではそこは主因ではありませんでした。教訓: 「物理レンダラーに渡す値は物理単位のまま渡す」。

細かい例をもう1つ。壁付ブラケットの点光源は壁に密着させると `decay=2` の逆二乗で至近の壁が白飛びします。照射方向へ数cm室内側にオフセットする補正を入れていますが、この式をラスターとパストレで共有することでWYSIWYGを守っています。

## 4. PDF間取り図の取り込み

pdfjs-distでPDF1ページ目をcanvasにラスタライズして2D平面ビューの背景に敷き、実寸の分かる1辺をなぞって縮尺キャリブレーションします。壁の自動認識はやっていません（背景の上に手で壁をなぞる割り切り）。SVG背景はiOSのピンチ操作中に毎フレーム再ラスタライズされて操作不能になる罠があり、PNGに変換して保持しています。

## 5. その他の設計判断

- 状態はZustand一本。undo/redoはプロジェクトスナップショットで実装
- 保存はIndexedDB自動保存＋プロジェクトJSON書き出し。読込時はZodでスキーマ検証し、壊れたデータはデモで起動
- ログイン・課金・広告なし。書き出しPNGにアプリ名とURLの透かしだけ入れる

## まとめ

「照度を保証しない」と割り切ったことで、パストレーシングの画づくりに集中できました。家づくり中の方は自分の間取りで試してみてください。

https://lighting-lab-46l.pages.dev/?demo=1

フィードバックはアプリ右下の「💬ご意見」からどうぞ（GitHub Issueに直接届きます）。
