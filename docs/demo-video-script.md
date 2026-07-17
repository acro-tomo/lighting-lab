# LDK Lighting Lab — 3-minute demo video script

Target duration: 2 minutes 30 seconds to 2 minutes 50 seconds. Record in English, or record in Japanese with accurate English subtitles.

## 0:00–0:15 — Problem and product

**Show:** The Demo LDK project in 2D.

**Narration:**

> Lighting decisions are often made before a home is built, when a floor plan and fixture schedule cannot show what the room will feel like at night. LDK Lighting Lab lets homeowners compare lighting layouts directly in their own floor plan.

## 0:15–0:35 — Start from a usable sample

**Show:** The sample plan, then briefly open the import menu.

**Narration:**

> You can start immediately with this LDK sample, or import a PNG, JPG, or PDF floor plan. The 2D editor is where you place walls, windows, furniture, lights, stairs, and double-height zones.

## 0:35–1:05 — Make a lighting decision

**Show:** Select a living-room downlight. Adjust brightness, color temperature, then choose a different fixture preset or add a pendant.

**Narration:**

> I can select a fixture and change its brightness, color temperature, and beam distribution. I can also place another fixture and compare a warmer, lower-light evening scene with a brighter option. This is designed for visual decisions, not certified lux calculations.

## 1:05–1:35 — Compare in 3D

**Show:** Switch to 3D Edit, then Realistic mode. Move the camera slightly once the result appears.

**Narration:**

> The fast Edit view keeps the workflow responsive. On supported hardware, Realistic mode progressively path traces the same scene, so I can inspect direct light and indirect light without leaving the project.

## 1:35–1:55 — Save the result

**Show:** Open Export / Render, save a comparison shot, then export PNG.

**Narration:**

> When I have an option worth discussing, I save a comparison shot and export a watermarked PNG. Projects are autosaved locally in the browser and can also be exported as JSON.

## 1:55–2:20 — Bilingual and mobile access

**Show:** Switch JA to EN, resize or show a phone recording with the mobile settings sheet.

**Narration:**

> The same workflow is available in Japanese and English. On a phone, the canvas stays central, while editing actions and settings are available from compact controls.

## 2:20–2:45 — Codex and GPT-5.6 contribution

**Show:** Optional brief screen of the README or development record, then return to the app.

**Narration:**

> In the Build Week finalization, I used Codex with GPT-5.6 to inspect the existing rendering and data flow, harden the feedback setup, implement the bilingual interface, validate the app, and prepare the documentation. The existing editor and renderer were preserved instead of being replaced near the deadline.

## 2:45–2:55 — Close

**Show:** Final 3D view and exported image.

**Narration:**

> LDK Lighting Lab makes one early housing decision easier: see and compare the nighttime atmosphere before construction makes changes expensive.

## Recording checklist

- Use a real deployed build or the approved local build; do not show secrets or Cloudflare settings.
- Keep the cursor slow and intentional. Do not wait for full path-tracing convergence in the recording.
- If Realistic mode is slow on the recording machine, show Edit view first and state that Realistic mode is optional and hardware-dependent.
- Include spoken references to what was built, how Codex was used, and how GPT-5.6 supported decisions.
- Verify the final published video is public, under three minutes, and has English narration or English subtitles.
