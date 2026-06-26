import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const headless = process.env.EXPLORATORY_CHECK_HEADLESS !== "false";
const canvasTimeoutMs = Number(process.env.EXPLORATORY_CHECK_CANVAS_TIMEOUT_MS ?? 30000);
const shouldPeekRealistic = process.argv.includes("--realistic") || process.env.EXPLORATORY_CHECK_REALISTIC === "true";
const url = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ?? "http://127.0.0.1:5175/";
const outputPath = "output/playwright/ldk-lighting-lab-exploratory.png";
const introSeenStorageKey = "ldk-intro-seen";
const completedSteps = [];
const failures = [];
const warnings = [];

await mkdir("output/playwright", { recursive: true });

const browser = await chromium.launch({
  headless,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
await page.addInitScript((storageKey) => {
  window.localStorage.setItem(storageKey, "1");
}, introSeenStorageKey);

const isIgnorableResource = (resourceUrl) => /favicon|apple-touch-icon|site\.webmanifest|manifest\.json/.test(resourceUrl);

page.on("console", (message) => {
  if (message.type() === "error") {
    warnings.push(`console.error: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  failures.push(`pageerror: ${error.message}`);
});
page.on("requestfailed", (request) => {
  if (!isIgnorableResource(request.url())) {
    failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`);
  }
});
page.on("response", (response) => {
  if (response.status() >= 400 && !isIgnorableResource(response.url())) {
    failures.push(`http.${response.status()}: ${response.url()}`);
  }
});

const step = async (name, action) => {
  console.log(`step=${name}`);
  try {
    await action();
    completedSteps.push(name);
  } catch (error) {
    const failurePath = `output/playwright/exploratory-failed-${name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
    await page.screenshot({
      path: failurePath,
      fullPage: true,
      timeout: 10000
    }).then(() => {
      console.log(`failureScreenshot=${failurePath}`);
    }).catch((screenshotError) => {
      console.log(`failureScreenshotError=${screenshotError.message}`);
    });
    failures.push(`${name}: ${error.message}`);
    throw error;
  }
};

const closeIntroIfVisible = async () => {
  const startButton = page.getByRole("button", { name: "はじめる" });
  if (await startButton.isVisible({ timeout: 1500 }).catch(() => false)) {
    await startButton.dispatchEvent("click");
    await startButton.waitFor({ state: "hidden", timeout: 5000 });
  }
};

const selectOperationMode = async (value) => {
  await page.locator(".edit-toolbar-mode select").selectOption(value);
  await page.waitForTimeout(120);
};

const assertTextVisible = async (textOrRegex, timeout = 5000) => {
  await page.getByText(textOrRegex).first().waitFor({ state: "visible", timeout });
};

const assertCanvasVisible = async () => {
  await page.locator("canvas").first().waitFor({ state: "attached", timeout: canvasTimeoutMs });
  await page.waitForTimeout(600);
};

const sampleCanvas = async () => {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { found: false, nonDarkPixels: 0 };
    const sample = document.createElement("canvas");
    sample.width = 160;
    sample.height = 100;
    const context = sample.getContext("2d");
    if (!context) return { found: true, nonDarkPixels: 0 };
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let nonDarkPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 48) {
        nonDarkPixels += 1;
      }
    }
    return { found: true, nonDarkPixels };
  });
};

const dragLocator = async (locator, fromRatio, toRatio) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("target bounding box is not available");
  const start = {
    x: box.x + box.width * fromRatio.x,
    y: box.y + box.height * fromRatio.y
  };
  const end = {
    x: box.x + box.width * toRatio.x,
    y: box.y + box.height * toRatio.y
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
};

try {
  await step("load app and dismiss intro", async () => {
    await page.goto(url, { waitUntil: "networkidle" });
    await closeIntroIfVisible();
    await assertCanvasVisible();
  });

  await step("sample initial 3d canvas", async () => {
    const canvasCheck = await sampleCanvas();
    if (!canvasCheck.found || canvasCheck.nonDarkPixels < 300) {
      throw new Error(`3D canvas looks blank: ${JSON.stringify(canvasCheck)}`);
    }
    console.log(`initialCanvasNonDarkPixels=${canvasCheck.nonDarkPixels}`);
  });

  await step("cycle edit operation modes", async () => {
    await selectOperationMode("move");
    await assertTextVisible("ドラッグで移動");
    await selectOperationMode("wall");
    await assertTextVisible(/クリックで壁の頂点/);
    await selectOperationMode("select");
    await assertTextVisible("クリックで選択・ドラッグで移動");
  });

  await step("switch floors", async () => {
    await page.getByRole("button", { name: "2階" }).click();
    await assertTextVisible(/2階編集中/);
    await page.getByRole("button", { name: "1階" }).click();
    await page.getByText(/2階編集中/).waitFor({ state: "hidden", timeout: 5000 });
  });

  await step("open add menu and start cancellable placement", async () => {
    await page.getByRole("button", { name: "＋追加" }).click();
    await page.getByRole("button", { name: /開口・構造/ }).click();
    await page.getByRole("menuitem", { name: /吹き抜け/ }).click();
    await assertTextVisible(/クリックした位置に配置/);
    await page.keyboard.press("Escape");
    await assertTextVisible("クリックで選択・ドラッグで移動");
  });

  await step("pan 2d plan and toggle plan focus", async () => {
    const plan = page.locator(".plan-canvas");
    await dragLocator(plan, { x: 0.5, y: 0.5 }, { x: 0.58, y: 0.42 });
    await page.getByRole("button", { name: "2Dを最大化" }).click();
    await page.getByRole("button", { name: "通常表示に戻す" }).first().click();
  });

  await step("drag 3d viewport and toggle viewport focus", async () => {
    const viewport = page.locator(".scene-stage canvas").first();
    await dragLocator(viewport, { x: 0.5, y: 0.5 }, { x: 0.62, y: 0.45 });
    await page.getByRole("button", { name: "3Dを最大化" }).click();
    await page.getByRole("button", { name: "通常表示に戻す" }).first().click();
  });

  await step("open daylight controls", async () => {
    await page.getByRole("button", { name: /日光/ }).click();
    await page.getByLabel("日光を有効にする").check();
    await page.locator(".daylight-popover input[type='range']").fill("18");
    await page.getByRole("button", { name: /日光/ }).click();
  });

  if (shouldPeekRealistic) {
    await step("peek realistic mode", async () => {
      await page.locator(".view-mode-toggle button").filter({ hasText: "リアル" }).click();
      await assertTextVisible(/BVH生成中|間接光リアル描画/);
      await page.waitForTimeout(1200);
      await page.locator(".view-mode-toggle button").filter({ hasText: "編集" }).click();
      await assertTextVisible(/編集プレビュー/);
    });
  } else {
    await step("confirm realistic control exists", async () => {
      await page.locator(".view-mode-toggle button").filter({ hasText: "リアル" }).waitFor({ state: "visible" });
      console.log("realisticModeSkipped=set EXPLORATORY_CHECK_REALISTIC=true or pass --realistic to exercise live path tracing");
    });
  }

  await step("open output controls without rendering", async () => {
    await page.getByRole("button", { name: "出力 / レンダリング" }).click();
    const output = page.locator(".output-popover");
    await output.waitFor({ state: "visible", timeout: 5000 });
    await output.locator("select").first().waitFor({ state: "visible", timeout: 5000 });
    await output.getByRole("button", { name: "レンダリング開始" }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "出力 / レンダリング" }).click();
  });

  await step("open help dialog", async () => {
    await page.getByRole("button", { name: "使い方を見る" }).click();
    await assertTextVisible("LDK Lighting Lab とは");
    await page.getByRole("button", { name: "はじめる" }).dispatchEvent("click");
  });

  await step("sample final 3d canvas", async () => {
    await assertCanvasVisible();
    const canvasCheck = await sampleCanvas();
    if (!canvasCheck.found || canvasCheck.nonDarkPixels < 300) {
      throw new Error(`3D canvas looks blank after journey: ${JSON.stringify(canvasCheck)}`);
    }
    console.log(`finalCanvasNonDarkPixels=${canvasCheck.nonDarkPixels}`);
  });

  await page.screenshot({ path: outputPath, fullPage: true, timeout: 15000 }).catch((error) => {
    warnings.push(`screenshotError=${error.message}`);
  });
} finally {
  await browser.close();
}

if (warnings.length > 0) {
  for (const warning of warnings) {
    console.log(`warning=${warning}`);
  }
}
if (failures.length > 0) {
  throw new Error(`Exploratory check failed:\n${failures.join("\n")}`);
}

console.log(`completedSteps=${completedSteps.join(", ")}`);
console.log(`screenshot=${outputPath}`);
