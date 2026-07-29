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
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import { BRAND } from "./post-designs.mjs";

const execFileAsync = promisify(execFile);

const CONFIG_PATH = process.env.REEL_CONFIG;
const reelConfig = CONFIG_PATH ? JSON.parse(await readFile(CONFIG_PATH, "utf8")) : null;
const FRAMES_DIR = reelConfig?.framesDir ?? "output/reel-frames";
const OUT_DIR = "marketing/instagram/out";
const BUILD_DIR = "output/reel-overlays";
const WIDTH = 1080;
const HEIGHT = 1920;
const XFADE = 0.4;
const OUT_NAME = reelConfig?.outName ?? "reel-ldk-walkthrough.mp4";
const WITH_VOICE = process.env.REEL_WITH_VOICE === "1";
const AUDIO_MANIFEST = `${reelConfig?.audioDir ?? "output/reel-audio"}/manifest.json`;
const VOICE_COMMAND = reelConfig
  ? `python3 scripts/instagram/generate-reel-voice.py ${CONFIG_PATH}`
  : "npm run ig:reel-voice";

// 平坦な面（キッチンの天板・壁）は緩いグラデーションなので、8bitに落とすと
// 帯や粒状のムラが出やすい。gradfun で均してから符号化する。
// 数値は環境変数で振れるようにして、撮り直さずに詰められるようにする。
const CRF = process.env.REEL_CRF ?? "17";
const DEBAND = process.env.REEL_DEBAND !== "0";
const DEBAND_STRENGTH = process.env.REEL_DEBAND_STRENGTH ?? "1.2";

// ショットIDごとのテロップ。capture-reel-shots.mjs の SHOTS と対応させる。
const DEFAULT_TEXTS = {
  "s1-establish": { eyebrow: "夜のLDK", headline: ["同じ部屋です"], sub: "間取りも家具も照明の数も変えていません" },
  "s2-color-shift": { eyebrow: "2700K → 6500K", headline: ["色だけ", "動かします"], sub: "明るさは変えていません", accent: "cool" },
  "s3-dining": { eyebrow: "3500K 温白色", headline: ["迷ったらここ"], sub: "LDK全体に使いやすい" },
  "s4-kitchen": { eyebrow: "5000K 昼白色", headline: ["手元が", "よく見える"], sub: "キッチン・洗面・書斎向き", accent: "cool" },
  "s5-outro": { eyebrow: "部屋ごとに変えるのが正解", headline: ["保存して", "打ち合わせへ"], sub: "自分の間取り図で夜のLDKが見えます", outro: true }
};
const TEXTS = reelConfig
  ? Object.fromEntries(reelConfig.shots.map((shot) => [shot.id, shot.text]))
  : DEFAULT_TEXTS;

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

