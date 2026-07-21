// Build Weekデモ動画の全素材キャプチャ
//   stills/  比較・ホールド用静止画 (1920x1080)
//   frames/  カメラ移動ショットの連番フレーム (30fps)
//   ui/      UI操作のリアルタイム録画 (webm, 末尾から既知秒数を切り出す前提)
// 前提: dev server on 127.0.0.1:5174, ?demo=2
import { mkdir, rename } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = "output/demo-video/assets";
const URL = "http://127.0.0.1:5174/?demo=2";
const VIEW = { width: 1920, height: 1080 };
const FPS = 30;

const DINING = ["light-dining-west", "light-dining-east"];
const KITCHEN = ["light-kitchen-west", "light-kitchen-east"];

// 統一された「設計済み」状態: 全灯2700K・調光82・アイランド配光110°・コード1000mm
const DESIGNED_STATE = () => {
  const s = window.useProjectStore.getState();
  s.setDaylight({ hour: 20, enabled: true });
  s.setAllColorTemperature(2700);
  s.updateLights(s.project.lights.map((l) => l.id), { dimmer: 82 });
  s.updateLights(["light-kitchen-west", "light-kitchen-east"], { beamAngleDeg: 110 });
  s.updateLights(["light-dining-west", "light-dining-east"], { cordLengthM: 1.0 });
  if (s.select) s.select(null);
};

const CAMS = {
  A: { position: { x: -2.4, y: 1.45, z: -1.0 }, target: { x: 0.15, y: 1.0, z: -2.65 }, fov: 70 },
  C: { position: { x: -0.9, y: 1.5, z: -0.6 }, target: { x: 3.0, y: 0.95, z: -2.8 }, fov: 70 },
  UI: { position: { x: -3.6, y: 1.55, z: 2.6 }, target: { x: 0.8, y: 1.0, z: -2.4 }, fov: 75 }
};

// 台形速度プロファイル(端でなめらかに加減速、中央は等速)
const easedT = (t, rampFrac = 0.18) => {
  const r = rampFrac;
  const flat = 1 - 2 * r;
  const total = r + flat + r; // = 1
  void total;
  const area = r + flat; // 台形面積(正規化前) = (r/1 + flat + r/1)/... 単純化した数値積分で代用
  void area;
  // 数値積分不要の閉形式: 速度 v(t): t<r → t/r, t>1-r → (1-t)/r, else 1
  // 距離 s(t) を正規化
  const S = (x) => {
    if (x <= 0) return 0;
    if (x < r) return (x * x) / (2 * r);
    if (x <= 1 - r) return r / 2 + (x - r);
    if (x < 1) return r / 2 + flat + (r / 2 - ((1 - x) * (1 - x)) / (2 * r));
    return r + flat;
  };
  return S(t) / S(1);
};

const lerp = (a, b, f) => a + (b - a) * f;
const lerpV = (a, b, f) => ({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) });

// 移動ショット定義 [name, seconds, camStart, camEnd, fov]
const MOVES = [
  ["S1-open", 18.5,
    { pos: { x: -4.6, y: 1.62, z: 3.5 }, tgt: { x: 0.7, y: 1.05, z: -2.2 } },
    { pos: { x: -3.5, y: 1.58, z: 2.45 }, tgt: { x: 0.7, y: 1.05, z: -2.2 } }, 75],
  ["S2-drift", 15.3,
    { pos: { x: -3.5, y: 1.58, z: 2.45 }, tgt: { x: 0.7, y: 1.05, z: -2.2 } },
    { pos: { x: -2.95, y: 1.58, z: 2.55 }, tgt: { x: 0.5, y: 1.05, z: -2.3 } }, 75],
  ["S6-walk", 13.1,
    { pos: { x: -3.9, y: 1.5, z: 2.7 }, tgt: { x: 0.15, y: 1.0, z: -2.65 } },
    { pos: { x: -1.35, y: 1.5, z: -0.25 }, tgt: { x: 2.0, y: 0.95, z: -2.6 } }, 75],
  ["S8-pan", 15.5,
    { pos: { x: -5.0, y: 1.7, z: 3.6 }, tgt: { x: 1.5, y: 1.0, z: -1.5 } },
    { pos: { x: -4.15, y: 1.7, z: 3.75 }, tgt: { x: 1.15, y: 1.0, z: -1.65 } }, 78],
  ["S9-pull", 9.7,
    { pos: { x: -3.7, y: 1.6, z: 2.5 }, tgt: { x: 0.6, y: 1.05, z: -2.0 } },
    { pos: { x: -4.9, y: 1.7, z: 3.6 }, tgt: { x: 1.5, y: 1.0, z: -1.5 } }, 78]
];

