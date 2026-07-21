// サムネイル生成: warm/white左右分割の背景 + タイトルオーバーレイ
// 前提: output/demo-video/thumb-base.png (compose時のstillsから生成)
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base64 = (await readFile("output/demo-video/thumb-base.png")).toString("base64");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1920px;height:1080px;overflow:hidden;
    font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;}
  .bg{position:absolute;inset:0;background:url(data:image/png;base64,${base64});background-size:cover;}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,
    rgba(10,9,7,0.12) 0%, rgba(10,9,7,0) 30%, rgba(10,9,7,0) 55%, rgba(10,9,7,0.82) 100%);}
  .labels{position:absolute;top:36px;left:0;right:0;display:flex;justify-content:space-between;
    padding:0 56px;}
  .labels span{color:#fff;font-size:30px;font-weight:700;letter-spacing:1px;
    background:rgba(10,9,7,0.55);padding:10px 22px;border-radius:999px;}
  .title{position:absolute;left:0;right:0;bottom:64px;text-align:center;}
  .logo{display:flex;align-items:center;justify-content:center;gap:20px;}
  .mark{width:52px;height:52px;border-radius:50%;border:3px solid #f5c64d;
    display:flex;align-items:center;justify-content:center;background:rgba(10,9,7,0.35);}
  .mark i{width:20px;height:20px;border-radius:50%;background:#f5c64d;display:block;}
  h1{margin:0;color:#fff;font-size:96px;font-weight:800;letter-spacing:0.5px;
    text-shadow:0 4px 26px rgba(0,0,0,0.65);}
  p{margin:14px 0 0;color:#f0ead9;font-size:38px;font-weight:600;
    text-shadow:0 2px 14px rgba(0,0,0,0.7);}
</style></head><body>
  <div class="bg"></div><div class="shade"></div>
  <div class="labels"><span>Warm light</span><span>White light</span></div>
  <div class="title">
    <div class="logo"><span class="mark"><i></i></span><h1>Lighting Lab</h1></div>
    <p>See your home's lighting before you build.</p>
  </div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(html);
await page.waitForTimeout(400);
await page.screenshot({ path: "output/demo-video/lighting-lab-thumbnail.png" });
await browser.close();
console.log("thumbnail=output/demo-video/lighting-lab-thumbnail.png");
