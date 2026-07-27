// サムネイルの背景に使う「実際のシミュレーション画像」をアプリから取り出す。
// 色温度だけを差し替えた同一アングルの比較プレートを作るのが目的。
//
// 使い方: npm run dev を別ターミナルで起動してから
//   node scripts/instagram/capture-plates.mjs [url]
//
// 出力: marketing/instagram/plates/*.png (9:16。4:5 や 1:1 へは CSS の cover で切り出す)
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:5173/";
const OUT_DIR = "marketing/instagram/plates";

// 9:16 のリールカバーを原寸で撮り、そこから 4:5 / 1:1 を切り出す。
// アプリは min-width:1180px なので幅はそれ以上にする。
const VIEWPORT = { width: 1280, height: 2276 };

// 色温度プリセットのラベルと、書き出しファイル名。
const PLATES = [
  { chip: "電球色", name: "warm-2700k" },
  { chip: "温白色", name: "neutral-3500k" },
  { chip: "昼白色", name: "cool-5000k" },
  { chip: "昼光色", name: "daylight-6500k" }
];

// 全画面 3D にしたうえで、画面に残る UI（免責バッジ・オートセーブ表示など）を隠す。
// 撮影用の一時スタイルなのでアプリ側には入れない。
const HIDE_CHROME_CSS = `
  .top-chrome, .shared-toolbar { display: none !important; }
  .viewport-view-actions, .focus-toggle, .viewport-panel > .panel-head,
  .viewport-title, .daylight-wrap { display: none !important; }
  .scene-overlay, .autosave-note, .feedback-launcher, .scene-badge,
  .disclaimer-badge, .mobile-bottom-bar { display: none !important; }
`;

const prebuiltChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(prebuiltChromium) ? prebuiltChromium : undefined;

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: "ja-JP" });
await page.addInitScript(() => window.localStorage.setItem("ldk-intro-seen", "1"));

page.on("pageerror", (error) => console.log(`pageerror: ${error.message}`));

// インスペクタは値表示が動き続けて Playwright の actionability 判定を通らないことがあるため、
// 実クリックではなくイベント送出で操作する。
const fire = (locator) => locator.dispatchEvent("click");

async function loadApp() {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("canvas").first().waitFor({ state: "attached", timeout: 60000 });
  await page.waitForTimeout(2500);
  // 色温度チップは折りたたまれた <details> の中にあるので、開かないとクリックできない。
  await page.evaluate(() => {
    document.querySelectorAll("details").forEach((element) => {
      element.open = true;
    });
  });
}

/** 照明の投稿なので夜のシーンにする。既定は日光ONの昼景。 */
async function disableDaylight() {
  await fire(page.locator(".daylight-toggle"));
  await page.waitForTimeout(400);
  const enabledCheckbox = page.locator('.daylight-popover input[type="checkbox"]').first();
  if (await enabledCheckbox.isChecked()) {
    await enabledCheckbox.uncheck({ force: true });
  }
  await page.waitForTimeout(1200);
  await fire(page.locator(".daylight-toggle"));
}

for (const plate of PLATES) {
  await loadApp();
  await disableDaylight();

  await fire(page.locator(".chip-row .chip").filter({ hasText: plate.chip }).first());
  await page.waitForTimeout(1500);

  // .focus-toggle は 2D 側にも同じクラスであるため、aria-label で 3D 側に限定する
  // （2D を最大化すると .viewport-panel が display:none になり canvas が撮れない）。
  await fire(page.locator('.focus-toggle[aria-label="3Dを最大化"]'));
  await page.addStyleTag({ content: HIDE_CHROME_CSS });
  await page.waitForTimeout(3000);

  // canvas はリサイズが落ち着かず locator.screenshot() の安定判定を通らないため、
  // 矩形を取ってページ側のクリップ撮影にする。
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error(`canvas bounding box not found for ${plate.name}`);
  const path = `${OUT_DIR}/${plate.name}.png`;
  await page.screenshot({ path, clip: box, timeout: 60000 });
  console.log(`plate=${path} ${Math.round(box.width)}x${Math.round(box.height)}`);
}

await browser.close();
console.log(`\nplates ready in ${OUT_DIR}`);