const newPage = async (browser, { record = null, cursor = false } = {}) => {
  const context = await browser.newContext({
    viewport: VIEW,
    ...(record ? { recordVideo: { dir: record, size: VIEW } } : {})
  });
  await context.addInitScript(() => {
    localStorage.setItem("ldk-language", "en");
    localStorage.setItem("ldk-intro-seen", "1");
  });
  if (cursor) {
    await context.addInitScript(() => {
      window.addEventListener("DOMContentLoaded", () => {
        const dot = document.createElement("div");
        dot.id = "pw-cursor";
        dot.style.cssText = [
          "position:fixed", "z-index:99999", "width:18px", "height:18px",
          "border-radius:50%", "background:rgba(255,255,255,0.85)",
          "border:2px solid rgba(0,0,0,0.55)", "pointer-events:none",
          "transform:translate(-50%,-50%)", "left:-40px", "top:-40px",
          "box-shadow:0 1px 6px rgba(0,0,0,0.5)", "transition:width 80ms,height 80ms"
        ].join(";");
        document.body.appendChild(dot);
        window.addEventListener("mousemove", (e) => {
          dot.style.left = `${e.clientX}px`;
          dot.style.top = `${e.clientY}px`;
        }, true);
        window.addEventListener("mousedown", () => { dot.style.width = "13px"; dot.style.height = "13px"; }, true);
        window.addEventListener("mouseup", () => { dot.style.width = "18px"; dot.style.height = "18px"; }, true);
      });
    });
  }
  const page = await context.newPage();
  page.once("dialog", (d) => d.accept());
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.locator("canvas").first().waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(2500);
  return { context, page };
};

const applyState = (page, fn) => page.evaluate(fn);
const setCam = (page, cam) => page.evaluate((c) => {
  window.useProjectStore.getState().setCamera(c);
}, cam);

const still = async (page, path) => {
  await page.waitForTimeout(750);
  await page.screenshot({ path });
  console.log(`still=${path}`);
};

const browser = await chromium.launch({ headless: false });
const t0 = Date.now();

// ---------- PART 1: 静止画 + 移動フレーム (Maximize 3D) ----------
{
  const { context, page } = await newPage(browser);
  await page.getByRole("button", { name: "Maximize 3D" }).click();
  await page.waitForTimeout(500);
  await page.addStyleTag({ content: '[role="status"]{visibility:hidden !important}' });
  await applyState(page, DESIGNED_STATE);
  await page.waitForTimeout(800);

  // --- 比較静止画 (構図A) ---
  const stillsDir = `${BASE}/stills`;
  await mkdir(stillsDir, { recursive: true });
  await setCam(page, CAMS.A);

  await applyState(page, () => window.useProjectStore.getState().setAllColorTemperature(2700));
  await still(page, `${stillsDir}/A-warm.png`);
  await applyState(page, () => window.useProjectStore.getState().setAllColorTemperature(3500));
  await still(page, `${stillsDir}/A-neutral.png`);
  await applyState(page, () => window.useProjectStore.getState().setAllColorTemperature(6500));
  await still(page, `${stillsDir}/A-white.png`);

  await applyState(page, () => {
    const s = window.useProjectStore.getState();
    s.setAllColorTemperature(2700);
    s.updateLights(s.project.lights.map((l) => l.id), { dimmer: 100 });
  });
  await still(page, `${stillsDir}/A-bright.png`);
  await applyState(page, () => {
    const s = window.useProjectStore.getState();
    s.updateLights(s.project.lights.map((l) => l.id), { dimmer: 15 });
  });
  await still(page, `${stillsDir}/A-dim.png`);

  // --- 配光比較 (構図C) ---
  await applyState(page, () => {
    const s = window.useProjectStore.getState();
    s.updateLights(s.project.lights.map((l) => l.id), { dimmer: 82 });
    s.updateLights(["light-kitchen-west", "light-kitchen-east"], { beamAngleDeg: 22 });
  });
  await setCam(page, CAMS.C);
  await still(page, `${stillsDir}/C-narrow.png`);
  await applyState(page, () => {
    window.useProjectStore.getState().updateLights(["light-kitchen-west", "light-kitchen-east"], { beamAngleDeg: 110 });
  });
  await still(page, `${stillsDir}/C-wide.png`);

  // --- 移動フレーム ---
  await applyState(page, DESIGNED_STATE);
  for (const [name, seconds, from, to, fov] of MOVES) {
    const dir = `${BASE}/frames/${name}`;
    await mkdir(dir, { recursive: true });
    const frames = Math.round(seconds * FPS);
    const tShot = Date.now();
    for (let i = 0; i < frames; i += 1) {
      const f = easedT(i / (frames - 1));
      const cam = { position: lerpV(from.pos, to.pos, f), target: lerpV(from.tgt, to.tgt, f), fov };
      await setCam(page, cam);
      await page.waitForTimeout(40);
      await page.screenshot({ path: `${dir}/f${String(i).padStart(4, "0")}.png` });
    }
    console.log(`frames=${name} n=${frames} ms/frame=${Math.round((Date.now() - tShot) / frames)}`);
  }
  await context.close();
}

