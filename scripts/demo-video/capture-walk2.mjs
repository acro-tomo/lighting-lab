// 歩行ショットv2: S6a(リビング・南壁・西窓を見ながら歩く) + S6b(ダイニングへ接近しキッチンへ視線)
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = "output/demo-video/assets";
const FPS = 30;

const MOVES = [
  ["S6a-living", 7.04,
    { pos: { x: 0.3, y: 1.5, z: -0.6 }, tgt: { x: -4.4, y: 1.05, z: 3.2 } },
    { pos: { x: -0.9, y: 1.5, z: 0.3 }, tgt: { x: -4.7, y: 1.05, z: 2.4 } }, 75],
  ["S6b-dining", 6.0,
    { pos: { x: -3.0, y: 1.5, z: 1.6 }, tgt: { x: 0.6, y: 1.0, z: -2.6 } },
    { pos: { x: -1.35, y: 1.5, z: -0.25 }, tgt: { x: 2.0, y: 0.95, z: -2.6 } }, 75]
];

const easedT = (t, r = 0.18) => {
  const flat = 1 - 2 * r;
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

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addInitScript(() => {
  localStorage.setItem("ldk-language", "en");
  localStorage.setItem("ldk-intro-seen", "1");
});
const page = await context.newPage();
page.once("dialog", (d) => d.accept());
await page.goto("http://127.0.0.1:5174/?demo=2", { waitUntil: "domcontentloaded" });
await page.locator("canvas").first().waitFor({ state: "attached", timeout: 30_000 });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "Maximize 3D" }).click();
await page.waitForTimeout(500);
await page.addStyleTag({ content: '[role="status"]{visibility:hidden !important}' });
await page.evaluate(() => {
  const s = window.useProjectStore.getState();
  s.setDaylight({ hour: 20, enabled: true });
  s.setAllColorTemperature(2700);
  s.updateLights(s.project.lights.map((l) => l.id), { dimmer: 82 });
  s.updateLights(["light-kitchen-west", "light-kitchen-east"], { beamAngleDeg: 110 });
  s.updateLights(["light-dining-west", "light-dining-east"], { cordLengthM: 1.0 });
  if (s.select) s.select(null);
});
await page.waitForTimeout(800);

for (const [name, seconds, from, to, fov] of MOVES) {
  const dir = `${BASE}/frames/${name}`;
  await mkdir(dir, { recursive: true });
  const frames = Math.round(seconds * FPS);
  const t0 = Date.now();
  for (let i = 0; i < frames; i += 1) {
    const f = easedT(i / (frames - 1));
    await page.evaluate((cam) => {
      window.useProjectStore.getState().setCamera(cam);
    }, { position: lerpV(from.pos, to.pos, f), target: lerpV(from.tgt, to.tgt, f), fov });
    await page.waitForTimeout(40);
    await page.screenshot({ path: `${dir}/f${String(i).padStart(4, "0")}.png` });
  }
  console.log(`frames=${name} n=${frames} ms/frame=${Math.round((Date.now() - t0) / frames)}`);
}
await browser.close();
console.log("done");
