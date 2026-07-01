import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ?? "http://127.0.0.1:5173/";
const outDir = "output/demo-video";
const videoName = "ldk-lighting-lab-demo.webm";

await mkdir(outDir, { recursive: true });

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

await step("goto", () => page.goto(url, { waitUntil: "networkidle" }));
await step("wait canvas", () => page.locator("canvas").first().waitFor({ state: "attached", timeout: 30000 }));
await page.waitForTimeout(1200);

await step("dismiss intro", () => page.getByRole("button", { name: "はじめる" }).click({ timeout: 5000 })).catch(() => {});
await page.waitForTimeout(300);

await step("import project", () =>
  page.locator('input[type="file"][accept*="json"]').setInputFiles("public/demo/share-demo-project.json")
);
await page.getByRole("status").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2600); // 2D+3D+Inspectorが揃った状態を見せる

// 色温度プリセットの chip は [電球色2700K, 温白色3500K, 昼白色5000K, 昼光色6500K] の固定順。
// TVまわり(リビングダウンライト1-3 + TV背面テープ)を shift+クリックで複数選択し、暖色でつける。
const tvGroupLabels = [
  "リビングダウンライト 1",
  "リビングダウンライト 2",
  "リビングダウンライト 3",
  "TV背面間接テープライト"
];
// 2D平面図では照明アイコンの上に家具の透明な当たり判定が重なることがあるため、
// 実クリックではなく pointerdown を直接ディスパッチしてスタッキング順の影響を避ける。
for (const label of tvGroupLabels) {
  await step(`select ${label}`, () =>
    page.locator(".plan-light", { hasText: label }).dispatchEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      button: 0,
      pointerId: 1
    })
  );
}
await page.waitForTimeout(400);

const bulkColorChips = page.locator("label.field", { hasText: "色温度プリセット" }).locator("button.chip");
await step("tv group warm color", () => bulkColorChips.nth(0).click()); // 電球色 2700K
await page.getByLabel("調光").fill("92");
await page.getByLabel("調光").press("Tab");
await page.waitForTimeout(2800); // TVまわりが暖色で灯る様子を見せる

// ダイニングペンダントだけ昼白色(5000K)に切り替えて団欒感を出す。
await step("select dining pendant", () =>
  page.getByLabel("照明を選択").selectOption("light-dining-pendant")
);
const singleColorChips = page.locator("label.field", { hasText: "色温度プリセット" }).locator("button.chip");
await step("dining daylight white", () => singleColorChips.nth(2).click()); // 昼白色 5000K
await page.waitForTimeout(2800); // ダイニングだけ明るい白色に変わる様子を見せる

// 最終カットに選択枠が映り込まないよう選択解除してから最大化する。
await step("deselect", () => page.getByLabel("照明を選択").selectOption(""));
await page.waitForTimeout(300);

await step("maximize 3d", () => page.getByRole("button", { name: "3Dを最大化" }).click());
await page.waitForTimeout(3500); // 2ゾーンの雰囲気差が揃った最終カットを保持

await step("close", async () => {
  await page.waitForTimeout(500);
  await context.close();
  await browser.close();
});

const files = await readdir(outDir);
const recorded = files.find((file) => file.endsWith(".webm") && file !== videoName);
if (recorded) {
  await rename(join(outDir, recorded), join(outDir, videoName));
  console.log(`video=${join(outDir, videoName)}`);
} else {
  console.log("video=NOT_FOUND");
}
