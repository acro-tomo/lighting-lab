// UI操作をフレームステップ(30fps相当)で決定論的にキャプチャする。
// Playwright録画のタイムスタンプ歪み対策: 1フレームずつマウスを進めて screenshot。
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = "output/demo-video/assets";
const URL = "http://127.0.0.1:5174/?demo=2";
const FPS = 30;

const newPage = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(() => {
    localStorage.setItem("ldk-language", "en");
    localStorage.setItem("ldk-intro-seen", "1");
  });
  await context.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const dot = document.createElement("div");
      dot.id = "pw-cursor";
      dot.style.cssText = [
        "position:fixed", "z-index:99999", "width:18px", "height:18px",
        "border-radius:50%", "background:rgba(255,255,255,0.85)",
        "border:2px solid rgba(0,0,0,0.55)", "pointer-events:none",
        "transform:translate(-50%,-50%)", "left:-40px", "top:-40px",
        "box-shadow:0 1px 6px rgba(0,0,0,0.5)"
      ].join(";");
      document.body.appendChild(dot);
      window.addEventListener("mousemove", (e) => {
        dot.style.left = `${e.clientX}px`;
        dot.style.top = `${e.clientY}px`;
      }, true);
      window.addEventListener("mousedown", () => { dot.style.width = "12px"; dot.style.height = "12px"; }, true);
      window.addEventListener("mouseup", () => { dot.style.width = "18px"; dot.style.height = "18px"; }, true);
    });
  });
  const page = await context.newPage();
  page.once("dialog", (d) => d.accept());
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.locator("canvas").first().waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(2500);
  return { context, page };
};

const DESIGNED_STATE = () => {
  const s = window.useProjectStore.getState();
  s.setDaylight({ hour: 20, enabled: true });
  s.setAllColorTemperature(2700);
  s.updateLights(s.project.lights.map((l) => l.id), { dimmer: 82 });
  s.updateLights(["light-kitchen-west", "light-kitchen-east"], { beamAngleDeg: 110 });
  s.updateLights(["light-dining-west", "light-dining-east"], { cordLengthM: 1.0 });
  if (s.select) s.select(null);
};

const lerp = (a, b, f) => a + (b - a) * f;
const ease = (f) => f * f * (3 - 2 * f); // smoothstep

// フレーム駆動シーケンサ
const makeSeq = (page, dir) => {
  let cursor = { x: 0, y: 0 };
  let frame = 0;
  const shoot = async () => {
    await page.screenshot({ path: `${dir}/f${String(frame).padStart(4, "0")}.png` });
    frame += 1;
  };
  return {
    setCursor: async (x, y) => { cursor = { x, y }; await page.mouse.move(x, y); },
    // n フレームかけて (x,y) へ滑らかに移動
    moveTo: async (x, y, n) => {
      const from = { ...cursor };
      for (let i = 1; i <= n; i += 1) {
        const f = ease(i / n);
        cursor = { x: lerp(from.x, x, f), y: lerp(from.y, y, f) };
        await page.mouse.move(cursor.x, cursor.y);
        await shoot();
      }
    },
    hold: async (n) => {
      for (let i = 0; i < n; i += 1) {
        await page.mouse.move(cursor.x + (i % 2 ? 0.5 : 0), cursor.y);
        await shoot();
      }
    },
    do: async (fn) => fn(),
    shoot,
    cursorPos: () => cursor,
    frameNo: () => frame
  };
};

const browser = await chromium.launch({ headless: false });

