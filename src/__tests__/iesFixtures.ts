// テスト用の合成IES（LM-63 Type C）。実メーカーのファイルは同梱しない。
// 軸対称・θ=[0,30,60,90,180]、candela=[1000,800,200,0,0]。
// 半値(500cd)は 30°→60° の線形補間で 45°、つまり代表ビーム角(全角)は 90°。
export const AXIAL_DOWNLIGHT_IES = `IESNA:LM-63-2002
[TEST] Synthetic axially-symmetric downlight
[MANUFAC] TEST LAB
[LUMCAT] TEST-DL-IES
TILT=NONE
1 800 1 5 1 1 2 0.06 0.06 0
1.0 0 10.5
0 30 60 90 180
0
1000 800 200 0 0
`;

/** photometric type 3 (Type A) — Type C 以外なので拒否される。 */
export const TYPE_A_IES = AXIAL_DOWNLIGHT_IES.replace(
  "1 800 1 5 1 1 2 0.06 0.06 0",
  "1 800 1 5 1 3 2 0.06 0.06 0"
);

/** TILT=NONE 以外なので拒否される。 */
export const TILT_INCLUDE_IES = AXIAL_DOWNLIGHT_IES.replace("TILT=NONE", "TILT=INCLUDE");

/** candela 値が足りない破損ファイル。 */
export const TRUNCATED_IES = AXIAL_DOWNLIGHT_IES.replace("1000 800 200 0 0", "1000 800");

/** TILT 行そのものが無い破損ファイル。 */
export const NO_TILT_IES = AXIAL_DOWNLIGHT_IES.replace("TILT=NONE\n", "");

export const iesFile = (source: string, name = "test.ies"): File =>
  new File([source], name, { type: "text/plain" });
