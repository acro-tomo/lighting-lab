import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { RenderDebugMode } from "../../rendering/pathTracer";
import type { LightFixture } from "../../types";
import { bracketRoomwardOffset, colorTemperatureToHex, lumensToPhysicalPower } from "../../utils/lighting";
import { degToRad } from "../../utils/units";
import { usePathTraced } from "./contexts";
import { debugColorForRole } from "./materials";

// 首振り器具（ユニバーサル/壁付スポット）の本体を照射先に向ける。
const AimableSpotBody = ({
  fixture,
  color,
  active,
  bodyColor,
  debugMode
}: {
  fixture: LightFixture;
  color: THREE.Color;
  active: boolean;
  bodyColor: string;
  debugMode: RenderDebugMode;
}) => {
  const ref = useRef<THREE.Group>(null);
  const target = fixture.target;
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    const aim = target ?? { x: fixture.position.x, y: 0, z: fixture.position.z };
    const dir = new THREE.Vector3(
      aim.x - fixture.position.x,
      aim.y - fixture.position.y,
      aim.z - fixture.position.z
    );
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    // 本体の下向き(-Y)＝レンズ面を照射方向に合わせる。
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  }, [fixture.position.x, fixture.position.y, fixture.position.z, target?.x, target?.y, target?.z]);

  return (
    <group ref={ref}>
      {/* 取付プレート（壁付スポットの根元） */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 20]} />
        <meshStandardMaterial color={bodyColor} roughness={0.5} metalness={debugMode === "beauty" ? 0.6 : 0} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.07, 0.092, 0.2, 32]} />
        <meshStandardMaterial color={bodyColor} roughness={0.34} metalness={debugMode === "beauty" ? 0.78 : 0} />
      </mesh>
      <mesh position={[0, -0.11, 0]}>
        <sphereGeometry args={[0.05, 20, 12]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.85 : 0.16} />
      </mesh>
    </group>
  );
};

export const FixtureBody = ({
  fixture,
  color,
  active,
  debugMode
}: {
  fixture: LightFixture;
  color: THREE.Color;
  active: boolean;
  debugMode: RenderDebugMode;
}) => {
  const bodyColor = debugColorForRole("fixture", debugMode, "#10100f");
  if (fixture.type === "pendant") {
    return (
      <>
        <mesh position={[0, (fixture.cordLengthM ?? 0.8) / 2, 0]}>
          <cylinderGeometry args={[0.012, 0.012, fixture.cordLengthM ?? 0.8, 12]} />
          <meshStandardMaterial color="#111" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* 開口のシェード側面（内側も見えるよう両面）。 */}
        <mesh castShadow>
          <coneGeometry args={[0.24, 0.22, 48, 1, true]} />
          <meshStandardMaterial color={bodyColor} roughness={0.36} metalness={debugMode === "beauty" ? 0.7 : 0} side={THREE.DoubleSide} />
        </mesh>
        {/* シェード上面の不透明キャップ。上方への光漏れ(天井照り)を物理的に遮る。 */}
        <mesh position={[0, 0.11, 0]} castShadow>
          <cylinderGeometry args={[0.072, 0.072, 0.012, 32]} />
          <meshStandardMaterial color={bodyColor} roughness={0.4} metalness={debugMode === "beauty" ? 0.5 : 0} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.085, 24, 16]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.18} />
        </mesh>
      </>
    );
  }

  if (fixture.type === "spotlight") {
    return <AimableSpotBody fixture={fixture} color={color} active={active} bodyColor={bodyColor} debugMode={debugMode} />;
  }

  if (fixture.type === "bracket") {
    return (
      <group rotation={[0, degToRad(fixture.rotationDeg.y), 0]}>
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.09, 0.32, 0.08]} />
          <meshStandardMaterial color={bodyColor} roughness={0.36} metalness={debugMode === "beauty" ? 0.72 : 0} />
        </mesh>
        <mesh position={[-0.07, 0, 0]}>
          <sphereGeometry args={[0.08, 24, 16]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.72 : 0.14} />
        </mesh>
      </group>
    );
  }

  if (fixture.type === "tape") {
    return (
      <mesh>
        <boxGeometry args={[fixture.lengthM ?? 1.2, 0.035, 0.018]} />
        <meshStandardMaterial
          color={debugColorForRole("fixture", debugMode, "#fff2d4")}
          emissive={color}
          emissiveIntensity={debugMode === "beauty" ? (active ? 1.7 : 0.08) : 0}
          roughness={0.36}
        />
      </mesh>
    );
  }

  // 埋込ダウンライト: 天井に埋まる暗色トリム＋上方を塞ぐ不透明キャップ＋真下向きの発光アパーチャ。
  // キャップとトリムで上方への発光・漏れを物理的に遮り、天井面が照らないようにする（要望: 天井が明るくなるのを是正）。
  return (
    <>
      {/* 天井開口の暗色トリム（自発光しない） */}
      <mesh position={[0, 0.0, 0]}>
        <cylinderGeometry args={[0.105, 0.092, 0.05, 40, 1, true]} />
        <meshStandardMaterial
          color={debugColorForRole("fixture", debugMode, "#201e1a")}
          roughness={0.6}
          metalness={debugMode === "beauty" ? 0.1 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 上方への光漏れ・発光の天井照りを塞ぐ不透明キャップ */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.108, 0.108, 0.014, 24]} />
        <meshStandardMaterial color="#17150f" roughness={0.75} />
      </mesh>
      {/* 真下を向く発光アパーチャ。rotation[+π/2]で法線を -Y(真下)にし、室内（下）から
          見て器具が光って見えるようにする（要望: ダウンライト自体が光っていないのを是正）。 */}
      <mesh position={[0, -0.024, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.07, 32]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.92 : 0.16} side={THREE.FrontSide} />
      </mesh>
    </>
  );
};

