// 部屋の選択画面(?demo)用サムネイルを、撮影済みプレートから生成する。
//
// 使い方: npm run demo:thumbs
// 入力: marketing/instagram/plates/room-<projectId>.png（npm run ig:rooms で撮る）
// 出力: public/demo/rooms/thumbs/<key>.jpg（4:3・480x360）
//
// 画像処理用の依存を増やしたくないので、Chromium の canvas で縮小・JPEG 化する。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const SRC_DIR = "marketing/instagram/plates";
const OUT_DIR = "public/demo/rooms/thumbs";
const WIDTH = 480;
const HEIGHT = 360;

// key は src/data/demoRooms.ts と一致させる。
const ROOMS = [
  { key: "machiya", plate: "room-jp-machiya-toriniwa.png" },
  { key: "hiraya", plate: "room-jp-hiraya-engawa.png" },
  { key: "skipfloor", plate: "room-jp-skipfloor-tokyo.png" },
  { key: "copenhagen", plate: "room-dk-copenhagen-apartment.png" },
  { key: "mediterranean", plate: "room-es-mediterranean-arch.png" },
  { key: "loft", plate: "room-us-brooklyn-loft.png" }
];

await mkdir(OUT_DIR, { recursive: true });

const prebuiltChromium = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(prebuiltChromium) ? prebuiltChromium : undefined,
  args: ["--disable-dev-shm-usage"]
});
const page = await browser.newPage();

for (const room of ROOMS) {
  const source = `${SRC_DIR}/${room.plate}`;
  if (!existsSync(source)) throw new Error(`plate not found: ${source} (run npm run ig:rooms)`);
  const dataUrl = `data:image/png;base64,${(await readFile(source)).toString("base64")}`;

  // 縦長プレートの中央やや上（家具と照明が集まる帯）を 4:3 で切り出す。
  const jpeg = await page.evaluate(
    async ({ dataUrl: src, width, height }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const cropHeight = Math.min(image.height, image.width * (height / width));
      const cropTop = Math.max(0, (image.height - cropHeight) * 0.42);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, cropTop, image.width, cropHeight, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.72);
    },
    { dataUrl, width: WIDTH, height: HEIGHT }
  );

  const out = `${OUT_DIR}/${room.key}.jpg`;
  const buffer = Buffer.from(jpeg.split(",")[1], "base64");
  await writeFile(out, buffer);
  console.log(`thumb=${out} ${Math.round(buffer.length / 1024)}KB`);
}

await browser.close();
console.log(`\nthumbs ready in ${OUT_DIR}`);
