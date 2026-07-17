# LDK Lighting Lab — Build Week demo script

Target duration: 2 minutes 30 seconds to 2 minutes 45 seconds.

## この動画で伝える核心

専門CADは高機能ですが、一般の住宅購入者が「ここに照明を置いたら、夜はどう見える？」を試すには、操作習得と3Dモデル作成の負担が大きすぎます。

LDK Lighting Lab は、自宅の間取りを短時間で再現し、照明の種類・位置・明るさ・色温度・配光を気軽に置いて試すためのWebアプリです。

審査員に最後に残す一文：**Professional CAD is built for specialists. LDK Lighting Lab lets anyone try a lighting idea in their own home.**

## 0:00–0:18 — Show the barrier this product removes

**Purpose:** Explain why another lighting tool is needed when professional CAD already exists.

**Show:** Begin with the sample home in 2D and 3D. Add the question “What if I put a light here?” on screen.

**Narration:**

> Lighting simulation tools already exist, but most are built for specialists. For a homeowner who simply wants to ask, “What if I put a pendant here?”, reaching the first visual answer can require CAD knowledge and hours of setup. LDK Lighting Lab removes that barrier.

## 0:18–0:45 — Recreate a home without building a full CAD model

**Purpose:** Prove that users can reach their own room quickly.

**Show:**

1. Open the floor-plan import action.
2. Show PNG, JPG, and PDF support.
3. Show scale calibration from a known dimension.
4. Briefly show walls, windows, furniture, stairs, and a double-height void in the sample.

**Narration:**

> It runs in the browser without an account. I can start with this sample or import my own floor plan, set the scale from one known dimension, and trace the room. Walls, windows, furniture, stairs, and double-height spaces can be added with simple tools. I do not need a perfect building model—just enough of my home to judge lighting in context.

## 0:45–1:17 — Make experimentation the main event

**Purpose:** Show the core loop: think of a lighting idea, place it, see it, and change it immediately.

**Show:**

1. Open **+ Add** and choose a pendant or downlight.
2. Place it in 2D and move it once.
3. Change brightness and color temperature.
4. Change the fixture or beam distribution.
5. Turn the TV-back indirect light on and off.

**Narration:**

> Now I can experiment. I choose a fixture, place it, and move it directly in 2D. After selecting it, I can change brightness, color temperature, fixture type, beam distribution, and aiming. I can try downlights, a pendant, or indirect light without rebuilding the room. If an idea does not work, I change it immediately. This short loop—from an idea to a visible result—is the main product.

## 1:17–1:43 — Show why 3D and rendering help

**Purpose:** Connect the rendering technology to quick experimentation rather than presenting it as a technical showcase.

**Show:** Switch between the 2D plan and 3D Edit view. Then enable Realistic mode and hold long enough to show progressive convergence.

**Narration:**

> The 2D view keeps placement understandable, while the fast 3D Edit view gives immediate feedback. On supported hardware, Realistic mode progressively path traces the same scene, revealing both direct and indirect light. If path tracing is unavailable or slow, the full placement and editing workflow still works in the fast raster view.

## 1:43–1:58 — Keep the result useful outside the app

**Purpose:** Show that a quick experiment can be saved and discussed.

**Show:** Open Export / Render, render one result, export a PNG, then show project save.

**Narration:**

> When I find an idea worth keeping, I can render and export a watermarked PNG. The project autosaves locally in the browser and can also be saved as JSON, so I can return to the experiment or share the image for discussion.

## 1:58–2:12 — Show accessibility on phone and in English

**Purpose:** Demonstrate that this is intended for ordinary users, not only desktop CAD operators.

**Show:** Switch JA to EN, then show the phone layout with the 2D/3D tabs and settings sheet.

**Narration:**

> The interface switches between Japanese and English. On a phone, the plan and 3D view stay central, while editing actions and settings remain available from compact controls.

## 2:12–2:32 — Explain the Codex and GPT-5.6 contribution

**Purpose:** Address the Build Week implementation criterion after the product value is already clear.

**Show:** Briefly show the development record or README, then return to the app.

**Narration:**

> For this Build Week release, I used Codex with GPT-5.6 as the main development partner. It inspected the existing React and Three.js architecture, hardened feedback and deployment, implemented the bilingual interface, validated desktop and mobile flows, and prepared the public documentation without replacing the existing editor and renderer.

## 2:32–2:45 — Close on the product difference

**Purpose:** State exactly where the product sits beside professional tools.

**Show:** End on the live 2D and 3D views with the selected light visible in both.

**Narration:**

> LDK Lighting Lab does not replace certified lighting calculations. Professional CAD is built for specialists. This app lets anyone recreate their home and try a lighting idea before committing to it.

## Recording checklist

- Make “easy to start” and “easy to try again” visible; do not turn the video into a rendering showcase.
- Reach the first lighting edit within the first minute.
- Show at least one new fixture placement, not only changes to the prepared sample.
- Keep the same fixture visible in 2D and 3D so the connection is obvious.
- Do not claim physical accuracy or certified illuminance.
- Explain that path tracing is optional and hardware-dependent.
- Do not show GitHub tokens, Cloudflare secrets, private feedback issues, or personal floor plans.
- Keep the published video public, under three minutes, with English narration or accurate English subtitles.
