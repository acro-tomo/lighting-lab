import { LEGACY_EXPOSURE_MIGRATION_FACTOR } from "./exposure";

// 日光と器具の明るさの比を正すための倍率。器具は light.power = lm（three.js の物理単位）で
// 入るのに対し、日光だけ旧来の見た目合わせの値のままで、正午でも太陽が約12lx（実際は数万lx）
// しかなく器具に負けていた。倍率ぶんは DAYTIME_EXPOSURE_SCALE が露出側で打ち消すため、
// 見た目を決めるのは倍率そのものではなく「倍率と露出の比」であり、比を保つ限り倍率は
// 自由に選べる（実測光そのままの数万lx級にはしていない）。
//
// 上限がある: reflectionProbe.tsx がシーンをHalfFloat(最大65504)のキューブに焼くため、
// 面の輝度がそれを超えると Inf → PMREM で NaN が全面に広がり画面が真っ黒になる。
// 数万lx級だと白い壁が桁あふれして実際に黒画面になったので、見た目を保ったまま上限に
// 約40倍の余裕が残る値にしてある。上げるときは必ず exploratory-check
// （プローブ再ベイクを挟む操作のあと画面が黒くないかを見る）を通すこと。
const DAYLIGHT_PHYSICAL_BOOST = 100;

// v2で下げたカメラ露出に合わせ、日光強度を逆比例で補正して従来のプリトーンマップ寄与を保つ。
export const DAYLIGHT_INTENSITY_SCALE =
  (1 / LEGACY_EXPOSURE_MIGRATION_FACTOR) * DAYLIGHT_PHYSICAL_BOOST;

// 昼の露出。分子が大きいほど昼の室内が明るく写る（カメラ側の絞りであって日光の強さではない）。
// 太陽高度に連動させると朝夕も「適正露出」になって薄明が薄明に見えなくなるため、昼の間は
// 固定にし、時刻ごとの明暗は太陽高度が支配するシーン側に任せる。
export const DAYTIME_EXPOSURE_SCALE = 4 / DAYLIGHT_PHYSICAL_BOOST;
