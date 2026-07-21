// エンドカードPNG (1920x1080) を生成
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

await mkdir("output/demo-video/assets", { recursive: true });

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1920px;height:1080px;background:#0f0e0b;
    font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;}
  .wrap{width:100%;height:100%;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:34px;}
  .logo{display:flex;align-items:center;gap:26px;}
  .mark{width:64px;height:64px;border-radius:50%;background:#0f0e0b;
    border:3px solid #f5c64d;display:flex;align-items:center;justify-content:center;}
  .mark i{width:26px;height:26px;border-radius:50%;background:#f5c64d;display:block;}
  h1{margin:0;color:#f3efe7;font-size:104px;font-weight:760;letter-spacing:0.5px;}
  p.tag{margin:10px 0 0;color:#cfc7b8;font-size:40px;font-weight:500;letter-spacing:0.3px;}
  p.bw{margin:56px 0 0;color:#8f8779;font-size:28px;font-weight:600;
    text-transform:uppercase;letter-spacing:3.5px;}
</style></head><body>
  <div class="wrap">
    <div class="logo"><span class="mark"><i></i></span><h1>Lighting Lab</h1></div>
    <p class="tag">Plan your lighting before you build.</p>
    <p class="bw">OpenAI Build Week</p>
  </div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(html);
await page.waitForTimeout(400);
await page.screenshot({ path: "output/demo-video/assets/endcard.png" });
await browser.close();
console.log("endcard=output/demo-video/assets/endcard.png");
