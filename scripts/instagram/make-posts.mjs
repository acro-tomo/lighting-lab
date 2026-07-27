// Instagram カルーセル投稿の画像生成。scripts/instagram/post-designs.mjs の定義を HTML に組み立て、
// Playwright で PNG に焼く（scripts/demo-video/make-thumbnail.mjs と同じ方式）。
//
// 事前準備:
//   npm run ig:fonts    フォント取得
//   npm run ig:plates   背景プレート取得（要 npm run dev）
//
// 使い方:
//   npm run ig:posts [-- --guides] [-- postId ...]
//   --guides を付けるとセーフゾーンのガイド線入りも別名で書き出す（入稿確認用）。
//
// 出力: marketing/instagram/out/<postId>/NN.png （NN の昇順がカルーセルの並び順）
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import { BRAND, POSTS } from "./post-designs.mjs";

const ROOT = "marketing/instagram";
const OUT_DIR = `${ROOT}/out`;
const BUILD_DIR = `${ROOT}/.build`;

const args = process.argv.slice(2);
const withGuides = args.includes("--guides");
const idFilter = args.filter((arg) => !arg.startsWith("--"));

// カルーセルは全スライドを 4:5 に統一する。途中で比率が変わると表示が崩れる。
const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 84;

// 見出しの最大サイズ。中面は表紙より一段落として、表紙が主役であることを保つ。
const MAX_HEADLINE = { point: 104, outro: 100 };

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

const plateUrl = (name) => `../../plates/${name}.png`;

function lockup() {
  return `<div class="lockup">
    <span class="mark"><i></i></span>
    <span class="lockup-text">
      <b>${escapeHtml(BRAND.name)}</b>
      <em>${escapeHtml(BRAND.handle)}</em>
    </span>
  </div>`;
}

function textBlock(slide, headlineSize, accentColor) {
  const num = slide.num ? `<span class="num">${escapeHtml(slide.num)}</span>` : "";
  const eyebrow = slide.eyebrow
    ? `<p class="eyebrow" style="color:${accentColor}">${escapeHtml(slide.eyebrow)}</p>`
    : "";
  const headline = `<h1 style="font-size:${headlineSize}px">${slide.headline
    .map((line) => `<span>${escapeHtml(line)}</span>`)
    .join("")}</h1>`;
  const sub = slide.sub ? `<p class="sub">${escapeHtml(slide.sub)}</p>` : "";
  const note = slide.note ? `<p class="note">${escapeHtml(slide.note)}</p>` : "";
  return `${num}${eyebrow}${headline}${sub}${note}`;
}

function cells(slide) {
  return slide.plates
    .map(
      (plate, index) => `<div class="cell">
        <img src="${plateUrl(plate)}" alt="">
        ${slide.plateLabels?.[index] ? `<span class="cell-label">${escapeHtml(slide.plateLabels[index])}</span>` : ""}
      </div>`
    )
    .join("");
}

function buildBody(slide, headlineSize, accentColor) {
  const text = textBlock(slide, headlineSize, accentColor);

  if (slide.layout === "quad") {
    // 4分割の上に見出しを重ねるとセルのラベルと必ずぶつかるので、
    // 画像は上部に収め、見出しは無地の下半分に置く。
    return `<div class="media media-grid">${cells(slide)}</div>
      <div class="media-fade"></div>
      <div class="stack stack-band">${text}</div>
      ${lockup()}`;
  }

  if (slide.layout === "compare") {
    return `<div class="compare">${cells(slide)}</div>
      <div class="scrim"></div>
      <div class="stack stack-bottom">${text}</div>
      ${lockup()}`;
  }

  if (slide.layout === "band") {
    return `<div class="media"><img src="${plateUrl(slide.plates[0])}" alt=""></div>
      <div class="media-fade"></div>
      <div class="stack stack-band">${text}</div>
      ${lockup()}`;
  }

  if (slide.layout === "point" || slide.layout === "outro") {
    // 中面は文字が主役。画像は敷いても質感どまりにして可読性を優先する。
    const backdrop = slide.plates?.length
      ? `<div class="backdrop"><img src="${plateUrl(slide.plates[0])}" alt=""></div>`
      : "";
    const link =
      slide.layout === "outro" ? `<p class="link">${escapeHtml(BRAND.url)}</p>` : "";
    return `${backdrop}
      <div class="stack stack-mid">${text}${link}</div>
      ${lockup()}`;
  }

  return `<div class="media media-full"><img src="${plateUrl(slide.plates[0])}" alt=""></div>
    <div class="scrim"></div>
    <div class="stack stack-bottom">${text}</div>
    ${lockup()}`;
}

