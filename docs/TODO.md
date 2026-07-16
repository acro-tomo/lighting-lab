# TODO / 次の候補

セッション横断の作業候補リスト。完了したら日付を付けて「完了」へ移す。
photometric サブプロジェクト固有の詳細な経緯は [photometric/docs/DEVLOG.md](../photometric/docs/DEVLOG.md) を参照。

## 優先候補（本体）

1. **隠し照度パネルへの間接光の追加**
   `?lux=1` の照度は現状直接照度のみ。photometric の Irradiance Probe
   （SH2次・可視性つき・差分再計算、`photometric/src/photometry/probes.ts`）を
   本体の遮蔽ジオメトリに接続し、直接＋間接の内訳表示にする。
   計算は時分割（photometric/src/app/indirect.ts の方式を流用）。

2. **露出キャリブレーションの再調整（Neutral化の追従）**
   トーンマッピングを ACES → PBR Neutral に変えたが露出は旧値（0.9、
   カメラプリセット側の値も含む）のまま。docs/lighting-calibration-report.md の
   手法（パストレとの比較）で再キャリブレーションし、
   `lumensToThreeIntensity`（utils/lighting.ts、デッドコード疑い）も整理する。

3. **実在器具データの投入**
   photometric のプリセットは全て「代表値サンプル」。メーカー公表の
   カタログ値・IESファイルを出所つきで取得し `dataSource:'catalog'` へ昇格。
   配布ライセンス確認が必要なため1件ずつ人手で検証（機械収集しない）。
   スキーマと IES LM-63 Type C パーサーは photometric に実装済み。

## 候補（本体・見た目）

4. **Reflection Probe / TV反射の実機チューニング**
   `EDIT_ENVIRONMENT_INTENSITY = 0.5`（reflectionProbe.tsx）と
   `TV_SCREEN_REFLECTOR`（furnitureMeshes.tsx）は SwiftShader 上の
   スクショでしか確認していない。実GPUで強度・ギラつきを調整する。

5. **テープライトの照射向きデータ対応**
   tape は非aimable だが、target が斜めのデータでは発光面がバー形状から
   回転してズレる（現行データでは未発生）。UI で向きを持たせるか制約を明示する。

## 候補（photometric サブプロジェクト）

6. **WebGPUバックエンドの実機確認** — 開発コンテナにGPUがなく未検証。
   Chrome/Edge 実機で `photometric/` を起動し HUD が「WebGPU」の状態で
   描画・ヒートマップ・パストレースを確認する。
7. **パストレースのデノイズ** — 現状は漸進収束のみ。保存時だけの
   簡易バイラテラル or OIDN(WASM) が候補。
8. **間接光計算の高速化** — Worker化＋three-mesh-bvh（three/webgpu ビルドとの
   プロトタイプ互換に注意。DEVLOG参照）。
9. **描画GIの光漏れ対策（DDGI式深度）** — GPU側トライリニアが可視性を
   見ないため間仕切りのある間取りで光漏れ。lx計算側は可視性つきで正確。
10. **間取り作図/インポートUI・プロジェクト保存/読込・露出ロック付き比較ビュー**
    — 本体との統合方針が決まったため、優先度は本体側の対応（1〜3）次第で見直す。

## 完了（直近）

- 2026-07: 本体の編集ビュー改善 — ACES→PBR Neutral / Reflection Probe /
  TV平面反射 / テープRectAreaLight(LTC)化（コミット 1521be2〜75e4e57）
- 2026-07: `?lux=1` 隠し照度ヒートマップ（photometric測光コアを単一ソースで再利用、
  参考値免責つき、パストレ時自動非表示。コミット cf1bf3d）
- 2026-07: photometric Phase 1〜3（測光コア/IES/ヒートマップ/プローブGI/
  停止時パストレース。詳細は photometric/docs/DEVLOG.md）
