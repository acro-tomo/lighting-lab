// capture-reel-shots.mjs が撮ったフレーム連番を、テロップ付きの 1080x1920 mp4 にまとめる。
//
// 使い方（先に capture-reel-shots.mjs を実行しておく）:
//   node scripts/instagram/encode-reel.mjs
//
// テロップは HTML を Playwright で透過PNGに焼き、ffmpeg で映像に重ねる。
// カルーセル（make-posts.mjs）と同じ書体・配色なので、静止画の投稿と並べても揃って見える。
//
// 出力: marketing/instagram/out/reel-ldk-walkthrough.mp4
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import { BRAND } from "./post-designs.mjs";

const execFileAsync = promisify(execFile);

const FRAMES_DIR = "output/reel-frames";
const OUT_DIR = "marketing/instagram/out";
const BUILD_DIR = "output/reel-overlays";
const WIDTH = 1080;
const HEIGHT = 1920;
const XFADE = 0.4;
const OUT_NAME = "reel-ldk-walkthrough.mp4";

// ショットIDごとのテロップ。capture-reel-shots.mjs の SHOTS と対応させる。
const TEXTS = {
  "s1-establish": { eyebrow: "夜のLDK", headline: ["同じ部屋です"], sub: "間取りも家具も照明の数も変えていません" },
  "s2-color-shift": { eyebrow: "2700K → 6500K", headline: ["色だけ", "動かします"], sub: "明るさは変えていません", accent: "cool" },
  "s3-dining": { eyebrow: "3500K 温白色", headline: ["迷ったらここ"], sub: "LDK全体に使いやすい" },
  "s4-kitchen": { eyebrow: "5000K 昼白色", headline: ["手元が", "よく見える"], sub: "キッチン・洗面・書斎向き", accent: "cool" },
  "s5-outro": { eyebrow: "部屋ごとに変えるのが正解", headline: ["保存して", "打ち合わせへ"], sub: "自分の間取り図で夜のLDKが見えます", outro: true }
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

/** 全角を1、半角を0.55として想定幅を測る。letter-spacing のぶん 0.96 掛けで折り返しを防ぐ。 */
function fitHeadlineSize(lines, contentWidth, maxSize) {
  const widest = Math.max(
    ...lines.map((line) =>
      [...line].reduce((total, char) => total + (/[\x20-\x7E｡-ﾟ]/.test(char) ? 0.55 : 1), 0)
    )
  );
  return Math.min(maxSize, Math.floor((contentWidth * 0.96) / widest));
}

function overlayHtml(text) {
  const accentColor = text.accent === "cool" ? BRAND.cool : BRAND.amber;
  const headlineSize = fitHeadlineSize(text.headline, WIDTH - 200, 112);
  const headline = text.headline.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  const outroBlock = text.outro
    ? `<div class="outro">
        <span class="url">${escapeHtml(BRAND.url)}</span>
        <span class="note">雰囲気を比較するための視覚シミュレーションです。実際の照度(lux)を保証するものではありません。</span>
      </div>`
    : "";

  return `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: "ZenKaku"; src: url("../../marketing/instagram/fonts/ZenKakuGothicNew-Black.ttf"); font-weight: 900; }
  @font-face { font-family: "ZenKaku"; src: url("../../marketing/instagram/fonts/ZenKakuGothicNew-Bold.ttf"); font-weight: 700; }
  @font-face { font-family: "ZenKaku"; src: url("../../marketing/instagram/fonts/ZenKakuGothicNew-Medium.ttf"); font-weight: 500; }
  @font-face { font-family: "InterLL"; src: url("../../marketing/instagram/fonts/Inter-Bold.ttf"); font-weight: 700; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  /* 背景は透過。映像の上に重ねるので、読ませるための暗幕だけ自前で持つ。 */
  html, body { background: transparent; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; position: relative;
    font-family: "ZenKaku", sans-serif; color: ${BRAND.ink};
  }
  .scrim {
    position: absolute; inset: 0;
    background:
      linear-gradient(to bottom, rgba(7,7,6,0.62) 0%, rgba(7,7,6,0) 22%),
      linear-gradient(to top, rgba(7,7,6,0.90) 0%, rgba(7,7,6,0.78) 26%, rgba(7,7,6,0.45) 44%, rgba(7,7,6,0) 60%);
  }
  .lockup { position: absolute; top: 96px; left: 100px; display: flex; align-items: center; gap: 20px; }
  .mark { width: 56px; height: 56px; border-radius: 50%; background: ${BRAND.amber}; display: grid; place-items: center; flex: none; }
  .mark i { width: 22px; height: 22px; border-radius: 50%; background: ${BRAND.base}; display: block; }
  .lockup b { font-size: 30px; font-weight: 700; letter-spacing: 0.06em; font-family: "InterLL", sans-serif; }
  .lockup em { font-style: normal; font-size: 26px; color: ${BRAND.muted}; margin-left: 16px; }
  /* 下から400pxは Instagram のUIと重なるので本文を置かない。 */
  .text { position: absolute; left: 100px; right: 100px; bottom: 400px; }
  .eyebrow { font-size: 38px; font-weight: 700; letter-spacing: 0.08em; color: ${accentColor}; margin-bottom: 24px; }
  h1 { font-size: ${headlineSize}px; font-weight: 900; line-height: 1.16; letter-spacing: 0.01em; }
  h1 span { display: block; white-space: nowrap; }
  .sub { margin-top: 28px; font-size: 38px; font-weight: 500; line-height: 1.5; color: rgba(242,237,225,0.85); }
  .outro { margin-top: 40px; display: flex; flex-direction: column; gap: 16px; }
  .url { font-size: 34px; font-weight: 700; font-family: "InterLL", sans-serif; color: ${BRAND.amber}; }
  .note { font-size: 24px; font-weight: 500; line-height: 1.5; color: ${BRAND.muted}; }
</style>
<div class="scrim"></div>
<div class="lockup">
  <span class="mark"><i></i></span>
  <span><b>${escapeHtml(BRAND.name)}</b><em>${escapeHtml(BRAND.handle)}</em></span>
</div>
<div class="text">
  <p class="eyebrow">${escapeHtml(text.eyebrow)}</p>
  <h1>${headline}</h1>
  <p class="sub">${escapeHtml(text.sub)}</p>
  ${outroBlock}
</div>`;
}

if (!existsSync(`${FRAMES_DIR}/shots.json`)) {
  throw new Error(`${FRAMES_DIR}/shots.json が無い。先に node scripts/instagram/capture-reel-shots.mjs を実行する。`);
}
if (!existsSync("marketing/instagram/fonts/ZenKakuGothicNew-Black.ttf")) {
  throw new Error("フォントが無い。先に npm run ig:fonts を実行する。");
}

const manifest = JSON.parse(await readFile(`${FRAMES_DIR}/shots.json`, "utf8"));
const fps = manifest.fps;
const shots = manifest.shots.filter((shot) => TEXTS[shot.id]);
if (shots.length === 0) throw new Error("shots.json に既知のショットが無い。");

await mkdir(BUILD_DIR, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });

