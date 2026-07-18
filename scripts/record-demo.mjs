import { execFileSync } from "node:child_process";
import { mkdir, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ?? "http://127.0.0.1:5173/";
const outDir = "output/demo-video";
const baseName = "ldk-lighting-lab-demo";

await mkdir(outDir, { recursive: true });

// 過去の実行を上書きしないよう、既存ファイルから次のバージョン番号を決める。
const existing = await readdir(outDir);
const versionPattern = new RegExp(`^${baseName}-v(\\d+)\\.(webm|mp4)$`);
const usedVersions = existing
  .map((file) => Number(file.match(versionPattern)?.[1]))
  .filter((n) => Number.isFinite(n));
const version = usedVersions.length ? Math.max(...usedVersions) + 1 : 1;
const webmName = `${baseName}-v${version}.webm`;
const mp4Name = `${baseName}-v${version}.mp4`;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: outDir, size: { width: 1600, height: 1000 } }
});
const page = await context.newPage();

page.on("pageerror", (error) => console.log(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") console.log(`console.error: ${message.text()}`);
});

const step = async (label, fn) => {
  console.log(`step: ${label}`);
  await fn();
};

const onOffToggle = page.locator(".light-onoff-label input[type='checkbox'], .light-toggle input[type='checkbox']").first();

await step("goto", () => page.goto(url, { waitUntil: "networkidle" }));
await step("wait canvas", () => page.locator("canvas").first().waitFor({ state: "attached", timeout: 30000 }));
await page.waitForTimeout(1200);

await step("dismiss intro", () => page.getByRole("button", { name: "はじめる" }).click({ timeout: 5000 })).catch(() => {});
await page.waitForTimeout(300);

await step("import project", () =>
  page.locator('input[type="file"][accept*="json"]').setInputFiles("public/demo/share-demo-project.json")
);
await page.getByRole("status").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2200); // 2D+3D+Inspectorが揃った状態を見せる

// 色温度プリセットの chip は [電球色2700K, 温白色3500K, 昼白色5000K, 昼光色6500K] の固定順。
// TVまわり(リビングダウンライト1-3 + TV背面テープ)を shift+クリックで複数選択する。
const tvGroupIds = [
  "light-tv-wall-1",
  "light-tv-wall-2",
  "light-tv-wall-3",
  "light-tv-tape"
];
for (const id of tvGroupIds) {
  await step(`select ${id}`, () =>
    page.locator(`.plan-light[data-light-id="${id}"] circle`).click({ force: true, modifiers: ["Shift"] })
  );
}
await page.waitForTimeout(400);

await step("tv group off", () => onOffToggle.uncheck());
await page.waitForTimeout(1800); // TVまわりが消えた「消灯」状態を見せる

const bulkColorChips = page.locator("label.field", { hasText: "色温度プリセット" }).locator("button.chip");
await step("tv group on + warm color", async () => {
  await onOffToggle.check();
  await bulkColorChips.nth(0).click(); // 電球色 2700K
  await page.getByLabel("調光").fill("92");
  await page.getByLabel("調光").press("Tab");
});
await page.waitForTimeout(2800); // TVまわりが暖色で「点灯」する様子を見せる

// ダイニングペンダントだけ選択し、消灯 → 昼白色(5000K)で点灯し直して団欒感を出す。
await step("select dining pendant", () =>
  page.locator('.plan-light[data-light-id="light-dining-pendant"] circle').click({ force: true })
);
await step("dining off", () => onOffToggle.uncheck());
await page.waitForTimeout(1800); // ダイニングが消えた状態を見せる

const singleColorChips = page.locator("label.field", { hasText: "色温度プリセット" }).locator("button.chip");
await step("dining on + daylight white", async () => {
  await onOffToggle.check();
  await singleColorChips.nth(2).click(); // 昼白色 5000K
  await page.locator(".light-range-control input[type='range']").fill("100");
});
await page.waitForTimeout(2800); // ダイニングが白色で「点灯」する様子を見せる

// 最終カットに選択枠が映り込まないよう選択解除してから最大化する。
await step("deselect", () =>
  page.locator('.plan-light[data-light-id="light-dining-pendant"] circle').click({ force: true })
);
await page.waitForTimeout(300);

await step("maximize 3d", () => page.getByRole("button", { name: "3Dを最大化" }).click());
await page.waitForTimeout(3500); // 2ゾーンの雰囲気差が揃った最終カットを保持

await step("close", async () => {
  await page.waitForTimeout(500);
  await context.close();
  await browser.close();
});

const files = await readdir(outDir);
const recorded = files.find((file) => file.endsWith(".webm") && !versionPattern.test(file));
if (!recorded) {
  console.log("video=NOT_FOUND");
  process.exit(1);
}
await rename(join(outDir, recorded), join(outDir, webmName));
console.log(`webm=${join(outDir, webmName)}`);

execFileSync("ffmpeg", [
  "-y",
  "-i", join(outDir, webmName),
  "-vf", "scale=1600:-2,fps=30",
  "-c:v", "libx264",
  "-profile:v", "high",
  "-pix_fmt", "yuv420p",
  "-crf", "18",
  "-preset", "slow",
  "-movflags", "+faststart",
  join(outDir, mp4Name)
], { stdio: "inherit" });
await unlink(join(outDir, webmName));

console.log(`video=${join(outDir, mp4Name)}`);
