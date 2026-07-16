# TODO / 次の候補

セッション横断の作業候補リスト。完了したら日付を付けて「完了」へ移す。
photometric サブプロジェクト固有の詳細な経緯は [photometric/docs/DEVLOG.md](../photometric/docs/DEVLOG.md) を参照。

## 優先候補（本体）

1. **実在器具データの投入**
   photometric のプリセットは全て「代表値サンプル」。メーカー公表の
   カタログ値・IESファイルを出所つきで取得し `dataSource:'catalog'` へ昇格。
   配布ライセンス確認が必要なため1件ずつ人手で検証（機械収集しない）。
   スキーマと IES LM-63 Type C パーサーは photometric に実装済み。

## 候補（本体・見た目）

2. **Reflection Probe / TV反射の実機チューニング**
   `EDIT_ENVIRONMENT_INTENSITY = 0.5`（reflectionProbe.tsx）と
   `TV_SCREEN_REFLECTOR`（furnitureMeshes.tsx）は SwiftShader 上の
   スクショでしか確認していない。実GPUで強度・ギラつきを調整する。

3. **テープライトの照射向きデータ対応**
   tape は非aimable だが、target が斜めのデータでは発光面がバー形状から
   回転してズレる（現行データでは未発生）。UI で向きを持たせるか制約を明示する。

## 候補（photometric サブプロジェクト）

4. **WebGPUバックエンドの実機確認** — 開発コンテナにGPUがなく未検証。
   Chrome/Edge 実機で `photometric/` を起動し HUD が「WebGPU」の状態で
   描画・ヒートマップ・パストレースを確認する。
5. **パストレースのデノイズ** — 現状は漸進収束のみ。保存時だけの
   簡易バイラテラル or OIDN(WASM) が候補。
6. **間接光計算の高速化** — Worker化＋three-mesh-bvh（three/webgpu ビルドとの
   プロトタイプ互換に注意。DEVLOG参照）。
7. **描画GIの光漏れ対策（DDGI式深度）** — GPU側トライリニアが可視性を
   見ないため間仕切りのある間取りで光漏れ。lx計算側は可視性つきで正確。
8. **間取り作図/インポートUI・プロジェクト保存/読込・露出ロック付き比較ビュー**
    — 本体との統合方針が決まったため、優先度は本体側の対応（1）次第で見直す。

## 完了（直近）

- 2026-07: PBR Neutral 向けに露出を再校正。校正室 `1.30`、デモ `1.72`、
  新規既定 `1.70`、取込時の自動フィット上限 `0.88` を採用し、
  校正室の日光を無効化。未使用の `lumensToThreeIntensity` を削除。
- 2026-07: `?lux=1` 隠し照度ヒートマップに Irradiance Probe の間接照度を接続。
  直接・間接・合計の内訳、時分割更新、光源だけを変えたときの差分再計算に対応。
- 2026-07: 本体の編集ビュー改善 — ACES→PBR Neutral / Reflection Probe /
  TV平面反射 / テープRectAreaLight(LTC)化（コミット 1521be2〜75e4e57）
- 2026-07: `?lux=1` 隠し照度ヒートマップ（photometric測光コアを単一ソースで再利用、
  参考値免責つき、パストレ時自動非表示。コミット cf1bf3d）
- 2026-07: photometric Phase 1〜3（測光コア/IES/ヒートマップ/プローブGI/
  停止時パストレース。詳細は photometric/docs/DEVLOG.md）