// テロップを透過PNGに焼く。
const prebuiltChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(prebuiltChromium) ? prebuiltChromium : undefined
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
for (const shot of shots) {
  const htmlPath = `${BUILD_DIR}/${shot.id}.html`;
  await writeFile(htmlPath, overlayHtml(TEXTS[shot.id]), "utf8");
  await page.goto(`file://${process.cwd()}/${htmlPath}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${BUILD_DIR}/${shot.id}.png`, omitBackground: true });
  console.log(`overlay=${shot.id}`);
}
await browser.close();

// 各ショット: 連番 → 9:16 に切り出して 1080x1920 → テロップ重ね。
const parts = [];
const durations = shots.map((shot) => shot.frames / fps);
// 転換はどのクリップよりも短くないと xfade が破綻する（REEL_SMOKE=1 の3フレーム等）。
const xfade = Math.max(0, Math.min(XFADE, Math.min(...durations) / 2 - 1 / fps));
shots.forEach((shot, index) => {
  const overlayIndex = shots.length + index;
  const duration = durations[index];
  // 撮影キャンバスは 9:16 より横長なので、中央を 9:16 で切ってから縮める。
  parts.push(
    `[${index}:v]crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=${WIDTH}:${HEIGHT},` +
      `fps=${fps},settb=AVTB,setsar=1,format=yuv420p[b${index}]`
  );
  // テロップは短いフェードで出し入れする。ショットが極端に短い場合は潰れないよう詰める。
  const fade = Math.min(0.4, duration / 4);
  parts.push(
    `[${overlayIndex}:v]format=rgba,fade=t=in:st=0:d=${fade.toFixed(3)}:alpha=1,` +
      `fade=t=out:st=${Math.max(0, duration - fade).toFixed(3)}:d=${fade.toFixed(3)}:alpha=1[o${index}]`
  );
  parts.push(`[b${index}][o${index}]overlay=0:0:format=auto,format=yuv420p[v${index}]`);
});

// xfade は2本ずつしか繋げないので左から畳み込む。
let current = "[v0]";
let elapsed = durations[0];
for (let index = 1; index < shots.length; index += 1) {
  const label = index === shots.length - 1 ? "vout" : `x${index}`;
  const offset = Math.max(0, elapsed - xfade);
  parts.push(`${current}[v${index}]xfade=transition=fade:duration=${xfade.toFixed(3)}:offset=${offset.toFixed(3)}[${label}]`);
  current = `[${label}]`;
  elapsed = elapsed - xfade + durations[index];
}
const outLabel = shots.length === 1 ? "[v0]" : "[vout]";

const args = [];
for (const shot of shots) args.push("-framerate", String(fps), "-i", `${FRAMES_DIR}/${shot.id}/f%04d.png`);
for (const [index, shot] of shots.entries()) {
  args.push("-loop", "1", "-framerate", String(fps), "-t", durations[index].toFixed(3), "-i", `${BUILD_DIR}/${shot.id}.png`);
}
// 無音でも音声トラックを1本持たせる。Instagram 側の扱いが安定するため。
args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
args.push(
  "-filter_complex", parts.join(";"),
  "-map", outLabel,
  "-map", `${shots.length * 2}:a`,
  "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
  "-r", String(fps), "-g", String(fps * 2),
  "-c:a", "aac", "-b:a", "128k",
  "-t", elapsed.toFixed(3),
  "-movflags", "+faststart",
  "-y", `${OUT_DIR}/${OUT_NAME}`
);

console.log(`\nencoding ${elapsed.toFixed(2)}s (${shots.length} shots @ ${fps}fps) -> ${OUT_DIR}/${OUT_NAME}`);
await execFileAsync(ffmpegPath, args, { maxBuffer: 64 * 1024 * 1024 });
await rm(BUILD_DIR, { recursive: true, force: true });
console.log(`reel ready: ${OUT_DIR}/${OUT_NAME}`);