export const PhysicalLight = ({
  fixture,
  castsRealtimeShadow,
  debugMode
}: {
  fixture: LightFixture;
  castsRealtimeShadow: boolean;
  debugMode: RenderDebugMode;
}) => {
  const scene = useThree((state) => state.scene);
  const pathTraced = usePathTraced();
  const target = useMemo(() => new THREE.Object3D(), []);
  const power = lumensToPhysicalPower(fixture);
  const color = colorTemperatureToHex(fixture.colorTemperatureK);
  const targetPosition = fixture.target ?? { x: fixture.position.x, y: 0.1, z: fixture.position.z };
  const castShadow = !pathTraced && castsRealtimeShadow;

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useFrame(() => {
    target.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
    target.updateMatrixWorld();
  });

  if (fixture.type === "tape") {
    return (
      <>
        <pointLight color={color} power={power * 0.5} distance={0} decay={2} position={[0, 0.08, 0.04]} />
        <pointLight color={color} power={power * 0.5} distance={0} decay={2} position={[0, -0.08, 0.04]} />
      </>
    );
  }

  if (fixture.type === "bracket") {
    // 光源を取付面（壁）から室内側へ離す。壁に密着した点光源は decay=2 の
    // 逆二乗で至近距離の壁を焼き白飛びさせる。target（照射方向＝室内向き）へ
    // 水平に ~0.16m 出して至近の壁の白飛びを防ぐ。
    const off = bracketRoomwardOffset(fixture, 0.16);
    return (
      <pointLight
        color={color}
        power={power}
        distance={0}
        decay={2}
        position={[off.x, 0, off.z]}
        castShadow={castShadow}
        shadow-mapSize={[512, 512]}
      />
    );
  }

  if (fixture.type === "pendant") {
    // ペンダントは下方配光。全方向 pointLight だと天井まで照ってしまうため、
    // 真下向きの広角スポット(≈140°)にしてテーブル面を主に照らす。
    // 上方への漏れはシェード上面(不透明)でも遮るが、配光自体も下向きに限定する。
    return (
      <spotLight
        color={color}
        power={power}
        angle={degToRad(70)}
        penumbra={0.5}
        distance={0}
        decay={2}
        position={[0, -0.08, 0]}
        target={target}
        castShadow={castShadow}
        shadow-mapSize={[1024, 1024]}
      />
    );
  }

  // 光源を器具本体より下に出す。本体内部に光源があると真下方向の光が
  // 器具自身に遮られ、床の光だまり中心が抜けてドーナツ状になるため。
  // 器具本体の厚みぶんだけ下げる（過剰に下げるとビーム形状が歪むので最小限）。
  const lightDrop = fixture.type === "spotlight" ? 0.2 : 0.05;
  return (
    <spotLight
      color={color}
      power={power}
      angle={degToRad(fixture.beamAngleDeg / 2)}
      penumbra={fixture.penumbra}
      distance={0}
      decay={2}
      position={[0, -lightDrop, 0]}
      target={target}
      castShadow={castShadow}
      shadow-mapSize={[1024, 1024]}
    />
  );
};