// セグメント内は絶対時刻でスケジュールし、録画末尾から既知秒数で切り出せるようにする。
const scheduler = () => {
  const start = Date.now();
  return async (page, offsetMs) => {
    const remain = start + offsetMs - Date.now();
    if (remain > 0) await page.waitForTimeout(remain);
  };
};

// ---------- PART 2: UI操作録画 U12 (2D→3D→選択→吊り長さ) ----------
// 末尾26.8秒を採用 (video 33.8→60.6)。
{
  const { context, page } = await newPage(browser, { record: `${BASE}/ui-tmp`, cursor: true });
  const video = page.video();
  await page.addStyleTag({ content: '[role="status"]{visibility:hidden !important}' });
  await applyState(page, DESIGNED_STATE);
  await applyState(page, () => {
    // U12は「配置前」: コード700mmから開始
    window.useProjectStore.getState().updateLights(["light-dining-west", "light-dining-east"], { cordLengthM: 0.7 });
  });
  await setCam(page, CAMS.UI);
  await page.waitForTimeout(400);

  // 事前状態: 2D最大化 + Fit to view
  await page.getByRole("button", { name: "Maximize 2D" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Fit to view" }).click();
  await page.mouse.move(1700, 950);
  await page.waitForTimeout(1200);

  // ===== セグメント開始 (rel 0 ↔ video 33.8) =====
  const at = scheduler();
  // [0.8–4.4] Import floor planへ漂いホバー
  await at(page, 800);
  const importBtn = page.getByRole("button", { name: "Import floor plan" });
  const ib = await importBtn.boundingBox();
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2, { steps: 45 });
  // [4.4] 復元ボタンへ移動
  await at(page, 4400);
  const restore = page.getByRole("button", { name: "Return to normal view" });
  const rb = await restore.boundingBox();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 40 });
  // [5.7 ↔ video 39.5] 通常レイアウトへ (3D出現)
  await at(page, 5700);
  await restore.click();
  await page.mouse.move(1000, 820, { steps: 30 });
  // [5.7–16.8] 3Dを見せる(静止)

  // [16.8 ↔ video 50.6] 照明選択
  await at(page, 16800);
  const light = page.locator(".plan-light[data-light-id='light-dining-west']");
  const lb = await light.boundingBox();
  if (lb) await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2, { steps: 35 });
  await at(page, 17800);
  await light.dispatchEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1 });
  await page.locator(".light-inspector").waitFor({ state: "visible", timeout: 5000 });
  // [18.9] Drop lengthスライダーへ → [19.6–20.8] ドラッグ(700→1000mm)
  await at(page, 18900);
  const drop = page.locator(".light-inspector .light-range-control input[type='range']").nth(1);
  const db = await drop.boundingBox();
  const frac0 = (700 - 100) / 2900;
  const frac1 = (1000 - 100) / 2900;
  const y = db.y + db.height / 2;
  await page.mouse.move(db.x + db.width * frac0, y, { steps: 35 });
  await at(page, 19600);
  await page.mouse.down();
  await page.mouse.move(db.x + db.width * frac1, y, { steps: 25 });
  await page.mouse.up();
  // [21.5] カーソル退避、[〜26.8] 結果を見せる
  await at(page, 21500);
  await page.mouse.move(1180, 940, { steps: 30 });
  await at(page, 26800);
  await context.close();
  const p = await video.path();
  await mkdir(`${BASE}/ui`, { recursive: true });
  await rename(p, `${BASE}/ui/U12.webm`);
  console.log("ui=U12.webm");
}

// ---------- PART 3: UI操作録画 U3 (プロジェクト保存) ----------
// 末尾3.93秒を採用 (video 126.0→129.94)。
{
  const { context, page } = await newPage(browser, { record: `${BASE}/ui-tmp`, cursor: true });
  const video = page.video();
  await page.addStyleTag({ content: '#u3-hide[hidden]{}\n[role="status"]{visibility:hidden}' });
  await applyState(page, DESIGNED_STATE);
  await setCam(page, CAMS.UI);
  await page.mouse.move(1500, 900);
  await page.waitForTimeout(1500);

  // ===== セグメント開始 (rel 0 ↔ video 126.0) =====
  const at = scheduler();
  await at(page, 400);
  const save = page.getByRole("button", { name: "Save project" });
  const sb = await save.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 30 });
  await at(page, 1500);
  const dl = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await save.click();
  // 保存通知を見せる(古い通知はここまで非表示)
  await page.evaluate(() => {
    setTimeout(() => {
      const el = document.querySelector('[role="status"]');
      if (el) el.style.setProperty("visibility", "visible", "important");
    }, 250);
  });
  await dl;
  await at(page, 2100);
  await page.mouse.move(sb.x + sb.width / 2 - 40, sb.y + sb.height / 2 + 130, { steps: 20 });
  await at(page, 3930);
  await context.close();
  const p = await video.path();
  await rename(p, `${BASE}/ui/U3.webm`);
  console.log("ui=U3.webm");
}

await browser.close();
console.log(`total=${Math.round((Date.now() - t0) / 1000)}s`);