// ---------- U12: 2D全画面 → 通常(3D出現) → 照明選択 → 吊り長さ (26.8s = 804f) ----------
{
  const { context, page } = await newPage(browser);
  await page.addStyleTag({ content: '[role="status"]{visibility:hidden !important}' });
  await page.evaluate(DESIGNED_STATE);
  await page.evaluate(() => {
    window.useProjectStore.getState().updateLights(["light-dining-west", "light-dining-east"], { cordLengthM: 0.7 });
  });
  await page.evaluate(() => {
    window.useProjectStore.getState().setCamera({ position: { x: -3.6, y: 1.55, z: 2.6 }, target: { x: 0.8, y: 1.0, z: -2.4 }, fov: 75 });
  });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Maximize 2D" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Fit to view" }).click();
  await page.waitForTimeout(700);

  const dir = `${BASE}/frames/U12`;
  await mkdir(dir, { recursive: true });
  const seq = makeSeq(page, dir);
  await seq.setCursor(1700, 950);

  // [0-24f] 静止
  await seq.hold(24);
  // [24-100f] Import floor planへ
  const ib = await page.getByRole("button", { name: "Import floor plan" }).boundingBox();
  await seq.moveTo(ib.x + ib.width / 2, ib.y + ib.height / 2, 76);
  // [100-132f] ホバー
  await seq.hold(32);
  // [132-168f] 復元ボタンへ
  const rb = await page.getByRole("button", { name: "Return to normal view" }).boundingBox();
  await seq.moveTo(rb.x + rb.width / 2, rb.y + rb.height / 2, 36);
  // [168-171f] 静止 → クリック (5.7s = f171)
  await seq.hold(3);
  await page.mouse.down();
  await seq.shoot();
  await page.mouse.up();
  await page.waitForTimeout(250);
  await seq.shoot();
  // [173-205f] カーソル退避
  await seq.moveTo(1000, 840, 32);
  // [205-504f] 3Dを見せる
  await seq.hold(504 - seq.frameNo());
  // [504-533f] 2Dのペンダントマーカーへ (16.8s〜)
  const light = page.locator(".plan-light[data-light-id='light-dining-west']");
  const lb = await light.boundingBox();
  await seq.moveTo(lb.x + lb.width / 2, lb.y + lb.height / 2, 29);
  // [534f = 17.8s] 選択
  await light.dispatchEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1 });
  await page.locator(".light-inspector").waitFor({ state: "visible", timeout: 5000 });
  await seq.shoot();
  await seq.hold(8);
  // [543-576f] Drop lengthスライダーのつまみへ
  const drop = page.locator(".light-inspector .light-range-control input[type='range']").nth(1);
  const db = await drop.boundingBox();
  const THUMB = 16;
  const sx = (frac) => db.x + THUMB / 2 + (db.width - THUMB) * frac;
  const sy = db.y + db.height / 2;
  const frac0 = (700 - 100) / 2900;
  const frac1 = (1000 - 100) / 2900;
  await seq.moveTo(sx(frac0), sy, 33);
  // [576-588f] 一拍
  await seq.hold(12);
  // [588f = 19.6s] ドラッグ(値はReact対応のネイティブsetterで駆動し、カーソルをつまみに同期)
  await page.mouse.down();
  await seq.shoot();
  const setDrop = async (mm) => drop.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, mm);
  const DRAG_FRAMES = 33;
  for (let i = 1; i <= DRAG_FRAMES; i += 1) {
    const f = ease(i / DRAG_FRAMES);
    const mm = Math.round((700 + (1000 - 700) * f) / 10) * 10;
    await setDrop(mm);
    await seq.moveTo(sx((mm - 100) / 2900), sy, 1);
  }
  await page.mouse.up();
  await seq.shoot();
  const finalVal = await drop.evaluate((el) => el.value);
  console.log(`dropFinal=${finalVal}`);
  // [626-650f] カーソル退避
  await seq.moveTo(1180, 940, 24);
  // [-804f] 結果ホールド
  await seq.hold(804 - seq.frameNo());
  console.log(`U12 frames=${seq.frameNo()}`);
  await context.close();
}

// ---------- U3: Save project (3.93s = 118f) ----------
{
  const { context, page } = await newPage(browser);
  await page.addStyleTag({ content: '[role="status"]{visibility:hidden}' });
  await page.evaluate(DESIGNED_STATE);
  await page.evaluate(() => {
    window.useProjectStore.getState().setCamera({ position: { x: -3.6, y: 1.55, z: 2.6 }, target: { x: 0.8, y: 1.0, z: -2.4 }, fov: 75 });
  });
  await page.waitForTimeout(600);

  const dir = `${BASE}/frames/U3`;
  await mkdir(dir, { recursive: true });
  const seq = makeSeq(page, dir);
  await seq.setCursor(1500, 900);
  // [0-12f] 静止
  await seq.hold(12);
  // [12-42f] Save projectへ
  const sb = await page.getByRole("button", { name: "Save project" }).boundingBox();
  await seq.moveTo(sb.x + sb.width / 2, sb.y + sb.height / 2, 30);
  await seq.hold(3);
  // [45f = 1.5s] クリック → 保存通知を表示
  const dl = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await page.mouse.down();
  await seq.shoot();
  await page.mouse.up();
  await dl;
  await page.evaluate(() => {
    const el = document.querySelector('[role="status"]');
    if (el) el.style.setProperty("visibility", "visible", "important");
  });
  await seq.shoot();
  await seq.hold(15);
  // [63f-] カーソル退避 → ホールド
  await seq.moveTo(sb.x + sb.width / 2 - 40, sb.y + sb.height / 2 + 130, 20);
  await seq.hold(118 - seq.frameNo());
  console.log(`U3 frames=${seq.frameNo()}`);
  await context.close();
}

await browser.close();
console.log("done");