function buildHtml(slide, showGuides) {
  const headlineSize = fitHeadlineSize(
    slide.headline,
    WIDTH - PAD * 2,
    MAX_HEADLINE[slide.layout] ?? 132
  );
  const accentColor = slide.accent === "cool" ? BRAND.cool : BRAND.amber;
  const zoom = slide.plateZoom ?? 1.55;
  const focus = slide.plateFocus ?? "62%";

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  @font-face { font-family: "ZenKaku"; src: url("../../fonts/ZenKakuGothicNew-Black.ttf"); font-weight: 900; }
  @font-face { font-family: "ZenKaku"; src: url("../../fonts/ZenKakuGothicNew-Bold.ttf"); font-weight: 700; }
  @font-face { font-family: "ZenKaku"; src: url("../../fonts/ZenKakuGothicNew-Medium.ttf"); font-weight: 500; }
  @font-face { font-family: "Shippori"; src: url("../../fonts/ShipporiMinchoB1-Bold.ttf"); font-weight: 700; }
  @font-face { font-family: "InterLL"; src: url("../../fonts/Inter-Black.ttf"); font-weight: 900; }
  @font-face { font-family: "InterLL"; src: url("../../fonts/Inter-Bold.ttf"); font-weight: 700; }

  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    position: relative; background: ${BRAND.base}; color: ${BRAND.ink};
    font-family: "ZenKaku", sans-serif; -webkit-font-smoothing: antialiased;
  }

  /* プレートは天井と床の余白が広いので、家具まわりへ寄せて切り出す。
     デザイン側で plateZoom / plateFocus を指定すれば上書きできる。 */
  img { display: block; position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; transform: scale(${zoom}); transform-origin: 50% ${focus}; }

  /* 見出しを確実に読ませるための減光。 */
  .scrim { position: absolute; inset: 0; background:
    linear-gradient(180deg, rgba(7,7,6,0.58) 0%, rgba(7,7,6,0.10) 26%,
      rgba(7,7,6,0.42) 52%, rgba(7,7,6,0.94) 84%, rgba(7,7,6,0.98) 100%); }

  .compare { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; }
  .cell { position: relative; overflow: hidden; }
  .cell + .cell { box-shadow: inset 2px 0 0 rgba(242,237,225,0.16); }
  .cell-label {
    position: absolute; left: 26px; top: 26px; z-index: 3;
    font-family: "InterLL", "ZenKaku", sans-serif; font-weight: 900; font-size: 27px;
    letter-spacing: 0.04em; color: ${BRAND.ink};
    background: rgba(7,7,6,0.72); padding: 11px 18px; border-radius: 999px;
  }
  /* 4分割はセル下端にラベルを置く。上端だとグリッドのクロップで切れる。 */
  .media-grid .cell-label { top: auto; bottom: 22px; }

  /* 上に画像・下に無地の帯。 */
  .media { position: absolute; left: 0; right: 0; top: 0; height: 56%; overflow: hidden; }
  .media-full { height: 100%; }
  .media-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .media-fade { position: absolute; left: 0; right: 0; top: 38%; height: 26%;
    background: linear-gradient(180deg, rgba(7,7,6,0) 0%, ${BRAND.base} 72%); }

  /* 中面の背景。読ませるのが目的なので質感どまりまで落とす。 */
  .backdrop { position: absolute; inset: 0; overflow: hidden; opacity: 0.22; }

  .stack { position: absolute; left: ${PAD}px; right: ${PAD}px; z-index: 4; }
  .stack-bottom { bottom: 168px; }
  .stack-band { bottom: 168px; }
  .stack-mid { top: 50%; transform: translateY(-50%); }

  .num { display: block; font-family: "InterLL", sans-serif; font-weight: 900;
    font-size: 128px; line-height: 1; color: ${accentColor}; margin-bottom: 24px;
    letter-spacing: -0.02em; }
  .eyebrow { font-family: "Shippori", serif; font-weight: 700; font-size: 30px;
    letter-spacing: 0.3em; margin-bottom: 26px; }
  h1 { font-weight: 900; line-height: 1.26; letter-spacing: -0.015em;
    text-shadow: 0 4px 28px rgba(0,0,0,0.55); }
  h1 span { display: block; }
  .sub { margin-top: 28px; font-weight: 500; font-size: 34px; line-height: 1.6;
    color: rgba(242,237,225,0.78); text-shadow: 0 2px 14px rgba(0,0,0,0.6); }
  .note { margin-top: 22px; font-weight: 500; font-size: 21px; line-height: 1.5;
    color: ${BRAND.muted}; }
  .link { margin-top: 34px; font-family: "InterLL", sans-serif; font-weight: 700;
    font-size: 30px; letter-spacing: 0.06em; color: ${BRAND.amber}; }

  .lockup { position: absolute; left: ${PAD}px; bottom: 68px;
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

  /* 入稿確認用。文字が端に寄りすぎていないかを目視する。 */
  .guides { position: absolute; inset: ${PAD}px; z-index: 9;
    outline: 3px dashed rgba(245,198,77,0.8); }
</style></head><body>
  ${buildBody(slide, headlineSize, accentColor)}
  ${showGuides ? '<div class="guides"></div>' : ""}
</body></html>`;
}

const targets = POSTS.filter((post) => idFilter.length === 0 || idFilter.includes(post.id));
if (targets.length === 0) throw new Error(`no matching post id: ${idFilter.join(", ")}`);
if (!existsSync(`${ROOT}/fonts/ZenKakuGothicNew-Black.ttf`)) {
  throw new Error("fonts missing — run: npm run ig:fonts");
}

await mkdir(BUILD_DIR, { recursive: true });

const prebuiltChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(prebuiltChromium) ? prebuiltChromium : undefined,
  args: ["--disable-dev-shm-usage"]
});

for (const post of targets) {
  const postOut = `${OUT_DIR}/${post.id}`;
  const postBuild = `${BUILD_DIR}/${post.id}`;
  await mkdir(postOut, { recursive: true });
  await mkdir(postBuild, { recursive: true });

  for (const [index, slide] of post.slides.entries()) {
    const seq = String(index + 1).padStart(2, "0");
    for (const showGuides of withGuides ? [false, true] : [false]) {
      const suffix = showGuides ? "-guides" : "";
      const htmlPath = `${postBuild}/${seq}${suffix}.html`;
      await writeFile(htmlPath, buildHtml(slide, showGuides), "utf8");

      const page = await browser.newPage({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: 1
      });
      await page.goto(`file://${process.cwd()}/${htmlPath}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${postOut}/${seq}${suffix}.png` });
      await page.close();
    }
  }
  console.log(`post=${post.id} slides=${post.slides.length} -> ${postOut}/`);
}

await browser.close();
await rm(BUILD_DIR, { recursive: true, force: true });
console.log(`\nposts ready in ${OUT_DIR}`);
