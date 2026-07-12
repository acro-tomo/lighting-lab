import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SUN_INTENSITY_FACTOR } from "../../rendering/skyEnvironment";

// 太陽高度から空色を補間する。昼=明るい空青、日の出/日没=橙、夜=暗い紺。
// scene.background に色を入れると常駐パストレが GradientEquirect 環境光として拾う。
const NIGHT_SKY = new THREE.Color("#06070b");
const DUSK_SKY = new THREE.Color("#e8915a");
const DAY_SKY = new THREE.Color("#9ec6e8");
export const skyColorForAltitude = (altitudeDeg: number): THREE.Color => {
  if (altitudeDeg <= 0) return NIGHT_SKY.clone();
  if (altitudeDeg < 8) {
    // 地平線付近は橙→紺をブレンド（薄明）。
    const t = altitudeDeg / 8;
    return NIGHT_SKY.clone().lerp(DUSK_SKY, t);
  }
  // 高度が上がるにつれ橙→空青。
  const t = Math.min(1, (altitudeDeg - 8) / 24);
  return DUSK_SKY.clone().lerp(DAY_SKY, t);
};

// 太陽光の色。低高度=暖色、高高度=ほぼ白。
const SUN_WARM = new THREE.Color("#ffd9a8");
const SUN_WHITE = new THREE.Color("#fff4e6");
const sunColorForAltitude = (altitudeDeg: number): THREE.Color => {
  const t = Math.min(1, Math.max(0, altitudeDeg / 35));
  return SUN_WARM.clone().lerp(SUN_WHITE, t);
};

// 窓から差し込む物理的な日光。常駐パストレ(リアル)でも有効にする本物の光なので、
// 非物理の補助光（hemisphere/directional）とは別物として扱う。
// 壁は不透明ジオメトリなので、窓開口/ガラスを通った光だけが室内に届く。
export const SunLight = ({
  dir,
  altitudeDeg,
  roomSpan
}: {
  dir: THREE.Vector3;
  altitudeDeg: number;
  roomSpan: number;
}) => {
  const ref = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  // Sky 環境が間接光を担うので、太陽は鋭い影・方向感だけ担当する控えめな直射に較正。
  // dir.y = sin(高度) なので高度が高いほど明るい。
  const intensity = Math.max(0, dir.y) * SUN_INTENSITY_FACTOR;
  const color = useMemo(() => sunColorForAltitude(altitudeDeg), [altitudeDeg]);
  const position = useMemo(() => dir.clone().multiplyScalar(30), [dir]);
  const half = Math.max(4, roomSpan);

  useEffect(() => {
    if (ref.current && targetRef.current) {
      ref.current.target = targetRef.current;
      ref.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <object3D ref={targetRef} position={[0, 0, 0]} />
      <directionalLight
        ref={ref}
        position={[position.x, position.y, position.z]}
        intensity={intensity}
        color={color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-bias={-0.0004}
      />
    </>
  );
};

// 窓の外に「外らしい景色」を作る: 広い地面 + 遠景の建物/木立シルエット。
// すべて実ジオメトリなのでパストレ(リアル)でも同じ見え方になる(WYSIWYG)。
// 空は scene.background(空色グラデ)が担うので、ここは地面と遠景のみ。
const FAR_SCENERY: { x: number; z: number; w: number; h: number; color: string }[] = [
  { x: -14, z: -20, w: 6, h: 5.5, color: "#3a4250" },
  { x: -7, z: -22, w: 4.5, h: 8, color: "#454f5e" },
  { x: 0, z: -24, w: 7, h: 6, color: "#333b48" },
  { x: 8, z: -21, w: 5, h: 9.5, color: "#404a59" },
  { x: 15, z: -19, w: 5.5, h: 4.5, color: "#3d4654" },
  { x: 19, z: 6, w: 5, h: 7, color: "#3a4250" },
  { x: 20, z: 14, w: 6, h: 5, color: "#454f5e" },
  { x: -19, z: 8, w: 5.5, h: 6.5, color: "#3a4250" },
  { x: -20, z: -4, w: 5, h: 8, color: "#404a59" }
];
const FAR_TREES: { x: number; z: number; h: number }[] = [
  { x: -11, z: -16, h: 3.2 },
  { x: 4, z: -17, h: 3.8 },
  { x: 12, z: -15, h: 2.8 },
  { x: 16, z: 2, h: 3.4 },
  { x: -16, z: 2, h: 3.0 }
];
export const Outdoors = () => (
  <group>
    {/* 床より下に広い地面平面（窓の外が黒く抜けないように）。 */}
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[120, 120]} />
      <meshStandardMaterial color="#6f7560" roughness={0.97} metalness={0} />
    </mesh>
    {/* 遠景の低い建物群（シルエット）。窓越しに街並みらしく見せる。 */}
    {FAR_SCENERY.map((b, index) => (
      <mesh key={`bld-${index}`} position={[b.x, b.h / 2, b.z]}>
        <boxGeometry args={[b.w, b.h, b.w * 0.8]} />
        <meshStandardMaterial color={b.color} roughness={0.9} metalness={0} />
      </mesh>
    ))}
    {/* 遠景の木立（円錐＋幹）。 */}
    {FAR_TREES.map((t, index) => (
      <group key={`tree-${index}`} position={[t.x, 0, t.z]}>
        <mesh position={[0, t.h * 0.62, 0]}>
          <coneGeometry args={[t.h * 0.34, t.h * 0.85, 8]} />
          <meshStandardMaterial color="#2f4232" roughness={0.95} metalness={0} />
        </mesh>
        <mesh position={[0, t.h * 0.18, 0]}>
          <cylinderGeometry args={[t.h * 0.05, t.h * 0.06, t.h * 0.36, 6]} />
          <meshStandardMaterial color="#3b2e22" roughness={0.95} metalness={0} />
        </mesh>
      </group>
    ))}
  </group>
);
