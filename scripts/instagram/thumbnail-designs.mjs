// Instagram サムネイルの内容定義。ここだけ編集すれば新しい表紙を追加できる。
//
// 設計の前提（詳細は marketing/instagram/README.md）:
// - format "reel" は 1080x1920 だがプロフィールグリッドで 3:4 に切られるため、
//   文字は中央 1080x1080 のセーフゾーンに収める（レンダラ側で自動的に寄せる）。
// - headline は「1行あたり全角13文字以内・最大3行」。それ以上はスマホの一覧で読めない。
// - plate は marketing/instagram/plates/ のファイル名（拡張子なし）。

export const BRAND = {
  handle: "@hosh1.921",
  name: "LDK LIGHTING LAB",
  // アプリ本体の配色をそのまま使う（src/styles.css と同じ値）。
  base: "#070706",
  ink: "#F2EDE1",
  amber: "#F5C64D",
  cool: "#9BBEDD",
  muted: "rgba(242,237,225,0.52)"
};

/**
 * layout の種類
 * - "full"    : 画像を全面に敷き、下部グラデーションの上に見出し。世界観重視。
 * - "band"    : 上に画像、下に無地の帯。文字量が多いリスト系で最も読みやすい。
 * - "compare" : 画像2枚を左右に分割。Before/After・色温度比較用。
 * - "quad"    : 画像4枚を2x2。「全部並べた」系。
 */
export const DESIGNS = [
  {
    id: "01-color-temp-quad",
    format: "reel",
    layout: "quad",
    plates: ["warm-2700k", "neutral-3500k", "cool-5000k", "daylight-6500k"],
    plateLabels: ["2700K 電球色", "3500K 温白色", "5000K 昼白色", "6500K 昼光色"],
    eyebrow: "同じLDK・同じ家具",
    headline: ["4つの色を", "並べてみた"],
    sub: "あなたの家、どれで打ち合わせしてる？"
  },
  {
    id: "02-warm-vs-cool",
    format: "feed",
    layout: "compare",
    plates: ["warm-2700k", "daylight-6500k"],
    plateLabels: ["電球色 2700K", "昼光色 6500K"],
    eyebrow: "色を変えただけ",
    headline: ["同じ部屋です"],
    sub: "間取りも家具も照明の数も、まったく同じ"
  },
  {
    id: "03-regret-list",
    format: "feed",
    layout: "band",
    plates: ["daylight-6500k"],
    eyebrow: "打ち合わせの前に",
    headline: ["照明で後悔する人の", "共通点 5つ"],
    sub: "図面だけで決めてしまう、が1位",
    accent: "cool"
  },
  {
    id: "04-downlight-regret",
    format: "feed",
    layout: "full",
    plates: ["cool-5000k"],
    eyebrow: "ダウンライト",
    headline: ["「多すぎた」は", "あとから直せない"],
    sub: "天井が穴だらけに見える、の正体"
  },
  {
    id: "05-tool-intro",
    format: "reel",
    layout: "full",
    plates: ["warm-2700k"],
    eyebrow: "無料 / ブラウザだけ",
    headline: ["間取り図を入れると", "夜のLDKが見える"],
    sub: "登録なし・インストールなし",
    note: "雰囲気比較用の視覚シミュレーションです。実照度(lux)を保証するものではありません。"
  },
  {
    id: "06-is-warm-dark",
    format: "feed",
    layout: "band",
    plates: ["warm-2700k"],
    eyebrow: "よくある質問",
    headline: ["電球色って", "本当に暗い？"],
    sub: "明るさ(lm)と色(K)は別の話です"
  }
];
