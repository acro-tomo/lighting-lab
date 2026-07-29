import { LEGACY_EXPOSURE_MIGRATION_FACTOR } from "./exposure";

// 日光を器具と同じ実測光スケールに載せるための倍率。器具は light.power = lm（three.js の
// 物理単位）で入るのに対し、日光だけ旧来の見た目合わせの値のままで、正午でも太陽が約12lx
// （実際は数万lx）しかなく器具に負けていた。倍率ぶんは DAYTIME_EXPOSURE_SCALE が露出側で
// 打ち消すので、絶対値そのものではなく「器具と日光の比」を正すための係数。
const DAYLIGHT_PHYSICAL_BOOST = 7100;

// v2で下げたカメラ露出に合わせ、日光強度を逆比例で補正して従来のプリトーンマップ寄与を保つ。
export const DAYLIGHT_INTENSITY_SCALE =
  (1 / LEGACY_EXPOSURE_MIGRATION_FACTOR) * DAYLIGHT_PHYSICAL_BOOST;

// 昼の露出。分子が大きいほど昼の室内が明るく写る（カメラ側の絞りであって日光の強さではない）。
// 太陽高度に連動させると朝夕も「適正露出」になって薄明が薄明に見えなくなるため、昼の間は
// 固定にし、時刻ごとの明暗は太陽高度が支配するシーン側に任せる。
export const DAYTIME_EXPOSURE_SCALE = 4 / DAYLIGHT_PHYSICAL_BOOST;
