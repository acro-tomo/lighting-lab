# LDK Lighting Lab — final Build Week demo script

## English — final

### 0:00–0:20 — Problem

When you build or renovate a home, lighting is decided from drawings and catalogs. But it's hard for a homeowner to imagine how it will actually look: how bright the room will feel, how walls and furniture will be lit, how the mood changes between warm and neutral white. And if something feels wrong after construction, moving a fixture costs real money.

### 0:20–0:35 — Solution

Lighting Lab lets homeowners try different lighting plans in their own floor plan and check the room's atmosphere before construction—no CAD skills needed. It runs in the browser. You can import your own floor plan, or start from a prepared home, like this one.

### 0:35–2:05 — Dining story

In this house, we're still deciding the dining lighting. I select the pendant over the table.

First, color temperature: from a warm 2700K up to 3500K. The mood of the dining area changes immediately. Next, brightness—dimmer for a calmer table, brighter for family homework time. Then I simply drag the pendant to try a different position.

Switching to 3D, I can check how the table and its surroundings actually look. And when I want to judge the atmosphere of the whole room, Realistic mode renders the same scene with indirect light included—the way the room would feel at night.

Not convinced? I just keep trying: another position, a different spread of light, one more color temperature. Lighting Lab doesn't hand you a "correct" answer. It lets you explore until the lighting fits the way you live.

### 2:05–2:50 — Technology and Codex

Under the hood, 2D editing and the 3D view stay in sync, each fixture exposes brightness, color temperature, and beam angle, and projects save and reload right in the browser—on PC, and on a phone.

Codex with GPT-5.6 has been part of this project from the very beginning. During this Build Week, its most important role was as a critical reviewer: every design decision on the two hardest questions—does the light behave the way it would in a real room, and can it stay fast enough for a phone—was challenged and refined through Codex before it shipped. The result is what you've been watching: a fast renderer while you edit, and physically convincing path tracing when you judge the atmosphere. On top of that, this session delivered the mobile improvements, English support, automated tests, and the public release.

### 2:50–3:00 — Closing

Lighting Lab lets homeowners quickly try different lighting layouts, brightness levels, and color temperatures in their own floor plan—before construction.

## 日本語訳 — 確定稿

### 問題

新築やリフォームでは、照明は図面とカタログから決めます。しかし施主には、実際の見え方を想像するのが難しい。部屋がどれくらい明るく感じられるか、壁や家具がどう照らされるか、電球色と温白色で雰囲気がどう変わるか。そして施工後に違和感に気付いても、器具を動かすには本当にお金がかかります。

### 解決策

Lighting Labは、施主が自分の間取りでさまざまな照明計画を試し、施工前に部屋の雰囲気を確認できるツールです。CADの知識は要りません。ブラウザで動きます。自分の間取りを取り込むことも、この住宅のように準備済みのものから始めることもできます。

### ダイニングのストーリー

この住宅では、ダイニングの照明をまだ検討中です。テーブルの上のペンダントを選択します。

まず色温度。温かみのある2700Kから3500Kへ。ダイニングの雰囲気がその場で変わります。次に明るさ。落ち着いた食卓なら暗めに、家族が宿題をするなら明るめに。そしてペンダントをドラッグして、別の位置も試してみます。

3Dに切り替えれば、テーブルとその周りが実際にどう見えるかを確認できます。部屋全体の雰囲気を判断したいときはRealisticモードへ。間接光まで含めて同じシーンを描画し、夜の部屋の感じ方が分かります。

納得できなければ、続けて試すだけです。別の位置、別の配光、もうひとつの色温度。Lighting Labは「正解」を教えるツールではありません。自分の暮らしに合う照明が見つかるまで、いろいろ試せるツールです。

### 技術とCodex

中身の話をすると、2D編集と3D表示は連動し、各器具は明るさ・色温度・ビーム角を変更でき、プロジェクトはブラウザ内でそのまま保存・読み込みできます。PCでも、スマートフォンでも。

CodexとGPT-5.6は、このプロジェクトの最初から関わってきました。今回のBuild Weekで最も重要だった役割は、批判的なレビュアーです。いちばん難しい2つの問い——光は現実の部屋と同じように振る舞うか、スマートフォンで快適に動く速度を保てるか——に関するすべての設計判断は、Codexの検証とブラッシュアップを経てから実装されています。その結果が、いままさに見ていただいたもの。編集中は高速なレンダラー、雰囲気を判断するときは物理的に説得力のあるパストレーシング、という構成です。加えて今回のセッションでは、モバイル改善、英語対応、自動テスト、公開準備も行いました。

### 結び

Lighting Labは、自分の間取りでさまざまな照明配置・明るさ・色温度を気軽に試し、施工前に確認できる住宅照明シミュレーターです。

## Recording checklist

- Keep the full video under three minutes, including pauses and transitions.
- Use the dining pendant as the single story from 2D selection through Realistic mode.
- Show the actual 2700K and 3500K controls, brightness adjustment, drag, beam-angle control, 3D view, and Realistic mode.
- Do not claim certified illuminance or guaranteed post-construction appearance.
- Do not show GitHub tokens, Cloudflare secrets, private feedback issues, or personal floor plans.
