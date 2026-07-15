# photometric-sim — 測光ベース照明シミュレーター（Phase 1）

注文住宅の施主が入居前に照明計画（ダウンライト等の配置・品番選定）を検証するためのWebアプリ。
リポジトリ既存の「雰囲気比較」アプリとは**独立したサブプロジェクト**（要件が異なるため併存）。

差別化の核（アーキテクチャ不変条件）:

1. **照度（lx）は独立した測光計算で算出する。** レンダリング画像の明るさからの逆算はしない。露出・トーンマッピングを変えても lx 値は一切変化しない。
2. **器具の品番・配光データ（IES）に基づく。** IESが無い器具はビーム角近似とし、UIで「推定配光」と明示。現状の同梱プリセットは全て代表値サンプル（`dataSource: "representative"`）。

## 実行

```bash
cd photometric
npm install
npm run dev        # http://127.0.0.1:5174/（?backend=webgl2 でWebGL2強制）
npm test           # 測光ユニットテスト＋IESゴールデンテスト
npm run typecheck
npm run build
```

## 技術

- Three.js WebGPURenderer（WebGPU優先、WebGL2自動フォールバック）
- トーンマッピング: Khronos PBR Neutral／固定露出（EVオフセットのみ）／sRGB出力
- 測光コア（`src/photometry/`）はレンダラー非依存の純TypeScript
- IES LM-63 Type C パーサー（1°一様グリッド再サンプル、CPU/GPUで単一データソース）
- 単位: 長さ[m]、光束[lm]、光度[cd]、照度[lx]、色温度[K]。CCT→xy→XYZ→linear RGB 変換（輝度正規化でlm維持）

## 構成

| パス | 内容 |
|---|---|
| `src/core/` | ドメインモデル（部屋・家具・器具・材質）、幾何、色変換 |
| `src/photometry/` | 配光（lm→cd）、直接照度（lx）、照度グリッド、IESパーサー |
| `src/render/` | レンダラー抽象、シーン生成、光源、遮蔽レイキャスト、白飛び警告 |
| `src/app/` | プリセット読込、IESキャッシュ、ヒートマップ表示層 |
| `public/presets.json` | 器具プリセット（代表値サンプル） |
| `docs/DEVLOG.md` | ステップごとの実装・検証・設計判断の記録 |

## Phase 1 スコープ外（設計だけ確保済み）

- 間接光（`IndirectIlluminanceProvider` の差し込み口を確保、結果は direct/indirect/total 分離）
- Irradiance Probe（Phase 2）、停止時パストレーサー（Phase 3）
- 配光図PDF→推定IES生成