function overlayHtml(text, disclaimer) {
  const isSplit = text.visual?.kind === "split";
  const accentColor = text.accent === "cool" ? BRAND.cool : BRAND.amber;
  const headlineSize = fitHeadlineSize(text.headline, WIDTH - 200, 112);
  const headline = text.headline.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  const ctaBlock = text.cta ? `<p class="cta">${escapeHtml(text.cta)}</p>` : "";
  const disclaimerBlock = disclaimer
    ? `<p class="reel-disclaimer">${escapeHtml(disclaimer)}</p>`
    : "";
  const visualBlock = text.visual?.kind === "split"
    ? `<div class="split-rule"></div>
      <span class="compare-label compare-label-top">${escapeHtml(text.visual.topLabel)}</span>
      <span class="compare-label compare-label-bottom">${escapeHtml(text.visual.bottomLabel)}</span>`
    : text.visual?.kind === "ruler"
      ? `<div class="ruler">
          <span class="ruler-top">${escapeHtml(text.visual.topLabel)}</span>
          <span class="ruler-line"></span>
          <span class="ruler-bottom">${escapeHtml(text.visual.bottomLabel)}</span>
        </div>`
      : "";
  // config で全ショット共通の免責を出す場合、outro の note は同じ内容の二重表示になるので出さない。
  const outroBlock = text.outro
    ? `<div class="outro">
        <span class="url">${escapeHtml(BRAND.url)}</span>
        ${disclaimer ? "" : '<span class="note">雰囲気を比較するための視覚シミュレーションです。実際の照度(lux)を保証するものではありません。</span>'}
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
  .text.compact { bottom: 500px; }
  .text.has-disclaimer { bottom: 520px; }
  .text.split-text { right: 420px; }
  .eyebrow { font-size: 38px; font-weight: 700; letter-spacing: 0.08em; color: ${accentColor}; margin-bottom: 24px; }
  h1 { font-size: ${headlineSize}px; font-weight: 900; line-height: 1.16; letter-spacing: 0.01em; }
  h1 span { display: block; white-space: nowrap; }
  .sub { margin-top: 28px; font-size: 38px; font-weight: 500; line-height: 1.5; color: rgba(242,237,225,0.85); }
  .cta { margin-top: 24px; font-size: 32px; font-weight: 700; line-height: 1.45; color: ${BRAND.amber}; }
  .reel-disclaimer {
    position: absolute; left: 100px; right: 100px; bottom: 420px;
    font-size: 26px; font-weight: 500; line-height: 1.45; color: rgba(242,237,225,0.82);
  }
  .split-rule { position: absolute; top: 959px; left: 64px; right: 64px; height: 2px; background: rgba(242,237,225,0.72); }
  .compare-label {
    position: absolute; left: 72px; padding: 12px 22px; border-radius: 999px;
    background: rgba(7,7,6,0.76); font-size: 30px; font-weight: 700;
  }
  .compare-label-top { top: 250px; }
  .compare-label-bottom { top: 1010px; left: auto; right: 72px; }
  .ruler { position: absolute; right: 86px; top: 370px; width: 190px; height: 700px; color: ${BRAND.ink}; }
  .ruler-line { position: absolute; right: 24px; top: 50px; bottom: 50px; width: 4px; background: ${BRAND.amber}; }
  .ruler-line::before, .ruler-line::after {
    content: ""; position: absolute; right: -16px; width: 36px; height: 4px; background: ${BRAND.amber};
  }
  .ruler-line::before { top: 0; }
  .ruler-line::after { bottom: 0; }
  .ruler-top, .ruler-bottom {
    position: absolute; right: 52px; padding: 8px 14px; border-radius: 10px;
    background: rgba(7,7,6,0.76); font: 700 30px "InterLL", sans-serif; white-space: nowrap;
  }
  .ruler-top { top: 25px; }
  .ruler-bottom { bottom: 25px; }
  .outro { margin-top: 40px; display: flex; flex-direction: column; gap: 16px; }
  .url { font-size: 34px; font-weight: 700; font-family: "InterLL", sans-serif; color: ${BRAND.amber}; }
  .note { font-size: 24px; font-weight: 500; line-height: 1.5; color: ${BRAND.muted}; }
</style>
<div class="scrim"></div>
<div class="lockup">
  <span class="mark"><i></i></span>
  <span><b>${escapeHtml(BRAND.name)}</b><em>${escapeHtml(BRAND.handle)}</em></span>
</div>
${visualBlock}
<div class="text${text.compact ? " compact" : ""}${disclaimer ? " has-disclaimer" : ""}${isSplit ? " split-text" : ""}">
  <p class="eyebrow">${escapeHtml(text.eyebrow)}</p>
  <h1>${headline}</h1>
  <p class="sub">${escapeHtml(text.sub)}</p>
  ${ctaBlock}
  ${outroBlock}
</div>
${disclaimerBlock}`;
}

if (!existsSync(`${FRAMES_DIR}/shots.json`)) {
  const captureCommand = reelConfig
    ? "REEL_CONFIG=<同じ設定ファイル> npm run ig:decision-capture"
    : "node scripts/instagram/capture-reel-shots.mjs";
  throw new Error(`${FRAMES_DIR}/shots.json が無い。先に ${captureCommand} を実行する。`);
}
if (!existsSync("marketing/instagram/fonts/ZenKakuGothicNew-Black.ttf")) {
  throw new Error("フォントが無い。先に npm run ig:fonts を実行する。");
}

