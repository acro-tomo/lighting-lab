// 6つのサンプルプロジェクトを順に読み込み、保存済みの照明設定を短いドリーで撮る。
//
// 前提: 別ターミナルで npm run dev
//   npm run ig:six-rooms-capture
//   REEL_SMOKE=1 npm run ig:six-rooms-capture
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const CONFIG_PATH = process.env.REEL_CONFIG ?? "marketing/instagram/reels/six-rooms.reel.json";
const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const FPS = 30;
const SMOKE = process.env.REEL_SMOKE === "1";
const VIEWPORT = { width: 1280, height: 2276 };

const urlArg = process.argv.slice(2).find((arg) => /^https?:\/\//.test(arg));
const url = urlArg ?? "http://127.0.0.1:5173/";

const HIDE_CHROME_CSS = `
  .top-chrome, .shared-toolbar { display: none !important; }
  .viewport-view-actions, .focus-toggle, .viewport-panel > .panel-head,
  .viewport-title, .daylight-wrap { display: none !important; }
  .scene-overlay, .autosave-note, .feedback-launcher, .scene-badge,
  .disclaimer-badge, .mobile-bottom-bar { display: none !important; }
  [role="status"] { visibility: hidden !important; }
`;

const eased = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, amount) => a + (b - a) * amount;
const lerpV = (a, b, amount) => ({
  x: lerp(a.x, b.x, amount),
  y: lerp(a.y, b.y, amount),
  z: lerp(a.z, b.z, amount)
});

const prebuiltChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(prebuiltChromium) ? prebuiltChromium : undefined;
const softwareGl = process.env.REEL_SOFTWARE_GL === "1";
const browser = await chromium.launch({
  headless: process.env.REEL_HEADLESS === "1",
  executablePath,
  args: softwareGl
    ? ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"]
    : ["--ignore-gpu-blocklist", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: "ja-JP" });
await page.addInitScript(() => window.localStorage.setItem("ldk-intro-seen", "1"));
page.on("pageerror", (error) => console.log(`pageerror: ${error.message}`));

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator("canvas").first().waitFor({ state: "attached", timeout: 60_000 });
await page.waitForTimeout(4000);
await page.locator('.focus-toggle[aria-label="3Dを最大化"]').dispatchEvent("click");
await page.addStyleTag({ content: HIDE_CHROME_CSS });
await page.waitForTimeout(3000);

const manifest = [];
await mkdir(config.framesDir, { recursive: true });
// 途中失敗時に古いmanifestと新しいフレームを混ぜてエンコードさせない。
await rm(`${config.framesDir}/shots.json`, { force: true });
for (const shot of config.shots) {
  const project = JSON.parse(await readFile(shot.projectFile, "utf8"));
  const savedCamera = project.camera;
  const dollyPosition = lerpV(savedCamera.position, savedCamera.target, 0.06);
  const frames = SMOKE ? 3 : Math.round(shot.seconds * FPS);
  const dir = `${config.framesDir}/${shot.id}`;

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await page.evaluate((nextProject) => {
    window.useProjectStore.getState().setProject(nextProject);
  }, project);
  await page.waitForTimeout(3000);

  const startedAt = Date.now();
  for (let index = 0; index < frames; index += 1) {
    const amount = eased(index / (frames - 1));
    const position = lerpV(savedCamera.position, dollyPosition, amount);
    await page.evaluate(
      ([nextPosition, camera]) => {
        window.useProjectStore.setState((state) => ({
          project: {
            ...state.project,
            camera: { ...state.project.camera, position: nextPosition, target: camera.target, fov: camera.fov }
          }
        }));
      },
      [position, savedCamera]
    );
    await page.waitForTimeout(60);

    const box = await page.locator("canvas").first().boundingBox();
    if (!box) throw new Error(`canvas bounding box not found for ${shot.id}`);
    await page.screenshot({
      path: `${dir}/f${String(index).padStart(4, "0")}.png`,
      clip: box,
      timeout: 180_000
    });
  }

  const msPerFrame = Math.round((Date.now() - startedAt) / frames);
  console.log(`shot=${shot.id} frames=${frames} ms/frame=${msPerFrame}`);
  manifest.push({
    id: shot.id,
    projectFile: shot.projectFile,
    frames,
    seconds: shot.seconds,
    fps: FPS
  });
}

await writeFile(
  `${config.framesDir}/shots.json`,
  JSON.stringify({ fps: FPS, smoke: SMOKE, shots: manifest }, null, 2),
  "utf8"
);
await browser.close();
console.log(`\nframes ready in ${config.framesDir}`);
