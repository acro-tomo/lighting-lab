# LDK Lighting Lab — Build Week demo script

Target duration: 2 minutes 25 seconds to 2 minutes 45 seconds.

## この動画で伝える核心

住宅購入者は、平面図と器具表だけでは「夜にその部屋がどう感じられるか」を判断できません。LDK Lighting Lab は、同じ間取り・同じカメラで二つの照明案を比較し、施工前に家族や設計者と方針を決めるためのアプリです。

審査員に最後に残す一文：**Professional CAD does the engineering. LDK Lighting Lab helps the homeowner make the decision.**

## What this demo must communicate

**Audience:** A homeowner planning lighting before wiring and construction are fixed.

**Problem:** A floor plan and fixture schedule show positions and specifications, but they do not show how the room will actually feel at night. Discovering a poor choice after construction is expensive.

**Product value:** LDK Lighting Lab lets the homeowner compare two lighting intentions in the same room: a bright, functional scene and a warm, relaxed evening scene.

**Judge takeaway:** This is not a replacement for professional lighting CAD or certified lux calculation. It is a visual decision and communication tool for the homeowner before changes become costly.

## 0:00–0:18 — Make the problem concrete

**Purpose:** Establish who has the problem, why current documents are insufficient, and why the decision matters.

**Show:** Open on the Demo LDK in 2D. Keep the floor plan and 3D preview visible together.

**Narration:**

> A lighting plan shows fixture symbols and specifications, but it cannot tell a homeowner whether the living room will feel calm, too dark, or harsh at night. Changing it after construction is expensive. LDK Lighting Lab turns that abstract plan into a visual choice.

## 0:18–0:33 — Put the decision in the homeowner's own room

**Purpose:** Show that this is not a fixed 3D showcase; it works with the user's floor plan.

**Show:** Briefly open the floor-plan import action, then return to the sample. Point to the aligned 2D room, furniture, and lights.

**Narration:**

> I can start with this sample or import my own floor plan. In 2D, the room, furniture, and lights stay together, tying every change to how the space will be used.

## 0:33–1:03 — Create two meaningful alternatives

**Purpose:** Demonstrate one real decision instead of listing controls.

**Show:**

1. Render and export a brighter, neutral scene as **Option A**.
2. Select the living-room downlights.
3. Lower their brightness and change them to 2700K.
4. Turn on the TV-back indirect tape light.
5. Keep the camera unchanged, then render and export the warmer result as **Option B**.

**Narration:**

> Here is the decision: a bright, functional living room, or a warm, relaxed evening scene? I export the brighter scene as Option A. Then I lower the downlights, set them to 2700K, turn on indirect light behind the TV, and export Option B from the same camera. These are two intentions for the same room, not settings changed only to make a prettier render.

## 1:03–1:30 — Explain why 3D and path tracing matter

**Purpose:** Connect the rendering technology to the homeowner's decision.

**Show:** Switch from Edit to Realistic mode. Use the same scene and camera. Let the path tracer accumulate briefly, then point out the wall, ceiling, table, and TV area.

**Narration:**

> Edit view stays responsive while I work. Realistic mode progressively path traces the same scene. Direct light shows what each fixture reaches; indirect light shows how the walls and ceiling shape the atmosphere. On less capable hardware, editing still works in the fast raster view.

## 1:30–1:50 — Turn the render into a decision

**Purpose:** Show the product outcome: comparison and communication, not rendering for its own sake.

**Show:** In the video edit, place the two exported PNGs side by side and label them Option A and Option B. Then return to the live app on Option B.

**Narration:**

> The two exported results make the discussion concrete. Because the room and camera are unchanged, my family or designer can focus on one question: which lighting scene fits our evening? The editable project stays local and can be backed up as JSON.

## 1:50–2:05 — Show that the workflow is accessible

**Purpose:** Demonstrate that the intended users can actually use it.

**Show:** Switch between English and Japanese, then show the phone layout with 2D, 3D, and the settings sheet.

**Narration:**

> The workflow is available in Japanese and English. On a phone, the plan and 3D view stay central, with editing actions and settings in compact controls.

## 2:05–2:27 — Explain the Codex and GPT-5.6 contribution

**Purpose:** Address the Build Week implementation criterion without interrupting the product story.

**Show:** Briefly show the development record or README, then return to the finished comparison.

**Narration:**

> For this Build Week release, I used Codex with GPT-5.6 as the main development partner. It inspected the React and Three.js architecture, found deployment and feedback risks, implemented the bilingual interface, validated desktop and mobile flows, and prepared the public documentation. The existing editor and renderer were preserved.

## 2:27–2:40 — State the product boundary and close

**Purpose:** Leave the judge with the exact category and value of the product.

**Show:** End on the edited side-by-side comparison, then cut back to the warm live 3D scene.

**Narration:**

> LDK Lighting Lab is not a certified lux calculator. Professional CAD does the engineering. LDK Lighting Lab helps the homeowner see, compare, and communicate the decision before construction makes change expensive.

## Recording checklist

- Follow one homeowner decision from Option A to Option B; do not turn the video into a feature inventory.
- Use the deployed application and the same scene and camera for the before-and-after comparison.
- Keep Option A and Option B visibly different in brightness, color temperature, and indirect light.
- The current app does not expose a saved-shot gallery. Build the side-by-side comparison from the two exported PNGs in the video edit, and do not claim that an in-app gallery exists.
- Do not claim physical accuracy or certified illuminance.
- If Realistic mode is slow, show Edit first and explain that path tracing is hardware-dependent.
- Do not show GitHub tokens, Cloudflare secrets, private feedback issues, or personal floor plans.
- Keep the published video public, under three minutes, with English narration or accurate English subtitles.
