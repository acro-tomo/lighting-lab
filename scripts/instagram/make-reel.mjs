// Instagram リール（9:16 動画）の生成。カルーセルと同じ「HTMLを組んで Playwright で焼く」方式で
// シーンの静止画を作り、ffmpeg でズーム＋クロスフェードをかけて mp4 にする。
//
// カルーセル（make-posts.mjs）との違い:
// - 1080x1920 固定。プレートは元から 9:16 で撮ってあるので切り出さずそのまま敷ける。
// - 文字は「下から400px・上から200px」の内側に収める。Instagram のUIが端に重なるため。
//
// 事前準備:
//   npm run ig:fonts    フォント取得
//   npm run ig:plates   背景プレート取得（要 npm run dev）
//
// 使い方:
//   npm run ig:reel
//
// 出力: marketing/instagram/out/reel-<id>.mp4
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import { BRAND } from "./post-designs.mjs";

const execFileAsync = promisify(execFile);

const ROOT = "marketing/instagram";
const OUT_DIR = `${ROOT}/out`;
const BUILD_DIR = `${ROOT}/.build-reel`;

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
// シーン間のクロスフェード長。総尺 = 各シーンの合計 - 転換回数 * この値。
const XFADE = 0.5;

// 1リール = 1トピック。dur は「そのシーンの素材尺」で、転換ぶんは後で差し引かれる。
const REEL = {
  id: "color-temp-sweep",
  scenes: [
    {
      plate: "warm-2700k",
      dur: 2.6,
      eyebrow: "色を変えただけ",
      headline: ["同じ部屋です"],
      sub: "間取りも家具も照明の数も、まったく同じ"
    },
    {
      plate: "warm-2700k",
      dur: 2.4,
      eyebrow: "2700K 電球色",
      headline: ["いちばん落ち着く"],
      sub: "夜のリビング・寝室の定番"
    },
    {
      plate: "neutral-3500k",
      dur: 2.4,
      eyebrow: "3500K 温白色",
      headline: ["迷ったらここ"],
      sub: "LDK全体に使いやすい明るさ"
    },
    {
      plate: "cool-5000k",
      dur: 2.4,
      eyebrow: "5000K 昼白色",
      headline: ["手元がよく見える"],
      sub: "キッチン・洗面・書斎向き",
      accent: "cool"
    },
    {
      plate: "daylight-6500k",
      dur: 2.4,
      eyebrow: "6500K 昼光色",
      headline: ["夜のリビング", "には強い"],
      sub: "青白く、くつろぎにくい",
      accent: "cool"
    },
    {
      plate: "warm-2700k",
      dur: 3.0,
      eyebrow: "部屋ごとに変えるのが正解",
      headline: ["保存して", "打ち合わせへ"],
      sub: "自分の間取り図で夜のLDKが見えます",
      outro: true
    }
  ]
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

/**
 * 全角を1、半角を0.55として想定幅を測り、枠に収まる文字サイズを返す（make-posts.mjs と同じ考え方）。
 * letter-spacing のぶん実寸がわずかに膨らむので、0.96 掛けで折り返しを防ぐ。
 */
function fitHeadlineSize(lines, contentWidth, maxSize) {
  const widest = Math.max(
    ...lines.map((line) =>
      [...line].reduce((total, char) => total + (/[\x20-\x7E｡-ﾟ]/.test(char) ? 0.55 : 1), 0)
    )
  );
  return Math.min(maxSize, Math.floor((contentWidth * 0.96) / widest));
}

function sceneHtml(scene) {
  const accentColor = scene.accent === "cool" ? BRAND.cool : BRAND.amber;
  const headlineSize = fitHeadlineSize(scene.headline, WIDTH - 200, 118);
  const headline = scene.headline.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  const outroBlock = scene.outro
    ? `<div class="outro">
        <span class="url">${escapeHtml(BRAND.url)}</span>
        <span class="note">雰囲気を比較するための視覚シミュレーションです。実際の照度(lux)を保証するものではありません。</span>
      </div>`
    : "";

  return `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: "ZenKaku"; src: url("../fonts/ZenKakuGothicNew-Black.ttf"); font-weight: 900; }
  @font-face { font-family: "ZenKaku"; src: url("../fonts/ZenKakuGothicNew-Bold.ttf"); font-weight: 700; }
  @font-face { font-family: "ZenKaku"; src: url("../fonts/ZenKakuGothicNew-Medium.ttf"); font-weight: 500; }
  @font-face { font-family: "InterLL"; src: url("../fonts/Inter-Bold.ttf"); font-weight: 700; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; position: relative;
    background: ${BRAND.base}; font-family: "ZenKaku", sans-serif; color: ${BRAND.ink};
  }
  .plate { position: absolute; inset: 0; }
  .plate img { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* 上下に暗さを足して文字を読ませる。中央は素材を殺さないよう透過のまま。
     文字量が多いシーン（outro）でも下半分が明るくならないよう、下の暗幕は高めに取る。 */
  .scrim {
    position: absolute; inset: 0;
    background:
      linear-gradient(to bottom, rgba(7,7,6,0.72) 0%, rgba(7,7,6,0) 26%),
      linear-gradient(to top, rgba(7,7,6,0.92) 0%, rgba(7,7,6,0.82) 26%, rgba(7,7,6,0.55) 44%, rgba(7,7,6,0) 62%);
  }
  .lockup {
    position: absolute; top: 96px; left: 100px; right: 100px;
    display: flex; align-items: center; gap: 20px;
  }
  .mark {
    width: 56px; height: 56px; border-radius: 50%;
    background: ${BRAND.amber}; display: grid; place-items: center; flex: none;
  }
  .mark i { width: 22px; height: 22px; border-radius: 50%; background: ${BRAND.base}; display: block; }
  .lockup b { font-size: 30px; font-weight: 700; letter-spacing: 0.06em; font-family: "InterLL", sans-serif; }
  .lockup em { font-style: normal; font-size: 26px; color: ${BRAND.muted}; margin-left: 16px; }
  /* 下から400pxは Instagram のUIと重なるので、本文の下端をそこまでに留める。 */
  .text { position: absolute; left: 100px; right: 100px; bottom: 400px; }
  .eyebrow { font-size: 38px; font-weight: 700; letter-spacing: 0.08em; color: ${accentColor}; margin-bottom: 26px; }
  h1 { font-size: ${headlineSize}px; font-weight: 900; line-height: 1.16; letter-spacing: 0.01em; }
  h1 span { display: block; white-space: nowrap; }
  .sub { margin-top: 30px; font-size: 40px; font-weight: 500; line-height: 1.5; color: rgba(242,237,225,0.82); }
  .outro { margin-top: 44px; display: flex; flex-direction: column; gap: 18px; }
  .url { font-size: 34px; font-weight: 700; font-family: "InterLL", sans-serif; color: ${BRAND.amber}; }
  .note { font-size: 24px; font-weight: 500; line-height: 1.5; color: ${BRAND.muted}; }
</style>
<div class="plate"><img src="../plates/${escapeHtml(scene.plate)}.png" alt=""></div>
<div class="scrim"></div>
<div class="lockup">
  <span class="mark"><i></i></span>
  <span><b>${escapeHtml(BRAND.name)}</b><em>${escapeHtml(BRAND.handle)}</em></span>
</div>
<div class="text">
  <p class="eyebrow">${escapeHtml(scene.eyebrow)}</p>
  <h1>${headline}</h1>
  <p class="sub">${escapeHtml(scene.sub)}</p>
  ${outroBlock}
</div>`;
}

/** シーン静止画に、ゆっくりズームをかけた個別クリップを作る filter を組む。 */
function buildFilterGraph(scenes) {
  const parts = [];
  scenes.forEach((scene, index) => {
    const frames = Math.round(scene.dur * FPS);
    // 1フレームごとに少しずつ寄せる。奇数サイズになると h264 が嫌がるので偶数に丸める。
    // xfade は入力が固定フレームレート＋同じ time_base であることを要求するので、
    // zoompan の後に fps/settb/setsar を通してから渡す。
    parts.push(
      `[${index}:v]zoompan=z='1+0.00055*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS},trim=end_frame=${frames},setpts=PTS-STARTPTS,` +
        `fps=${FPS},settb=AVTB,setsar=1,format=yuv420p[v${index}]`
    );
  });

  // xfade は2本ずつしか繋げないので、左から順に畳み込む。
  let current = "[v0]";
  let elapsed = scenes[0].dur;
  scenes.slice(1).forEach((scene, index) => {
    const next = index + 1;
    const offset = (elapsed - XFADE).toFixed(3);
    const label = next === scenes.length - 1 ? "vout" : `x${next}`;
    parts.push(`${current}[v${next}]xfade=transition=fade:duration=${XFADE}:offset=${offset}[${label}]`);
    current = `[${label}]`;
    elapsed = elapsed - XFADE + scene.dur;
  });

  return { filter: parts.join(";"), duration: elapsed };
}

if (!existsSync(`${ROOT}/fonts/ZenKakuGothicNew-Black.ttf`)) {
  throw new Error("フォントが無い。先に npm run ig:fonts を実行する。");
}
if (!existsSync(`${ROOT}/plates/warm-2700k.png`)) {
  throw new Error("プレートが無い。先に npm run ig:plates を実行する（npm run dev が必要）。");
}

await mkdir(BUILD_DIR, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });

const prebuiltChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(prebuiltChromium) ? prebuiltChromium : undefined;
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

const framePaths = [];
for (const [index, scene] of REEL.scenes.entries()) {
  const seq = String(index + 1).padStart(2, "0");
  const htmlPath = `${BUILD_DIR}/${seq}.html`;
  const pngPath = `${BUILD_DIR}/${seq}.png`;
  await writeFile(htmlPath, sceneHtml(scene), "utf8");
  await page.goto(`file://${process.cwd()}/${htmlPath}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: pngPath });
  framePaths.push(pngPath);
  console.log(`scene=${pngPath} ${scene.headline.join("")}`);
}
await browser.close();

const { filter, duration } = buildFilterGraph(REEL.scenes);
const outPath = `${OUT_DIR}/reel-${REEL.id}.mp4`;

const args = [];
for (const [index, scene] of REEL.scenes.entries()) {
  args.push("-loop", "1", "-framerate", String(FPS), "-t", String(scene.dur), "-i", framePaths[index]);
}
// 無音でも音声トラックを1本持たせる。Instagram 側の扱いが安定するため。
args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
args.push(
  "-filter_complex", filter,
  "-map", "[vout]",
  "-map", `${REEL.scenes.length}:a`,
  "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
  "-r", String(FPS), "-g", String(FPS * 2),
  "-c:a", "aac", "-b:a", "128k",
  "-t", duration.toFixed(3),
  "-movflags", "+faststart",
  "-y", outPath
);

console.log(`\nencoding ${duration.toFixed(2)}s -> ${outPath}`);
await execFileAsync(ffmpegPath, args, { maxBuffer: 32 * 1024 * 1024 });

await rm(BUILD_DIR, { recursive: true, force: true });
console.log(`reel ready: ${outPath}`);
