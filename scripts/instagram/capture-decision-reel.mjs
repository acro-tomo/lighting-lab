import { execFile } from "node:child_process";
import { closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";
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
const VIEWPORT = { width: 1280, height: 2276 };
const COMPARE_VIEWPORT = { width: 1280, height: 1138 };

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
  [role="status"] { visibility: hidden !important; }
`;

const RESUME = process.env.REEL_RESUME === "1";

const lerp = (from, to, amount) => from + (to - from) * amount;
const eased = (amount) => amount * amount * (3 - 2 * amount);

/**
 * dir の先頭から連続して「最後まで書けている」PNG が何枚あるかを返す。
 * 途中で落ちた回の最後の1枚は IEND まで届いていないので、そこで打ち切る。
 */
function completeFrames(dir, frames) {
  for (let index = 0; index < frames; index += 1) {
    const path = `${dir}/f${String(index).padStart(4, "0")}.png`;
    if (!existsSync(path)) return index;
    let file;
    try {
      file = openSync(path, "r");
      const tail = Buffer.alloc(8);
      const size = fstatSync(file).size;
      if (size < 8) return index;
      readSync(file, tail, 0, 8, size - 8);
      if (tail.toString("latin1", 4, 8) !== "IEND") return index;
    } catch {
      return index;
    } finally {
      if (file !== undefined) closeSync(file);
    }
  }
  return frames;
}

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

function requireVariant(variants, name) {
  const variant = variants?.[name];
  if (!variant) throw new Error(`variant が config に無い: ${name}`);
  return variant;
}

/**
 * 器具の差し替えを「撤去 / 無効化 / 数値の上書き / 追加」の4操作だけで表す。
 * 元プロジェクトは触らず、比較のたびに複製へ適用する。
 *
 * 撤去(remove)と無効化(disable)は分けてある。消灯しても器具本体は画に残るので、
 * 「器具そのものを別の種類に置き換える」比較では残った本体が嘘になる。
 * 光束は消灯時点で0なので、撤去しても合計光束の揃えは変わらない。
 */
function applyVariant(project, variant) {
  const next = cloneProject(project);
  const removed = new Set(variant.removeLightIds ?? []);
  const disabled = new Set(variant.disableLightIds ?? []);
  const overrides = variant.lightOverrides ?? {};
  next.lights = next.lights.filter((light) => !removed.has(light.id)).map((light) => {
    const merged = overrides[light.id] ? { ...light, ...overrides[light.id] } : light;
    return disabled.has(light.id) ? { ...merged, enabled: false } : merged;
  });
  if (variant.addLights) next.lights = [...next.lights, ...variant.addLights];
  return next;
}

function variantAt(timelineSteps, timeline) {
  const step = timelineSteps.find((candidate) => timeline <= candidate.until);
  return (step ?? timelineSteps[timelineSteps.length - 1]).variant;
}

function movedCamera(camera, move, amount) {
  if (!move) return camera;
  const lerpPoint = (from, to) => ({
    x: lerp(from.x, to.x, amount),
    y: lerp(from.y, to.y, amount),
    z: lerp(from.z, to.z, amount)
  });
  return {
    ...camera,
    position: move.from?.position && move.to?.position
      ? lerpPoint(move.from.position, move.to.position)
      : camera.position,
    target: move.from?.target && move.to?.target
      ? lerpPoint(move.from.target, move.to.target)
      : camera.target
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

/**
 * 器具のバリアントを切り替えながらカメラを動かす。
 * カメラを止めれば同一フレームでのA/B切替、動かせばドリーやチルトになる。
 */
async function captureVariantMove(page, shot, project, dir, frames, variants, startIndex = 0) {
  await page.setViewportSize(VIEWPORT);
  // 60msだと描画が完成する前に撮れて露出が途中状態のまま焼き付く（実測: 60ms=215.5 /
  // 400ms以降=68.4で安定）。IES対応と日光の実測光スケール化でシーン確定が遅くなったため。
  const { move, variantTimeline, daylight, settleMs = 400 } = shot.sequence;

  for (let index = startIndex; index < frames; index += 1) {
    const timeline = frames === 1 ? 0 : index / (frames - 1);
    const next = applyVariant(project, requireVariant(variants, variantAt(variantTimeline, timeline)));
    next.camera = movedCamera(next.camera, move, eased(timeline));
    if (daylight) {
      next.daylight = {
        ...next.daylight,
        enabled: true,
        hour: lerp(daylight.fromHour, daylight.toHour, timeline)
      };
    }
    await applyProject(page, next, settleMs);
    await page.screenshot({
      path: `${dir}/f${String(index).padStart(4, "0")}.png`,
      clip: await canvasBox(page, shot.id),
      timeout: 180_000
    });
  }
}

/**
 * 上下2分割で同じ時刻を同時に進める。変数は上下のバリアント差だけで、
 * 日光の送り方は両方に同一のカーブで与える。
 * 上下それぞれを通しで撮ってから vstack する（バリアント切替の回数を最小にするため）。
 */
async function captureDaylightSplit(page, shot, project, dir, frames, variants) {
  await page.setViewportSize(COMPARE_VIEWPORT);
  await page.waitForTimeout(500);
  const { topVariant, bottomVariant, daylight, settleMs = 500 } = shot.sequence;

  for (const [slot, variantName] of [["top", topVariant], ["bottom", bottomVariant]]) {
    await mkdir(`${dir}/${slot}`, { recursive: true });
    const variant = requireVariant(variants, variantName);
    for (let index = 0; index < frames; index += 1) {
      const timeline = frames === 1 ? 0 : index / (frames - 1);
      const next = applyVariant(project, variant);
      // 時刻は演出で歪めない。イージングを掛けず線形に送る。
      next.daylight = {
        ...next.daylight,
        enabled: true,
        hour: lerp(daylight.fromHour, daylight.toHour, timeline)
      };
      await applyProject(page, next, settleMs);
      await page.screenshot({
        path: `${dir}/${slot}/f${String(index).padStart(4, "0")}.png`,
        clip: await canvasBox(page, shot.id),
        timeout: 180_000
      });
    }
  }

  await execFileAsync(
    ffmpegPath,
    [
      "-framerate", String(FPS), "-start_number", "0", "-i", `${dir}/top/f%04d.png`,
      "-framerate", String(FPS), "-start_number", "0", "-i", `${dir}/bottom/f%04d.png`,
      "-filter_complex", "[0:v][1:v]vstack=inputs=2[out]",
      "-map", "[out]", "-frames:v", String(frames), "-start_number", "0", "-y", `${dir}/f%04d.png`
    ],
    { maxBuffer: 16 * 1024 * 1024 }
  );
  await rm(`${dir}/top`, { recursive: true, force: true });
  await rm(`${dir}/bottom`, { recursive: true, force: true });
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
await page.locator('.focus-toggle[aria-label="3Dを最大化"]').dispatchEvent("click");
await page.addStyleTag({ content: HIDE_CHROME_CSS });
await page.waitForTimeout(3000);

const manifest = [];
for (const shot of config.shots) {
  const sourceProject = JSON.parse(await readFile(shot.projectFile, "utf8"));
  const project = applyCameraOverride(sourceProject, shot.cameraOverride);
  const frames = SMOKE ? 3 : Math.max(2, Math.round(shot.seconds * FPS));
  const dir = `${config.framesDir}/${shot.id}`;
  // 撮影が途中で落ちる環境（コンテナの再起動など）で、撮り直しをゼロからやらないための再開。
  const startIndex = RESUME ? completeFrames(dir, frames) : 0;
  if (startIndex === 0) {
    await rm(dir, { recursive: true, force: true });
  }
  await mkdir(dir, { recursive: true });
  if (startIndex >= frames) {
    console.log(`shot=${shot.id} frames=${frames} (撮影済み・再開でスキップ)`);
    manifest.push({ id: shot.id, projectFile: shot.projectFile, sequenceMode: shot.sequence.mode, frames, seconds: shot.seconds, fps: FPS });
    continue;
  }
  if (startIndex > 0) console.log(`shot=${shot.id} f${String(startIndex).padStart(4, "0")} から再開`);

  // ショット先頭はプロジェクトごと差し替わるぶんシーン確定が遅く、フレーム毎の
  // settleMs では間に合わずに露出が途中状態のまま焼き付く（実測: 白飛びして平均輝度が
  // 約200、正しくは約68）。撮影前に一度だけ長めに待って暖機する。
  await applyProject(page, project, 1200);

  const startedAt = Date.now();
  if (shot.sequence.mode === "stacked-light-compare") {
    await captureStackedCompare(page, shot, project, dir, frames);
  } else if (shot.sequence.mode === "light-toggle-slide") {
    await captureToggleSlide(page, shot, project, dir, frames);
  } else if (shot.sequence.mode === "light-property-animation") {
    await captureLightAnimation(page, shot, project, dir, frames);
  } else if (shot.sequence.mode === "fixture-variant-move") {
    await captureVariantMove(page, shot, project, dir, frames, config.variants, startIndex);
  } else if (shot.sequence.mode === "daylight-split-timelapse") {
    await captureDaylightSplit(page, shot, project, dir, frames, config.variants);
  } else {
    throw new Error(`unknown sequence mode: ${shot.sequence.mode}`);
  }

  const msPerFrame = Math.round((Date.now() - startedAt) / Math.max(1, frames - startIndex));
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
