// public/demo/rooms/*.json の各部屋をアプリで開き、投稿用の背景プレートを撮る。
// capture-plates.mjs が「同じ部屋で色温度だけ変える」のに対し、こちらは「部屋そのものを変える」。
//
// 使い方: npm run dev を別ターミナルで起動してから
//   npm run ig:rooms [-- <url>] [-- <projectId> ...] [-- --flat-only]
//
// 出力: marketing/instagram/plates/room-<projectId>.png       設計した灯り
//       marketing/instagram/plates/room-<projectId>-flat.png  同じ部屋・等間隔ダウンライトだけ
// どちらもカメラ・露出・家具は同じで、照明だけを差し替えた比較用。
import { mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const url = args.find((arg) => arg.startsWith("http")) ?? "http://127.0.0.1:5173/";
const flatOnly = args.includes("--flat-only");
const designedOnly = args.includes("--designed-only");
const idFilter = args.filter((arg) => !arg.startsWith("http") && !arg.startsWith("--"));

const SRC_DIR = "public/demo/rooms";
const OUT_DIR = "marketing/instagram/plates";

// 投稿と同じ 4:5 で撮る。ソフトウェア描画では画素数がそのまま撮影時間になるため、
// カルーセルの出力サイズ(1080x1350)より大きくしない。
// ヘッダー等の余白ぶん高さを足し、切り出される canvas 自体が 4:5 を満たすようにする。
const VIEWPORT = { width: 1080, height: 1530 };

const HIDE_CHROME_CSS = `
  .top-chrome, .shared-toolbar { display: none !important; }
  .viewport-view-actions, .focus-toggle, .viewport-panel > .panel-head,
  .viewport-title, .daylight-wrap { display: none !important; }
  .scene-overlay, .autosave-note, .feedback-launcher, .scene-badge,
  .disclaimer-badge, .mobile-bottom-bar { display: none !important; }
`;

const prebuiltChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(prebuiltChromium) ? prebuiltChromium : undefined;

/**
 * 比較用の「とりあえず等間隔にダウンライト」版を作る。
 * 部屋・家具・カメラ・露出はそのままで、照明だけを昼白色の汎用ダウンライトの格子に置き換える。
 */
const withFlatLighting = (project) => {
  const { widthM, depthM, ceilingHeightM } = project.room;
  const spacingM = 1.9;
  const columns = Math.max(2, Math.round(widthM / spacingM) - 1);
  const rows = Math.max(2, Math.round(depthM / spacingM) - 1);
  const lights = [];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const x = -widthM / 2 + (widthM / (columns + 1)) * (column + 1);
      const z = -depthM / 2 + (depthM / (rows + 1)) * (row + 1);
      lights.push({
        id: `flat-${column}-${row}`,
        name: `ダウンライト ${column + 1}-${row + 1}`,
        type: "downlight",
        model: "dl-diffuse",
        position: { x, y: ceilingHeightM - 0.04, z },
        mountHeightM: ceilingHeightM,
        rotationDeg: { x: -90, y: 0, z: 0 },
        target: { x, y: 0, z },
        lumens: 680,
        colorTemperatureK: 5000,
        dimmer: 100,
        enabled: true,
        beamAngleDeg: 110,
        penumbra: 0.95,
        castsShadow: true,
        note: "等間隔に並べただけの汎用ダウンライト（比較用）"
      });
    }
  }
  return {
    ...project,
    id: `${project.id}-flat`,
    name: `${project.name}（等間隔ダウンライト）`,
    lights
  };
};

await mkdir(OUT_DIR, { recursive: true });
const files = (await readdir(SRC_DIR))
  .filter((file) => file.endsWith(".json"))
  .filter((file) => idFilter.length === 0 || idFilter.includes(file.replace(".json", "")))
  .sort();
if (files.length === 0) throw new Error(`no matching project: ${idFilter.join(", ")}`);

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: "ja-JP" });
await page.addInitScript(() => window.localStorage.setItem("ldk-intro-seen", "1"));
page.on("pageerror", (error) => console.log(`pageerror: ${error.message}`));

/** 隠しファイル入力を経由せず、自動保存(IndexedDB)へ直接置いてからリロードで復元させる。 */
async function openProject(project) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // アプリ側のデバウンス自動保存が先に走るため、それが落ち着いてから上書きする。
  await page.waitForTimeout(2500);
  await page.evaluate(
    (data) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("ldk-lighting-lab", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects");
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("projects", "readwrite");
          tx.objectStore("projects").put(data, "current-project");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    project
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("canvas").first().waitFor({ state: "attached", timeout: 60000 });
  await page.waitForTimeout(3000);
}

async function capture(project, outName) {
  await openProject(project);

  // 復元できたかを名前で確認する（失敗するとデモの部屋を撮ってしまうため）。
  const title = await page.locator(".app-header h1").first().innerText();
  if (!title.includes(project.name.slice(0, 8))) {
    throw new Error(`project not restored for ${outName}: header="${title}"`);
  }

  await page.locator('.focus-toggle[aria-label="3Dを最大化"]').dispatchEvent("click");
  await page.addStyleTag({ content: HIDE_CHROME_CSS });
  await page.waitForTimeout(3000);

  // canvas はリサイズが落ち着かず locator.boundingBox() の安定判定を通らないことがあるため、
  // DOM から直接矩形を取ってページ側のクリップ撮影にする。
  const box = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const { x, y, width, height } = canvas.getBoundingClientRect();
    return { x, y, width, height };
  });
  if (!box || box.width < 200) throw new Error(`canvas bounding box not found for ${outName}`);
  const path = `${OUT_DIR}/${outName}.png`;
  await page.screenshot({ path, clip: box, timeout: 60000 });
  console.log(`plate=${path} ${Math.round(box.width)}x${Math.round(box.height)}`);
}

for (const file of files) {
  const id = file.replace(".json", "");
  const project = JSON.parse(await readFile(`${SRC_DIR}/${file}`, "utf8"));
  if (!flatOnly) await capture(project, `room-${id}`);
  if (!designedOnly) await capture(withFlatLighting(project), `room-${id}-flat`);
}

await browser.close();
console.log(`\nroom plates ready in ${OUT_DIR}`);
