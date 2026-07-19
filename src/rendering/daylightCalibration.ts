import { LEGACY_EXPOSURE_MIGRATION_FACTOR } from "./exposure";

// v2で下げたカメラ露出に合わせ、日光強度を逆比例で補正して従来のプリトーンマップ寄与を保つ。
export const DAYLIGHT_INTENSITY_SCALE = 1 / LEGACY_EXPOSURE_MIGRATION_FACTOR;