const manifest = JSON.parse(await readFile(`${FRAMES_DIR}/shots.json`, "utf8"));
const fps = manifest.fps;
const shots = manifest.shots.filter((shot) => TEXTS[shot.id]);
if (shots.length === 0) throw new Error("shots.json に既知のショットが無い。");
if (reelConfig && shots.length !== manifest.shots.length) {
  throw new Error(`${CONFIG_PATH} のテロップが不足している。`);
}
const voiceManifest = WITH_VOICE ? JSON.parse(await readFile(AUDIO_MANIFEST, "utf8")) : null;
if (voiceManifest && voiceManifest.cues.length !== shots.length) {
  throw new Error(`${AUDIO_MANIFEST} の音声 cue 数が shots.json と一致しない。先に ${VOICE_COMMAND} を実行する。`);
}
if (voiceManifest?.cues.some((cue, index) => cue.id !== shots[index].id || !existsSync(cue.path))) {
  throw new Error(`${AUDIO_MANIFEST} の音声が不足している。先に ${VOICE_COMMAND} を実行する。`);
}

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
  await writeFile(htmlPath, overlayHtml(TEXTS[shot.id], reelConfig?.disclaimer), "utf8");
  // 文字列連結だとパスに日本語や空白がある環境で壊れるので、正しくエンコードさせる。
  await page.goto(pathToFileURL(resolve(htmlPath)).href, { waitUntil: "load" });
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
  // 色差を間引くのは最後だけにする。ここで yuv420p にするとテロップ合成前に
  // 情報が落ち、平坦面と文字の縁が荒れる。
  const deband = DEBAND ? `,gradfun=strength=${DEBAND_STRENGTH}:radius=16` : "";
  parts.push(
    `[${index}:v]crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=${WIDTH}:${HEIGHT},` +
      `fps=${fps},settb=AVTB,setsar=1,format=yuv444p${deband}[b${index}]`
  );
  // テロップは短いフェードで出し入れする。ショットが極端に短い場合は潰れないよう詰める。
  const fade = Math.min(0.4, duration / 4);
  parts.push(
    `[${overlayIndex}:v]format=rgba,fade=t=in:st=0:d=${fade.toFixed(3)}:alpha=1,` +
      `fade=t=out:st=${Math.max(0, duration - fade).toFixed(3)}:d=${fade.toFixed(3)}:alpha=1[o${index}]`
  );
  parts.push(`[b${index}][o${index}]overlay=0:0:format=auto,format=yuv444p[v${index}]`);
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
const cueStarts = [];
let cueTime = 0;
for (const duration of durations) {
  cueStarts.push(cueTime);
  cueTime += duration - xfade;
}
const cueMaxDurations = cueStarts.map((start, index) =>
  index === cueStarts.length - 1 ? elapsed - start : cueStarts[index + 1] - start
);

if (voiceManifest) {
  const timingMismatch = !Array.isArray(voiceManifest.shots) ||
    voiceManifest.fps !== fps ||
    Math.abs(voiceManifest.duration - elapsed) > 0.001 ||
    voiceManifest.shots.some((shot, index) =>
      shot.id !== shots[index].id ||
      shot.frames !== shots[index].frames ||
      Math.abs(shot.start - cueStarts[index]) > 0.001 ||
      Math.abs(shot.maxDuration - cueMaxDurations[index]) > 0.001 ||
      Math.abs(voiceManifest.cues[index].start - cueStarts[index]) > 0.001 ||
      Math.abs(voiceManifest.cues[index].maxDuration - cueMaxDurations[index]) > 0.001
    );
  if (timingMismatch) {
    throw new Error(`音声が現在のリール撮影結果と一致しない。先に ${VOICE_COMMAND} を実行する。`);
  }
}

if (voiceManifest) {
  voiceManifest.cues.forEach((cue, index) => {
    const inputIndex = shots.length * 2 + index;
    parts.push(`[${inputIndex}:a]adelay=${Math.round(cue.start * 1000)}:all=1,aresample=48000[a${index}]`);
  });
  const inputs = voiceManifest.cues.map((_, index) => `[a${index}]`).join("");
  parts.push(`${inputs}amix=inputs=${voiceManifest.cues.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,pan=stereo|c0=c0|c1=c0,apad,atrim=duration=${elapsed.toFixed(3)}[aout]`);
}

const args = [];
for (const shot of shots) args.push("-framerate", String(fps), "-i", `${FRAMES_DIR}/${shot.id}/f%04d.png`);
for (const [index, shot] of shots.entries()) {
  args.push("-loop", "1", "-framerate", String(fps), "-t", durations[index].toFixed(3), "-i", `${BUILD_DIR}/${shot.id}.png`);
}
if (voiceManifest) {
  for (const cue of voiceManifest.cues) args.push("-i", cue.path);
} else {
  // 無音でも音声トラックを1本持たせる。Instagram 側の扱いが安定するため。
  args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
}
args.push(
  "-filter_complex", parts.join(";"),
  "-map", outLabel,
  "-map", voiceManifest ? "[aout]" : `${shots.length * 2}:a`,
  // aq-mode 3 は平坦部にビットを回すので、天板や壁のムラが出にくくなる。
  "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", String(CRF),
  "-aq-mode", "3", "-x264-params", "aq-strength=1.1",
  "-r", String(fps), "-g", String(fps * 2),
  "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
  "-t", elapsed.toFixed(3),
  "-movflags", "+faststart",
  "-y", `${OUT_DIR}/${OUT_NAME}`
);

console.log(`\nencoding ${elapsed.toFixed(2)}s (${shots.length} shots @ ${fps}fps) -> ${OUT_DIR}/${OUT_NAME}`);
await execFileAsync(ffmpegPath, args, { maxBuffer: 64 * 1024 * 1024 });
await rm(BUILD_DIR, { recursive: true, force: true });
console.log(`reel ready: ${OUT_DIR}/${OUT_NAME}`);
