// Instagram サムネイル生成。scripts/instagram/thumbnail-designs.mjs の定義を HTML に組み立て、
// Playwright で PNG に焼く（scripts/demo-video/make-thumbnail.mjs と同じ方式）。
//
// 事前準備:
//   node scripts/instagram/fetch-fonts.mjs     フォント取得
//   node scripts/instagram/capture-plates.mjs  背景プレート取得（要 npm run dev）
//
// 使い方:
//   node scripts/instagram/make-thumbnails.mjs [--guides] [id ...]
//   --guides を付けるとセーフゾーンのガイド線入りも別名で書き出す（入稿確認用）。
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import { BRAND, DESIGNS } from "./thumbnail-designs.mjs";

const ROOT = "marketing/instagram";
const OUT_DIR = `${ROOT}/out`;
const BUILD_DIR = `${ROOT}/.build`;

const args = process.argv.slice(2);
const withGuides = args.includes("--guides");
const idFilter = args.filter((arg) => !arg.startsWith("--"));

// フィードは 4:5 が最も表示面積が大きい。リールは 1080x1920 だが、
// プロフィールグリッドで 3:4 に切られるため文字は中央 1080x1080 に収める。
const FORMATS = {
  feed: { width: 1080, height: 1350, safeInset: 0 },
  reel: { width: 1080, height: 1920, safeInset: 420 },
  square: { width: 1080, height: 1080, safeInset: 0 }
};

