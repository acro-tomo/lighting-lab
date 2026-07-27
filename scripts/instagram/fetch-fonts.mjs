// Instagram サムネイル用の日本語フォントを Google Fonts から取得する。
// フォント実体はリポジトリにコミットせず（サイズが大きいため）、このスクリプトで再取得する。
// 取得先: marketing/instagram/fonts/*.ttf
//
// css2 は User-Agent で返す形式を変える。モダンUAだと unicode-range 分割の woff2 が
// 何十個も返ってくるので、あえて旧UAを送って「1ウェイト=1ファイルの TTF」を受け取る。
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "marketing/instagram/fonts";
const LEGACY_UA = "Mozilla/4.0";

/** @type {{ file: string; family: string; weight: number }[]} */
const FONTS = [
  // 見出し・本文の主役。太さで階層を作るので3ウェイト。
  { file: "ZenKakuGothicNew-Black.ttf", family: "Zen Kaku Gothic New", weight: 900 },
  { file: "ZenKakuGothicNew-Bold.ttf", family: "Zen Kaku Gothic New", weight: 700 },
  { file: "ZenKakuGothicNew-Medium.ttf", family: "Zen Kaku Gothic New", weight: 500 },
  // ブランド行・引用に使う明朝。照明/インテリア文脈の「上質感」担当。
  { file: "ShipporiMinchoB1-Bold.ttf", family: "Shippori Mincho B1", weight: 700 },
  // 数字と英字。アプリ本体の UI フォントと揃える。
  { file: "Inter-Black.ttf", family: "Inter", weight: 900 },
  { file: "Inter-Bold.ttf", family: "Inter", weight: 700 },
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveTtfUrl(family, weight) {
  const spec = `${family.replace(/ /g, "+")}:wght@${weight}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${spec}`;
  const res = await fetch(cssUrl, { headers: { "User-Agent": LEGACY_UA } });
  if (!res.ok) throw new Error(`css2 ${res.status} for ${family} ${weight}`);
  const css = await res.text();
  const match = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
  if (!match) throw new Error(`TTF URL not found in css2 response for ${family} ${weight}`);
  return match[1];
}

await mkdir(OUT_DIR, { recursive: true });

for (const font of FONTS) {
  const dest = path.join(OUT_DIR, font.file);
  if (await exists(dest)) {
    console.log(`skip   ${font.file} (already downloaded)`);
    continue;
  }
  const url = await resolveTtfUrl(font.family, font.weight);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`fetch  ${font.file} (${(buf.length / 1024).toFixed(0)} KB)`);
}

console.log(`\nfonts ready in ${OUT_DIR}`);
