// リール用の「実際にカメラを動かした」フレーム連番をアプリから撮る。
// スライドショーではなく、3Dシーン内をカメラが移動し、ショットの途中で色温度も変わる。
//
// 構図は実撮りして選定済み（候補6カットのうち採用3・不採用3）:
// - 採用: 引き(S1/S5) / ダイニング正面(S2/S3) / キッチン(S4)
// - 不採用: リビング寄り(前景の丸テーブルが画面を割る) / ダイニング寄りすぎ(ペンダントが切れる) / 吹き抜け(壁面ばかりで情報が無い)
//
// 前提: 別ターミナルで npm run dev
//   node scripts/instagram/capture-reel-shots.mjs [url]
//
// 重要 — GPUが要る:
//   ソフトウェア描画だと1フレーム39〜68秒かかり、実用にならない（実測）。
//   既定はGPUを使う設定なので、Macなどの実機ではそのまま実行すればよい。
//     REEL_FPS=30           書き出しfps
//     REEL_SMOKE=1          各ショット3フレームだけの疎通確認
//     REEL_HEADLESS=1       画面を出さずに実行（GPUが効かない場合があるので通常は不要）
//     REEL_SOFTWARE_GL=1    GPUの無い環境（CI/コンテナ）でのみ付ける
//
// 出力: output/reel-frames/<shotId>/f0000.png と shots.json（尺と色温度の記録）
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

// zsh は対話シェルだと # をコメント扱いしないため、手順書のインラインコメントが
// そのまま引数として渡ってくることがある。URLに見えないものは黙って捨てる。
const urlArg = process.argv.slice(2).find((arg) => /^https?:\/\//.test(arg));
const url = urlArg ?? "http://127.0.0.1:5173/";
const OUT_DIR = "output/reel-frames";
const FPS = Number(process.env.REEL_FPS ?? 30);
const SMOKE = process.env.REEL_SMOKE === "1";

// 撮影サイズ。アプリは min-width:1180px なので幅はそれ以上が要る。
// 9:16 で撮り、エンコード側で 1080x1920 に落とす。
const VIEWPORT = { width: 1280, height: 2276 };

// カメラは position/target/fov を線形補間し、両端だけイーズさせる（capture-walk2.mjs と同じ考え方）。
// colorK に配列を渡すと、そのショットの中で色温度が動く。
const SHOTS = [
  {
    id: "s1-establish",
    seconds: 3.6,
    fov: 74,
    colorK: 2700,
    from: { pos: { x: 2.8, y: 1.75, z: 4.4 }, tgt: { x: -2.2, y: 1.2, z: 0.6 } },
    to: { pos: { x: 2.2, y: 1.7, z: 3.6 }, tgt: { x: -2.4, y: 1.15, z: 0.5 } }
  },
  {
    // 主役カット。カメラが寄りながら、同じ画の中で色温度が 2700K→6500K に動く。
    id: "s2-color-shift",
    seconds: 4.5,
    fov: 70,
    colorK: [2700, 6500],
    from: { pos: { x: 0.2, y: 1.6, z: 1.3 }, tgt: { x: 0.15, y: 1.05, z: -2.65 } },
    to: { pos: { x: 0.2, y: 1.55, z: 0.2 }, tgt: { x: 0.15, y: 1.0, z: -2.65 } }
  },
  {
    id: "s3-dining",
    seconds: 3.2,
    fov: 70,
    colorK: 3500,
    from: { pos: { x: 0.2, y: 1.55, z: 0.2 }, tgt: { x: 0.15, y: 1.0, z: -2.65 } },
    to: { pos: { x: -0.5, y: 1.55, z: -0.1 }, tgt: { x: 0.5, y: 1.0, z: -2.7 } }
  },
  {
    id: "s4-kitchen",
    seconds: 3.2,
    fov: 70,
    colorK: 5000,
    from: { pos: { x: 2.6, y: 1.7, z: -0.4 }, tgt: { x: 4.8, y: 1.05, z: -2.5 } },
    to: { pos: { x: 3.1, y: 1.65, z: -0.9 }, tgt: { x: 5.0, y: 1.0, z: -2.6 } }
  },
  {
    id: "s5-outro",
    seconds: 3.4,
    fov: 74,
    colorK: 2700,
    from: { pos: { x: 2.2, y: 1.7, z: 3.6 }, tgt: { x: -2.0, y: 1.2, z: 0.5 } },
    to: { pos: { x: 3.0, y: 2.0, z: 4.5 }, tgt: { x: -2.0, y: 1.2, z: 0.5 } }
  }
];

// 撮影中だけシーンから外す家具。プロジェクトデータ(demoProject.json)は触らない。
// アプリの既定シーンを変えずに、絵として邪魔なものだけ抜くための撮影用の細工。
// - furniture-island-top: 天板に明暗の境界が階段状に出るため外す
const HIDE_FURNITURE_IDS = ["furniture-island-top"];

// 撮影用に画面のUIを消す（capture-plates.mjs と同じ一時スタイル。アプリ側には入れない）。
const HIDE_CHROME_CSS = `
  .top-chrome, .shared-toolbar { display: none !important; }
  .viewport-view-actions, .focus-toggle, .viewport-panel > .panel-head,
  .viewport-title, .daylight-wrap { display: none !important; }
  .scene-overlay, .autosave-note, .feedback-launcher, .scene-badge,
  .disclaimer-badge, .mobile-bottom-bar { display: none !important; }
  [role="status"] { visibility: hidden !important; }
`;

/** 両端だけ滑らかにする。等速だと出入りが機械的に見える。 */
const eased = (t, r = 0.2) => {
  const shape = (x) => {
    if (x <= 0) return 0;
    if (x < r) return (x * x) / (2 * r);
    if (x <= 1 - r) return r / 2 + (x - r);
    if (x < 1) return r / 2 + (1 - 2 * r) + (r / 2 - ((1 - x) * (1 - x)) / (2 * r));
    return 1 - r + r;
  };
  return shape(t) / shape(1);
};
const lerp = (a, b, f) => a + (b - a) * f;
const lerpV = (a, b, f) => ({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) });

const prebuiltChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(prebuiltChromium) ? prebuiltChromium : undefined;

// GPUのある実機ではソフトウェア描画に落とさない。swiftshaderを強制すると
// 1フレーム数十秒かかり、この連番撮影は実用にならない。
// GPUの無いCI/コンテナでだけ REEL_SOFTWARE_GL=1 を付ける。
const softwareGl = process.env.REEL_SOFTWARE_GL === "1";
const browser = await chromium.launch({
  // ヘッドレスだとGPUが使われないことがあるため既定は表示あり（build week の録画と同じ）。
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

// 照明の投稿なので夜にする。既定は日光ONの昼景。
await page.evaluate((hideIds) => {
  const store = window.useProjectStore.getState();
  store.setDaylight({ enabled: false });
  store.select?.(null);
  if (hideIds.length > 0) {
    window.useProjectStore.setState((state) => ({
      project: {
        ...state.project,
        furniture: state.project.furniture.filter((item) => !hideIds.includes(item.id))
      }
    }));
  }
}, HIDE_FURNITURE_IDS);
await page.waitForTimeout(1200);

// 3Dを最大化してからUIを消す。2D側を最大化すると canvas が display:none になり撮れない。
await page.locator('.focus-toggle[aria-label="3Dを最大化"]').dispatchEvent("click");
await page.addStyleTag({ content: HIDE_CHROME_CSS });
await page.waitForTimeout(3000);

const manifest = [];
for (const shot of SHOTS) {
  const dir = `${OUT_DIR}/${shot.id}`;
  await mkdir(dir, { recursive: true });
  const frames = SMOKE ? 3 : Math.max(2, Math.round(shot.seconds * FPS));
  const startedAt = Date.now();

  for (let index = 0; index < frames; index += 1) {
    const f = eased(index / (frames - 1));
    const colorK = Array.isArray(shot.colorK)
      ? Math.round(lerp(shot.colorK[0], shot.colorK[1], f))
      : shot.colorK;

    await page.evaluate(
      ([pos, tgt, fov, colorK]) => {
        const store = window.useProjectStore.getState();
        store.setAllColorTemperature(colorK);
        // setCamera は履歴を積むので、連番撮影では直接 state を差し替える。
        // CameraViewSync は camera の座標値の変化を見て視点を適用する。
        window.useProjectStore.setState((state) => ({
          project: { ...state.project, camera: { ...state.project.camera, position: pos, target: tgt, fov } }
        }));
      },
      [lerpV(shot.from.pos, shot.to.pos, f), lerpV(shot.from.tgt, shot.to.tgt, f), shot.fov, colorK]
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
  manifest.push({ id: shot.id, frames, seconds: shot.seconds, fps: FPS, colorK: shot.colorK });
}

await writeFile(`${OUT_DIR}/shots.json`, JSON.stringify({ fps: FPS, smoke: SMOKE, shots: manifest }, null, 2), "utf8");
await browser.close();
console.log(`\nframes ready in ${OUT_DIR}`);
