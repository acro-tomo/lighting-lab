import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const CONFIG_PATH = process.env.REEL_CONFIG;
if (!CONFIG_PATH) throw new Error("REEL_CONFIG に対象の reel config を指定する。");

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const FPS = Number(process.env.REEL_FPS ?? 30);
const SMOKE = process.env.REEL_SMOKE === "1";
// 書き出しサイズ(1080x1920)そのままで撮る。エンコード側の拡大縮小が入らないぶん輪郭が残る。
const VIEWPORT = { width: 1080, height: 1920 };
const COMPARE_VIEWPORT = { width: 1080, height: 960 };

const urlArg = process.argv.slice(2).find((arg) => /^https?:\/\//.test(arg));
const url = urlArg ?? "http://127.0.0.1:5173/";

const HIDE_CHROME_CSS = `
  .top-chrome, .shared-toolbar { display: none !important; }
  .viewport-view-actions, .focus-toggle, .viewport-panel > .panel-head,
  .viewport-title, .daylight-wrap { display: none !important; }
  .scene-overlay, .autosave-note, .feedback-launcher, .scene-badge,
  .disclaimer-badge, .mobile-bottom-bar, .feedback-widget,
  .plan-meta, .shortcut-guide { display: none !important; }
  button[aria-label="縮小"], button[aria-label="拡大"] { display: none !important; }
  .plan-panel > .panel-heading, .plan-compass, .tool-help { display: none !important; }
  /* .top-chrome を消すと workspace が grid の auto 行に入って縦が縮む。単一行にして全高を使う。 */
  .app-shell { grid-template-rows: minmax(0, 1fr) !important; }
  [role="status"] { visibility: hidden !important; }
`;

const lerp = (from, to, amount) => from + (to - from) * amount;
const eased = (amount) => amount * amount * (3 - 2 * amount);

function cloneProject(project) {
  return structuredClone(project);
}

function applyCameraOverride(project, cameraOverride) {
  if (!cameraOverride) return project;
  return {
    ...project,
    camera: {
      ...project.camera,
      ...cameraOverride,
      position: cameraOverride.position ?? project.camera.position,
      target: cameraOverride.target ?? project.camera.target
    }
  };
}

function replaceLights(project, comparison) {
  const nextProject = cloneProject(project);
  nextProject.lights = comparison.xs.flatMap((x, xIndex) =>
    comparison.zs.map((z, zIndex) => ({
      id: `decision-dl-${xIndex + 1}-${zIndex + 1}`,
      name: `比較用ダウンライト ${xIndex * comparison.zs.length + zIndex + 1}`,
      type: "downlight",
      model: comparison.model,
      position: { x, y: comparison.positionY, z },
      mountHeightM: comparison.mountHeightM,
      rotationDeg: { x: -90, y: 0, z: 0 },
      target: { x, y: comparison.targetY, z },
      lumens: comparison.lumens,
      colorTemperatureK: comparison.colorTemperatureK,
      dimmer: comparison.dimmer,
      enabled: true,
      beamAngleDeg: comparison.beamAngleDeg,
      penumbra: comparison.penumbra,
      castsShadow: true,
      note: "動画内の等間隔比較用"
    }))
  );
  return nextProject;
}

async function applyProject(page, project, settleMs = 60) {
  await page.evaluate((nextProject) => {
    window.useProjectStore.getState().setProject(nextProject);
  }, project);
  await page.waitForTimeout(settleMs);
}

async function canvasBox(page, shotId) {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error(`canvas bounding box not found for ${shotId}`);
  return box;
}

async function captureStackedCompare(page, shot, project, dir, frames) {
  await page.setViewportSize(COMPARE_VIEWPORT);
  await page.waitForTimeout(500);

  const existingPath = `${dir}/existing.png`;
  const comparisonPath = `${dir}/comparison.png`;
  await applyProject(page, cloneProject(project), 1200);
  await page.screenshot({ path: existingPath, clip: await canvasBox(page, shot.id), timeout: 180_000 });
  await applyProject(page, replaceLights(project, shot.sequence.comparison), 1200);
  await page.screenshot({ path: comparisonPath, clip: await canvasBox(page, shot.id), timeout: 180_000 });

  await execFileAsync(
    ffmpegPath,
    [
      "-loop", "1", "-i", existingPath,
      "-loop", "1", "-i", comparisonPath,
      "-filter_complex",
      `[0:v]scale=${COMPARE_VIEWPORT.width}:${COMPARE_VIEWPORT.height}:force_original_aspect_ratio=increase,crop=${COMPARE_VIEWPORT.width}:${COMPARE_VIEWPORT.height}[top];` +
        `[1:v]scale=${COMPARE_VIEWPORT.width}:${COMPARE_VIEWPORT.height}:force_original_aspect_ratio=increase,crop=${COMPARE_VIEWPORT.width}:${COMPARE_VIEWPORT.height}[bottom];` +
        "[top][bottom]vstack=inputs=2[out]",
      "-map", "[out]", "-frames:v", String(frames), "-start_number", "0", "-y", `${dir}/f%04d.png`
    ],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  await rm(existingPath, { force: true });
  await rm(comparisonPath, { force: true });
}

// 2Dショット中だけ当てるCSS。3Dは画角外なので最小サイズにして描画コストを落とし、
// 器具名ラベルとカメラ位置マーカーは配灯図の読み取りを邪魔するので隠す。
const PLAN_SHOT_CSS = `
  .workspace.is-focus-2d .viewport-panel {
    display: block !important;
    position: fixed !important;
    left: -40px; top: -40px;
    width: 4px !important; height: 4px !important;
    overflow: hidden !important;
  }
  .scene-stage { width: 4px !important; height: 4px !important; }
  .plan-label, .plan-camera { display: none !important; }
`;

// liftPx はテロップと重ならないよう平面図を上へ寄せる量。整数pxの平行移動だけにして
// 拡大は入れない（SVGを再ラスタライズさせない）。
async function setPlanShotMode(page, enabled, liftPx = 320) {
  await page.evaluate(({ enabled, css, liftPx }) => {
    const id = "reel-plan-shot-style";
    const current = document.getElementById(id);
    if (!enabled) {
      current?.remove();
      return;
    }
    // 3Dの縮小を維持したいので、要素は消さずに中身だけ差し替える。
    const style = current ?? document.createElement("style");
    style.id = id;
    style.textContent = `${css}
      .workspace.is-focus-2d .plan-canvas { transform: translateY(${-Math.round(liftPx)}px); }`;
    if (!style.isConnected) document.head.appendChild(style);
  }, { enabled, css: PLAN_SHOT_CSS, liftPx });
  // 3Dキャンバスのリサイズが落ち着くまで待つ。
  await page.waitForTimeout(1500);
}

// 2D/3Dの集中表示を切り替える。集中表示中のパネル自身のボタンはラベルが
// 「通常表示に戻す」に変わるので、そのときは押さない（すでに目的の状態）。
async function setFocus(page, panel) {
  const label = panel === "plan" ? "2Dを最大化" : "3Dを最大化";
  const toggle = page.locator(`.focus-toggle[aria-label="${label}"]`);
  if (await toggle.count()) {
    await toggle.dispatchEvent("click");
    await page.waitForTimeout(600);
  }
}

// 2D平面図のショット。照明を順に出す(reveal)、選択を順に移す(selectIds)、
// 途中で配灯を差し替える(comparison + swapAt)の3つを組み合わせて使う。
async function capturePlan2D(page, shot, project, dir, frames) {
  await page.setViewportSize(VIEWPORT);
  const { revealUntil, selectIds, comparison, swapAt = 0.5 } = shot.sequence;
  const clip = { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height };

  for (let index = 0; index < frames; index += 1) {
    const timeline = frames === 1 ? 1 : index / (frames - 1);
    const nextProject = comparison && timeline < swapAt
      ? replaceLights(project, comparison)
      : cloneProject(project);
    if (revealUntil) {
      const shown = Math.round(eased(Math.min(1, timeline / revealUntil)) * nextProject.lights.length);
      nextProject.lights = nextProject.lights.slice(0, shown);
    }
    // 3Dは画角外なので影の作り直しを止める。2Dの見た目は変わらず、1フレームの撮影が速くなる。
    nextProject.lights = nextProject.lights.map((light) => ({ ...light, castsShadow: false }));
    await applyProject(page, nextProject);
    if (selectIds?.length) {
      // setProject が選択を消すので、フレームごとに選び直す。
      const selectedId = selectIds[Math.min(selectIds.length - 1, Math.floor(timeline * selectIds.length))];
      await page.evaluate((id) => {
        window.useProjectStore.getState().select({ kind: "light", id });
      }, selectedId);
    }
    await page.screenshot({
      path: `${dir}/f${String(index).padStart(4, "0")}.png`,
      clip,
      timeout: 180_000
    });
  }
}

async function captureToggleSlide(page, shot, project, dir, frames) {
  await page.setViewportSize(VIEWPORT);
  const { lightIds, switchAt, lowerByM, slideM } = shot.sequence;

  for (let index = 0; index < frames; index += 1) {
    const timeline = index / (frames - 1);
    const amount = eased(timeline);
    const xOffset = lerp(-slideM / 2, slideM / 2, amount);
    const nextProject = cloneProject(project);
    nextProject.camera = {
      ...nextProject.camera,
      position: {
        ...nextProject.camera.position,
        x: nextProject.camera.position.x + xOffset,
        y: nextProject.camera.position.y - lowerByM
      },
      target: { ...nextProject.camera.target, x: nextProject.camera.target.x + xOffset }
    };
    nextProject.lights = nextProject.lights.map((light) =>
      lightIds.includes(light.id) ? { ...light, enabled: timeline >= switchAt } : light
    );
    await applyProject(page, nextProject);
    await page.screenshot({
      path: `${dir}/f${String(index).padStart(4, "0")}.png`,
      clip: await canvasBox(page, shot.id),
      timeout: 180_000
    });
  }
}

async function captureLightAnimation(page, shot, project, dir, frames) {
  await page.setViewportSize(VIEWPORT);
  const { lightId, from, to, holdSeconds } = shot.sequence;
  const movementRatio = (shot.seconds - holdSeconds) / shot.seconds;

  for (let index = 0; index < frames; index += 1) {
    const timeline = index / (frames - 1);
    const amount = eased(Math.min(1, timeline / movementRatio));
    const nextProject = cloneProject(project);
    nextProject.lights = nextProject.lights.map((light) =>
      light.id === lightId
        ? {
            ...light,
            cordLengthM: lerp(from.cordLengthM, to.cordLengthM, amount),
            position: { ...light.position, y: lerp(from.positionY, to.positionY, amount) }
          }
        : light
    );
    await applyProject(page, nextProject);
    await page.screenshot({
      path: `${dir}/f${String(index).padStart(4, "0")}.png`,
      clip: await canvasBox(page, shot.id),
      timeout: 180_000
    });
  }
}

await mkdir(config.framesDir, { recursive: true });
await rm(`${config.framesDir}/shots.json`, { force: true });

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
await setFocus(page, "scene");
await page.addStyleTag({ content: HIDE_CHROME_CSS });
await page.waitForTimeout(3000);

const manifest = [];
for (const shot of config.shots) {
  const sourceProject = JSON.parse(await readFile(shot.projectFile, "utf8"));
  const project = applyCameraOverride(sourceProject, shot.cameraOverride);
  const frames = SMOKE ? 3 : Math.max(2, Math.round(shot.seconds * FPS));
  const dir = `${config.framesDir}/${shot.id}`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const startedAt = Date.now();
  const isPlanShot = shot.sequence.mode === "plan-2d";
  await setFocus(page, isPlanShot ? "plan" : "scene");
  await setPlanShotMode(page, isPlanShot, shot.sequence.liftPx);

  if (isPlanShot) {
    await capturePlan2D(page, shot, project, dir, frames);
  } else if (shot.sequence.mode === "stacked-light-compare") {
    await captureStackedCompare(page, shot, project, dir, frames);
  } else if (shot.sequence.mode === "light-toggle-slide") {
    await captureToggleSlide(page, shot, project, dir, frames);
  } else if (shot.sequence.mode === "light-property-animation") {
    await captureLightAnimation(page, shot, project, dir, frames);
  } else {
    throw new Error(`unknown sequence mode: ${shot.sequence.mode}`);
  }

  const msPerFrame = Math.round((Date.now() - startedAt) / frames);
  console.log(`shot=${shot.id} frames=${frames} ms/frame=${msPerFrame}`);
  manifest.push({
    id: shot.id,
    projectFile: shot.projectFile,
    sequenceMode: shot.sequence.mode,
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