/** 全角を1、半角を0.55として見出しの想定幅を測り、枠いっぱいに寄せた文字サイズを返す。 */
function fitHeadlineSize(lines, contentWidth, maxSize) {
  const widest = Math.max(
    ...lines.map((line) =>
      [...line].reduce((total, char) => total + (/[\x20-\x7E｡-ﾟ]/.test(char) ? 0.55 : 1), 0)
    )
  );
  return Math.min(maxSize, Math.floor(contentWidth / widest));
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

const plateUrl = (name) => `../plates/${name}.png`;

function lockup() {
  return `<div class="lockup">
    <span class="mark"><i></i></span>
    <span class="lockup-text">
      <b>${escapeHtml(BRAND.name)}</b>
      <em>${escapeHtml(BRAND.handle)}</em>
    </span>
  </div>`;
}

function textBlock(design, headlineSize, accentColor) {
  const eyebrow = design.eyebrow
    ? `<p class="eyebrow" style="color:${accentColor}">${escapeHtml(design.eyebrow)}</p>`
    : "";
  const headline = `<h1 style="font-size:${headlineSize}px">${design.headline
    .map((line) => `<span>${escapeHtml(line)}</span>`)
    .join("")}</h1>`;
  const sub = design.sub ? `<p class="sub">${escapeHtml(design.sub)}</p>` : "";
  const note = design.note ? `<p class="note">${escapeHtml(design.note)}</p>` : "";
  return `<div class="text">${eyebrow}${headline}${sub}${note}</div>`;
}

function buildBody(design, format, headlineSize, accentColor) {
  const text = textBlock(design, headlineSize, accentColor);

  if (design.layout === "quad") {
    const cells = design.plates
      .map(
        (plate, index) => `<div class="cell">
          <img src="${plateUrl(plate)}" alt="">
          <span class="cell-label">${escapeHtml(design.plateLabels?.[index] ?? "")}</span>
        </div>`
      )
      .join("");
    // 4分割の上に見出しを重ねるとセルのラベルと必ずぶつかるので、
    // 画像は上部に収め、見出しは無地の下半分に置く。
    return `<div class="media media-grid quad">${cells}</div>
      <div class="media-fade"></div>
      <div class="stack stack-band">${text}</div>
      ${lockup()}`;
  }

  if (design.layout === "compare") {
    const cells = design.plates
      .map(
        (plate, index) => `<div class="cell">
          <img src="${plateUrl(plate)}" alt="">
          <span class="cell-label">${escapeHtml(design.plateLabels?.[index] ?? "")}</span>
        </div>`
      )
      .join("");
    return `<div class="compare">${cells}</div>
      <div class="scrim"></div>
      <div class="stack stack-bottom">${text}</div>
      ${lockup()}`;
  }

  if (design.layout === "band") {
    return `<div class="media"><img src="${plateUrl(design.plates[0])}" alt=""></div>
      <div class="media-fade"></div>
      <div class="stack stack-band">${text}</div>
      ${lockup()}`;
  }

  return `<img class="plate" src="${plateUrl(design.plates[0])}" alt="">
    <div class="scrim"></div>
    <div class="stack stack-bottom">${text}</div>
    ${lockup()}`;
}

function buildHtml(design, showGuides) {
  const format = FORMATS[design.format];
  const pad = 84;
  const headlineSize = fitHeadlineSize(design.headline, format.width - pad * 2, 132);
  const accentColor = design.accent === "cool" ? BRAND.cool : BRAND.amber;
  const zoom = design.plateZoom ?? 1.55;
  const focus = design.plateFocus ?? "62%";
  // reel は画像も含めてセーフゾーンに寄せたいので、上に余白を取って全体を下げる。
  const mediaTop = design.format === "reel" ? 130 : 0;
  const mediaHeight = design.format === "reel" ? 40 : 56;
  const stackLift = design.format === "reel" ? 120 : 168;
  // リールは 3:4 クロップに備え、文字と ロックアップ を中央 1080x1080 に閉じ込める。
  const safeTop = format.safeInset;
  const safeBottom = format.safeInset;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  @font-face { font-family: "ZenKaku"; src: url("../fonts/ZenKakuGothicNew-Black.ttf"); font-weight: 900; }
  @font-face { font-family: "ZenKaku"; src: url("../fonts/ZenKakuGothicNew-Bold.ttf"); font-weight: 700; }
  @font-face { font-family: "ZenKaku"; src: url("../fonts/ZenKakuGothicNew-Medium.ttf"); font-weight: 500; }
  @font-face { font-family: "Shippori"; src: url("../fonts/ShipporiMinchoB1-Bold.ttf"); font-weight: 700; }
  @font-face { font-family: "InterLL"; src: url("../fonts/Inter-Black.ttf"); font-weight: 900; }
  @font-face { font-family: "InterLL"; src: url("../fonts/Inter-Bold.ttf"); font-weight: 700; }

  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${format.width}px; height: ${format.height}px; overflow: hidden; }
  body {
    position: relative; background: ${BRAND.base}; color: ${BRAND.ink};
    font-family: "ZenKaku", sans-serif; -webkit-font-smoothing: antialiased;
  }

  /* プレートは天井と床の余白が広いので、家具まわりへ寄せて切り出す。
     デザイン側で plateZoom / plateFocus を指定すれば上書きできる。 */
  img { display: block; position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; transform: scale(${zoom}); transform-origin: 50% ${focus}; }

  /* 見出しを確実に読ませるための減光。画像の情報量が多いほど深くする。 */
  .scrim { position: absolute; inset: 0; background:
    linear-gradient(180deg, rgba(7,7,6,0.58) 0%, rgba(7,7,6,0.10) 26%,
      rgba(7,7,6,0.35) 52%, rgba(7,7,6,0.93) 84%, rgba(7,7,6,0.98) 100%); }

  .compare { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; }
  .cell { position: relative; overflow: hidden; }
  .cell + .cell { box-shadow: inset 2px 0 0 rgba(242,237,225,0.16); }
  .cell-label {
    position: absolute; left: 26px; top: 26px; z-index: 3;
    font-family: "InterLL", "ZenKaku", sans-serif; font-weight: 900; font-size: 27px;
    letter-spacing: 0.04em; color: ${BRAND.ink};
    background: rgba(7,7,6,0.72); padding: 11px 18px; border-radius: 999px;
    backdrop-filter: blur(2px);
  }
  /* 4分割は上端がグリッドの 3:4 クロップで切れるため、ラベルをセル下端に置く。 */
  .media-grid .cell-label { top: auto; bottom: 22px; }

  /* 上に画像・下に無地の帯。見出しが長い reel ほど画像を浅くして文字の逃げ場を作る。 */
  .media { position: absolute; left: 0; right: 0; top: ${mediaTop}px;
    height: ${mediaHeight}%; overflow: hidden; }
  .media-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .media-fade { position: absolute; left: 0; right: 0;
    top: ${mediaTop + Math.round(((mediaHeight - 18) / 100) * format.height)}px; height: 26%;
    background: linear-gradient(180deg, rgba(7,7,6,0) 0%, ${BRAND.base} 72%); }

  .stack { position: absolute; left: ${pad}px; right: ${pad}px; z-index: 4; }
  .stack-bottom { bottom: ${safeBottom + 168}px; }
  .stack-band { bottom: ${safeBottom + stackLift}px; }

  .eyebrow {
    font-family: "Shippori", serif; font-weight: 700; font-size: 30px;
    letter-spacing: 0.3em; margin-bottom: 26px;
  }
  h1 { font-weight: 900; line-height: 1.26; letter-spacing: -0.015em;
    text-shadow: 0 4px 28px rgba(0,0,0,0.55); }
  h1 span { display: block; }
  .sub { margin-top: 28px; font-weight: 500; font-size: 34px; line-height: 1.5;
    color: rgba(242,237,225,0.78); text-shadow: 0 2px 14px rgba(0,0,0,0.6); }
  .note { margin-top: 22px; font-weight: 500; font-size: 21px; line-height: 1.5;
    color: ${BRAND.muted}; }

  .lockup { position: absolute; left: ${pad}px; bottom: ${safeBottom + 68}px;
    display: flex; align-items: center; gap: 16px; z-index: 5; }
  .mark { width: 42px; height: 42px; border-radius: 50%; border: 2.5px solid ${BRAND.amber};
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 22px rgba(245,198,77,0.45); }
  .mark i { width: 15px; height: 15px; border-radius: 50%; background: ${BRAND.amber};
    box-shadow: 0 0 14px rgba(245,198,77,0.9); }
  .lockup-text { display: flex; flex-direction: column; line-height: 1.25; }
  .lockup-text b { font-family: "InterLL", sans-serif; font-weight: 700; font-size: 22px;
    letter-spacing: 0.18em; }
  .lockup-text em { font-family: "InterLL", sans-serif; font-style: normal; font-weight: 700;
    font-size: 20px; letter-spacing: 0.06em; color: ${BRAND.muted}; }

  .guides { position: absolute; inset: 0; z-index: 9; }
  .guides .safe { position: absolute; left: 0; right: 0; top: ${safeTop}px;
    height: ${format.height - safeTop - safeBottom}px; outline: 3px dashed rgba(245,198,77,0.85); }
  .guides .grid34 { position: absolute; left: 0; right: 0;
    top: ${Math.max(0, (format.height - format.width * (4 / 3)) / 2)}px;
    height: ${Math.min(format.height, format.width * (4 / 3))}px;
    outline: 3px solid rgba(155,190,221,0.75); }
</style></head><body>
  ${buildBody(design, format, headlineSize, accentColor)}
  ${showGuides ? '<div class="guides"><div class="grid34"></div><div class="safe"></div></div>' : ""}
</body></html>`;
}

const targets = DESIGNS.filter((design) => idFilter.length === 0 || idFilter.includes(design.id));
if (targets.length === 0) throw new Error(`no matching design id: ${idFilter.join(", ")}`);
if (!existsSync(`${ROOT}/fonts/ZenKakuGothicNew-Black.ttf`)) {
  throw new Error("fonts missing — run: node scripts/instagram/fetch-fonts.mjs");
}

await mkdir(OUT_DIR, { recursive: true });
await mkdir(BUILD_DIR, { recursive: true });

const prebuiltChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(prebuiltChromium) ? prebuiltChromium : undefined,
  args: ["--disable-dev-shm-usage"]
});

for (const design of targets) {
  const format = FORMATS[design.format];
  if (!format) throw new Error(`unknown format "${design.format}" in design ${design.id}`);

  for (const showGuides of withGuides ? [false, true] : [false]) {
    const suffix = showGuides ? "-guides" : "";
    const htmlPath = `${BUILD_DIR}/${design.id}${suffix}.html`;
    await writeFile(htmlPath, buildHtml(design, showGuides), "utf8");

    const page = await browser.newPage({
      viewport: { width: format.width, height: format.height },
      deviceScaleFactor: 1
    });
    await page.goto(`file://${process.cwd()}/${htmlPath}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const out = `${OUT_DIR}/${design.id}${suffix}.png`;
    await page.screenshot({ path: out });
    await page.close();
    console.log(`thumb=${out} ${format.width}x${format.height}`);
  }
}

await browser.close();
await rm(BUILD_DIR, { recursive: true, force: true });
console.log(`\nthumbnails ready in ${OUT_DIR}`);
