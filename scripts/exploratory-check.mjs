import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const headless = process.env.EXPLORATORY_CHECK_HEADLESS !== "false";
const canvasTimeoutMs = Number(process.env.EXPLORATORY_CHECK_CANVAS_TIMEOUT_MS ?? 30000);
const interactionTimeoutMs = Number(process.env.EXPLORATORY_CHECK_INTERACTION_TIMEOUT_MS ?? 30000);
const shouldPeekRealistic = process.argv.includes("--realistic") || process.env.EXPLORATORY_CHECK_REALISTIC === "true";
const shouldSmoke = process.argv.includes("--smoke") || process.env.EXPLORATORY_CHECK_SMOKE === "true";
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
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
  // この回帰チェックは日本語の操作ラベルを対象にする。
  locale: "ja-JP"
});
await page.addInitScript((storageKey) => {
  window.localStorage.setItem(storageKey, "1");
}, introSeenStorageKey);
page.setDefaultTimeout(interactionTimeoutMs);

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

const assertCompactPlanEditControls = async () => {
  if (await page.locator(".edit-toolbar-mode select").count() > 0) {
    throw new Error("legacy operation mode select should not be rendered");
  }
  await page.getByRole("button", { name: "間取り編集" }).waitFor({ state: "visible", timeout: interactionTimeoutMs });
  await activate(page.getByRole("button", { name: "間取り編集" }));
  await page.getByRole("button", { name: "壁を引く" }).waitFor({ state: "visible", timeout: interactionTimeoutMs });
  await activate(page.getByRole("button", { name: "間取り編集" }));
  await page.getByRole("button", { name: "壁を引く" }).waitFor({ state: "hidden", timeout: interactionTimeoutMs });
};

const assertTextVisible = async (textOrRegex, timeout = interactionTimeoutMs) => {
  await page.getByText(textOrRegex).first().waitFor({ state: "visible", timeout });
};

const activate = async (locator) => {
  await locator.dispatchEvent("click");
};

const setCheckbox = async (locator, checked) => {
  await locator.evaluate((input, nextChecked) => {
    input.checked = nextChecked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
};

const setInputValue = async (locator, value) => {
  await locator.evaluate((input, nextValue) => {
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
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
    // Worker / 3D renderer が常駐するため networkidle を待たず、後続の canvas 待機で起動完了を確認する。
    await page.goto(url, { waitUntil: "domcontentloaded" });
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

  await step("verify compact plan edit controls", async () => {
    await assertCompactPlanEditControls();
  });

  if (!shouldSmoke) {
    await step("switch floors", async () => {
      await activate(page.getByRole("button", { name: "2階" }));
      await assertTextVisible(/2階編集中/);
      await activate(page.getByRole("button", { name: "1階" }));
      await page.getByText(/2階編集中/).waitFor({ state: "hidden", timeout: interactionTimeoutMs });
    });

    await step("open add menu and start cancellable placement", async () => {
      await activate(page.getByRole("button", { name: "＋追加" }));
      await activate(page.getByRole("button", { name: /開口・構造/ }));
      await activate(page.getByRole("menuitem", { name: /吹き抜け/ }));
      await assertTextVisible(/クリックした位置に配置/);
      await page.keyboard.press("Escape");
      await assertTextVisible("クリックで選択・ドラッグで移動");
    });

    await step("pan 2d plan and toggle plan focus", async () => {
      const plan = page.locator(".plan-canvas");
      await dragLocator(plan, { x: 0.5, y: 0.5 }, { x: 0.58, y: 0.42 });
      await activate(page.getByRole("button", { name: "2Dを最大化" }));
      await activate(page.getByRole("button", { name: "通常表示に戻す" }).first());
    });

    await step("drag 3d viewport and toggle viewport focus", async () => {
      const viewport = page.locator(".scene-stage canvas").first();
      await dragLocator(viewport, { x: 0.5, y: 0.5 }, { x: 0.62, y: 0.45 });
      await activate(page.getByRole("button", { name: "3Dを最大化" }));
      await activate(page.getByRole("button", { name: "通常表示に戻す" }).first());
    });

    await step("open daylight controls", async () => {
      await activate(page.getByRole("button", { name: /日光/ }));
      await setCheckbox(page.getByLabel("日光を有効にする"), true);
      await setInputValue(page.locator(".daylight-popover input[type='range']"), "18");
      await activate(page.getByRole("button", { name: /日光/ }));
    });
  } else {
    console.log("smokeMode=skipping long interaction journey");
  }

  if (shouldPeekRealistic) {
    await step("peek realistic mode", async () => {
      const finishedLookButton = page.locator(".view-mode-toggle button").filter({ hasText: "仕上がり" });
      await activate(finishedLookButton);
      await page.locator('.view-mode-toggle button[aria-pressed="true"]').filter({ hasText: "仕上がり" }).waitFor();
      await page.waitForTimeout(1200);
      const editButton = page.locator(".view-mode-toggle button").filter({ hasText: "編集" });
      await activate(editButton);
      await page.locator('.view-mode-toggle button[aria-pressed="true"]').filter({ hasText: "編集" }).waitFor();
    });
  } else {
    await step("confirm realistic control exists", async () => {
      await page.locator(".view-mode-toggle button").filter({ hasText: "仕上がり" }).waitFor({ state: "visible" });
      console.log("realisticModeSkipped=set EXPLORATORY_CHECK_REALISTIC=true or pass --realistic to exercise live path tracing");
    });
  }

  await step("show and hide finished image controls", async () => {
    await activate(page.locator(".view-mode-toggle button").filter({ hasText: "仕上がり" }));
    const outputButton = page.getByRole("button", { name: "仕上がり画像を作る" });
    await outputButton.waitFor({ state: "visible", timeout: interactionTimeoutMs });
    await activate(outputButton);
    const output = page.locator(".output-popover");
    await output.waitFor({ state: "visible", timeout: interactionTimeoutMs });
    await output.locator("select").first().waitFor({ state: "visible", timeout: interactionTimeoutMs });
    await output.getByRole("button", { name: "画像を作る" }).waitFor({ state: "visible", timeout: interactionTimeoutMs });
    await activate(outputButton);
    await output.waitFor({ state: "hidden", timeout: interactionTimeoutMs });
    await activate(page.locator(".view-mode-toggle button").filter({ hasText: "編集" }));
    await outputButton.waitFor({ state: "hidden", timeout: interactionTimeoutMs });
  });

  await step("open help dialog", async () => {
    await activate(page.getByRole("button", { name: "使い方を見る" }));
    await assertTextVisible("自分の間取りで照明を試す");
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
