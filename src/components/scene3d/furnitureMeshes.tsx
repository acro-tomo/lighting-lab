import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { RenderDebugMode } from "../../rendering/pathTracer";
import { useProjectStore } from "../../store/projectStore";
import type { FurnitureItem, MaterialPreset, Project, Selection } from "../../types";
import { constrainFurniturePlacement } from "../../utils/furniturePlacement";
import { degToRad } from "../../utils/units";
import { useEditMode, usePathTraced, usePlacement } from "./contexts";
import { resizeBox3D, useFloorDrag, useHandleDrag } from "./dragHooks";
import { debugColorForRole } from "./materials";
import { eventObjectHasMarker, ignoreRaycast } from "./raycastUtils";

// 3Dの面ハンドル（球）1つ。平面ヒットで掴んだ点を resize に渡す。
const ResizeHandle3D = ({
  position,
  color,
  getPlane,
  onHit
}: {
  position: [number, number, number];
  color: string;
  getPlane: () => THREE.Plane;
  onHit: (point: THREE.Vector3) => void;
}) => {
  const drag = useHandleDrag(getPlane, onHit);
  return (
    <mesh
      position={position}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
    >
      <sphereGeometry args={[0.085, 16, 12]} />
      <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
    </mesh>
  );
};

// 選択中の家具に幅(±x)・奥行(±z)・高さ(+y)のリサイズハンドルを表示する（3Dでの大きさ変更）。
const FurnitureResizeHandles = ({ item }: { item: FurnitureItem }) => {
  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const camera = useThree((state) => state.camera);
  const apply = (axis: "x" | "z" | "y", sign: 1 | -1) => (hit: THREE.Vector3) => {
    const r = resizeBox3D(item.position, item.size, item.rotationYDeg, axis, sign, { x: hit.x, y: hit.y, z: hit.z });
    updateFurniture(item.id, { position: r.center, size: r.size });
  };
  // x/z は家具の中心高さの水平面、y はカメラ方向を向いた鉛直面でヒットを取る。
  const horizPlane = () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -item.position.y);
  const vertPlane = () => {
    const n = new THREE.Vector3(camera.position.x - item.position.x, 0, camera.position.z - item.position.z);
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    n.normalize();
    return new THREE.Plane(n, -n.dot(new THREE.Vector3(item.position.x, item.position.y, item.position.z)));
  };
  const hx = item.size.x / 2;
  const hy = item.size.y / 2;
  const hz = item.size.z / 2;
  return (
    <>
      <ResizeHandle3D position={[hx, 0, 0]} color="#ff5d8f" getPlane={horizPlane} onHit={apply("x", 1)} />
      <ResizeHandle3D position={[-hx, 0, 0]} color="#ff5d8f" getPlane={horizPlane} onHit={apply("x", -1)} />
      <ResizeHandle3D position={[0, 0, hz]} color="#5dd0ff" getPlane={horizPlane} onHit={apply("z", 1)} />
      <ResizeHandle3D position={[0, 0, -hz]} color="#5dd0ff" getPlane={horizPlane} onHit={apply("z", -1)} />
      <ResizeHandle3D position={[0, hy, 0]} color="#ffd95d" getPlane={vertPlane} onHit={apply("y", 1)} />
    </>
  );
};

export const FurnitureMesh = ({
  project,
  item,
  materialMap,
  selected,
  onSelect,
  debugMode
}: {
  project: Project;
  item: FurnitureItem;
  materialMap: Map<string, MaterialPreset>;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const material = materialMap.get(item.materialId);
  const color = item.color ?? material?.baseColor ?? "#777";
  const roughness = item.roughness ?? material?.roughness ?? 0.75;
  const metalness = item.metalness ?? material?.metalness ?? 0;
  const pathTraced = usePathTraced();
  const editMode = useEditMode();
  const placement = usePlacement();
  const updateFurniture = useProjectStore((state) => state.updateFurniture);
  const deleteSelection = useProjectStore((state) => state.deleteSelection);
  const floorLevelM = useProjectStore((state) => state.project.room.floorLevelM ?? 0);
  // 選択済みオブジェクトの再クリックで選択解除するトグル判定用。実際にドラッグが
  // 発生した場合（=移動操作）は解除しない、クリックのみ(移動なし)の時だけ解除する。
  const wasSelectedRef = useRef(false);
  const movedRef = useRef(false);
  const drag = useFloorDrag(
    { x: item.position.x, z: item.position.z },
    // 家具は floorLevelM 群に乗るのでドラッグ平面も同量持ち上げる（floorLevelM=0で従来同一）。
    floorLevelM + item.position.y,
    (x, z) => {
      movedRef.current = true;
      const next = constrainFurniturePlacement(project, item, { ...item.position, x, z });
      updateFurniture(item.id, { position: next.position, rotationYDeg: next.rotationYDeg });
    }
  );

  return (
    <group
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[0, degToRad(item.rotationYDeg), 0]}
      // 外壁越しに奥のこのオブジェクトを選べるよう、選択可能マーカーを付与。
      userData={{ selectable: true }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        const hitFurnitureBody = eventObjectHasMarker(event, "furnitureBody");
        // 配置中は家具の上に重ねて置けるよう、床キャッチャーへ素通りさせる。
        if (placement.pendingAdd) return;
        // 手前の家具をクリックしたら確定（背後の壁へ選択が伝播するのを止める）。
        event.stopPropagation();
        if (editMode === "delete") {
          deleteSelection({ kind: "furniture", id: item.id });
          return;
        }
        wasSelectedRef.current = selected;
        movedRef.current = false;
        if (!selected) onSelect({ kind: "furniture", id: item.id });
        if (editMode === "select" && selected && hitFurnitureBody) drag.onPointerDown(event);
      }}
      onPointerMove={editMode === "select" ? drag.onPointerMove : undefined}
      onPointerUp={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerUp(event);
              // 移動を伴わないクリックで、既に選択中の家具を再選択しようとした場合のみ解除する。
              if (wasSelectedRef.current && !movedRef.current) onSelect(null);
              wasSelectedRef.current = false;
            }
          : undefined
      }
      onPointerCancel={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerCancel(event);
              wasSelectedRef.current = false;
            }
          : undefined
      }
    >
      <group userData={{ furnitureBody: true }}>
        <FurniturePrimitive
          item={item}
          color={debugColorForRole("furniture", debugMode, color)}
          roughness={roughness}
          metalness={debugMode === "beauty" ? metalness : 0}
        />
      </group>
      {selected && !pathTraced && (
        <>
          <mesh raycast={ignoreRaycast}>
            <boxGeometry args={[item.size.x + 0.08, item.size.y + 0.08, item.size.z + 0.08]} />
            <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.9} />
          </mesh>
          <FurnitureResizeHandles item={item} />
        </>
      )}
    </group>
  );
};

const FurniturePrimitive = ({
  item,
  color,
  roughness,
  metalness
}: {
  item: FurnitureItem;
  color: string;
  roughness: number;
  metalness: number;
}) => {
  if (item.type === "roundTable") {
    return (
      <>
        <mesh castShadow receiveShadow position={[0, item.size.y / 2, 0]}>
          <cylinderGeometry args={[item.size.x / 2, item.size.x / 2, 0.08, 72]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        <mesh castShadow position={[0, item.size.y / 4, 0]}>
          <cylinderGeometry args={[0.055, 0.085, item.size.y / 2, 32]} />
          <meshStandardMaterial color="#1d1c19" roughness={0.44} metalness={0.6} />
        </mesh>
      </>
    );
  }

  if (item.type === "chair") {
    return (
      <>
        <mesh castShadow receiveShadow position={[0, -0.08, 0]}>
          <boxGeometry args={[item.size.x, 0.1, item.size.z]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.26, -item.size.z / 2 + 0.06]}>
          <boxGeometry args={[item.size.x, 0.72, 0.09]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
      </>
    );
  }

  if (item.type === "sofa") {
    return (
      <>
        <mesh castShadow receiveShadow position={[0, -0.08, 0]}>
          <boxGeometry args={[item.size.x, 0.35, item.size.z]} />
          <meshStandardMaterial color={color} roughness={roughness} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.22, -item.size.z / 2 + 0.1]}>
          <boxGeometry args={[item.size.x, 0.72, 0.2]} />
          <meshStandardMaterial color={color} roughness={roughness} />
        </mesh>
        {[-0.62, 0, 0.62].map((x) => (
          <mesh key={x} castShadow receiveShadow position={[x, 0.14, 0.12]}>
            <boxGeometry args={[0.58, 0.18, 0.52]} />
            <meshStandardMaterial color="#817b70" roughness={0.96} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "kitchen") {
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[item.size.x, item.size.y, item.size.z]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        <mesh position={[0, item.size.y / 2 + 0.035, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.size.x + 0.08, 0.07, item.size.z + 0.08]} />
          <meshStandardMaterial color="#b8b4aa" roughness={0.38} />
        </mesh>
        {[-0.85, 0, 0.85].map((x) => (
          <mesh key={x} position={[x, 0.02, item.size.z / 2 + 0.012]}>
            <boxGeometry args={[0.62, 0.64, 0.018]} />
            <meshStandardMaterial color="#0c0c0b" roughness={0.78} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "tv") {
    return (
      <mesh castShadow receiveShadow>
        <boxGeometry args={[item.size.x, item.size.y, item.size.z]} />
        <meshStandardMaterial color="#030303" roughness={0.18} metalness={0.02} emissive="#050914" emissiveIntensity={0.22} />
      </mesh>
    );
  }

  if (item.type === "bed") {
    const { x: w, y: h, z: d } = item.size;
    return (
      <>
        {/* フレーム */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + h * 0.22, 0]}>
          <boxGeometry args={[w, h * 0.44, d]} />
          <meshStandardMaterial color="#6b5b45" roughness={0.7} />
        </mesh>
        {/* マットレス＋掛け布団 */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + h * 0.62, d * 0.04]}>
          <boxGeometry args={[w * 0.96, h * 0.36, d * 0.92]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        {/* 枕 */}
        <mesh castShadow position={[0, -h / 2 + h * 0.86, -d / 2 + d * 0.13]}>
          <boxGeometry args={[w * 0.82, h * 0.16, d * 0.16]} />
          <meshStandardMaterial color="#f0ece2" roughness={0.88} />
        </mesh>
        {/* ヘッドボード */}
        <mesh castShadow receiveShadow position={[0, 0, -d / 2 + 0.04]}>
          <boxGeometry args={[w, h, 0.08]} />
          <meshStandardMaterial color="#5c4d3a" roughness={0.72} />
        </mesh>
      </>
    );
  }

  if (item.type === "fridge") {
    const { x: w, y: h, z: d } = item.size;
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        {/* 上下ドアの分割溝（正面=+z） */}
        <mesh position={[0, h * 0.08, d / 2 + 0.002]}>
          <boxGeometry args={[w * 0.98, 0.014, 0.012]} />
          <meshStandardMaterial color="#9a9a9c" roughness={0.5} metalness={0.3} />
        </mesh>
        {/* 縦ハンドル2本 */}
        {[h * 0.3, -h * 0.16].map((y) => (
          <mesh key={y} position={[-w / 2 + 0.07, y, d / 2 + 0.022]}>
            <boxGeometry args={[0.03, h * 0.22, 0.03]} />
            <meshStandardMaterial color="#b8b8ba" roughness={0.3} metalness={0.55} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "shelf") {
    // 可動棚（オープンシェルフ）: 側板＋背板＋複数の棚板。奥行=z, 背面=-z を壁付け想定。
    const { x: w, y: h, z: d } = item.size;
    const bays = Math.max(2, Math.round(h / 0.4));
    return (
      <>
        {[-1, 1].map((side) => (
          <mesh key={side} castShadow receiveShadow position={[side * (w / 2 - 0.02), 0, 0]}>
            <boxGeometry args={[0.04, h, d]} />
            <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
          </mesh>
        ))}
        <mesh receiveShadow position={[0, 0, -d / 2 + 0.015]}>
          <boxGeometry args={[w, h, 0.03]} />
          <meshStandardMaterial color={color} roughness={roughness} />
        </mesh>
        {Array.from({ length: bays + 1 }).map((_, index) => (
          <mesh key={index} castShadow receiveShadow position={[0, -h / 2 + (h / bays) * index, 0]}>
            <boxGeometry args={[w - 0.04, 0.03, d - 0.02]} />
            <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "rug") {
    return (
      <mesh receiveShadow>
        <boxGeometry args={[item.size.x, item.size.y, item.size.z]} />
        <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
      </mesh>
    );
  }

  if (item.type === "stair") {
    // スケルトン階段（蹴込み板なし）: 段板＋両側ストリンガーのみで構成し、隙間から向こうが見える。
    const steps = Math.max(3, Math.min(24, Math.round(item.size.y / 0.18)));
    const tread = item.size.z / steps;
    const riser = item.size.y / steps;
    const stringerLength = Math.hypot(item.size.y, item.size.z);
    const stringerAngle = Math.atan2(item.size.z, item.size.y);
    return (
      <>
        {Array.from({ length: steps }).map((_, index) => (
          <mesh
            key={index}
            castShadow
            receiveShadow
            position={[0, (index + 1) * riser - 0.026, -item.size.z / 2 + index * tread + tread / 2]}
          >
            <boxGeometry args={[item.size.x, 0.052, tread * 0.82]} />
            <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            castShadow
            receiveShadow
            position={[side * (item.size.x / 2 - 0.04), item.size.y / 2, 0]}
            rotation={[stringerAngle, 0, 0]}
          >
            <boxGeometry args={[0.06, stringerLength, 0.16]} />
            <meshStandardMaterial color="#1c1c1a" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "washer") {
    // 洗濯機: 白い箱＋正面(+z)の丸い扉。
    const { x: w, y: h, z: d } = item.size;
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#f0f0ee" roughness={0.45} metalness={metalness} />
        </mesh>
        <mesh position={[0, -h * 0.05, d / 2 + 0.004]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[Math.min(w, h) * 0.32, Math.min(w, h) * 0.32, 0.02, 32]} />
          <meshStandardMaterial color="#2a2c30" roughness={0.3} metalness={0.4} />
        </mesh>
      </>
    );
  }

  if (item.type === "washstand") {
    // 洗面化粧台: カウンター＋下部キャビネット＋上部の鏡板。
    const { x: w, y: h, z: d } = item.size;
    const counterY = h * 0.45;
    return (
      <>
        {/* 下部キャビネット */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + counterY / 2, 0]}>
          <boxGeometry args={[w, counterY, d]} />
          <meshStandardMaterial color="#e9e7e1" roughness={0.5} metalness={metalness} />
        </mesh>
        {/* カウンター天板 */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + counterY + 0.02, 0]}>
          <boxGeometry args={[w + 0.03, 0.04, d + 0.03]} />
          <meshStandardMaterial color="#f4f3ef" roughness={0.3} metalness={metalness} />
        </mesh>
        {/* 鏡板（背面寄り上部） */}
        <mesh receiveShadow position={[0, h / 2 - h * 0.18, -d / 2 + 0.02]}>
          <boxGeometry args={[w * 0.86, h * 0.34, 0.02]} />
          <meshStandardMaterial color="#aab4bc" roughness={0.08} metalness={0.55} />
        </mesh>
      </>
    );
  }

  if (item.type === "toilet") {
    // 便器（ボウル）＋背面タンクの2段構成。
    const { x: w, y: h, z: d } = item.size;
    const bowlH = h * 0.55;
    const tankH = h * 0.45;
    return (
      <>
        {/* ボウル */}
        <mesh castShadow receiveShadow position={[0, -h / 2 + bowlH / 2, d * 0.12]}>
          <boxGeometry args={[w * 0.7, bowlH, d * 0.72]} />
          <meshStandardMaterial color="#f3f3f1" roughness={0.25} metalness={metalness} />
        </mesh>
        {/* 便座（上面） */}
        <mesh receiveShadow position={[0, -h / 2 + bowlH + 0.015, d * 0.12]}>
          <boxGeometry args={[w * 0.76, 0.04, d * 0.78]} />
          <meshStandardMaterial color="#fafafa" roughness={0.3} />
        </mesh>
        {/* 背面タンク */}
        <mesh castShadow receiveShadow position={[0, h / 2 - tankH / 2, -d / 2 + d * 0.16]}>
          <boxGeometry args={[w * 0.82, tankH, d * 0.3]} />
          <meshStandardMaterial color="#f3f3f1" roughness={0.25} metalness={metalness} />
        </mesh>
      </>
    );
  }

  if (item.type === "bathtub") {
    // 浴槽: 外箱＋内側を浅く窪ませた湯面。窪みは薄い縁を残した内箱で表現する。
    const { x: w, y: h, z: d } = item.size;
    const rim = Math.min(w, d) * 0.12;
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#eef0f0" roughness={0.3} metalness={metalness} />
        </mesh>
        {/* 内側の窪み（湯面を兼ねた青みがかった面） */}
        <mesh position={[0, h / 2 - 0.06, 0]}>
          <boxGeometry args={[w - rim * 2, 0.06, d - rim * 2]} />
          <meshStandardMaterial color="#cfe0e6" roughness={0.12} metalness={0.1} />
        </mesh>
      </>
    );
  }

  if (item.type === "desk") {
    // デスク: 天板＋4本脚。
    const { x: w, y: h, z: d } = item.size;
    const topT = 0.04;
    const legW = 0.05;
    const legY = -h / 2 + (h - topT) / 2;
    const legH = h - topT;
    const offX = w / 2 - legW / 2 - 0.02;
    const offZ = d / 2 - legW / 2 - 0.02;
    return (
      <>
        <mesh castShadow receiveShadow position={[0, h / 2 - topT / 2, 0]}>
          <boxGeometry args={[w, topT, d]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        {[
          [offX, offZ],
          [-offX, offZ],
          [offX, -offZ],
          [-offX, -offZ]
        ].map(([x, z], index) => (
          <mesh key={index} castShadow receiveShadow position={[x, legY, z]}>
            <boxGeometry args={[legW, legH, legW]} />
            <meshStandardMaterial color="#3a342b" roughness={0.6} metalness={metalness} />
          </mesh>
        ))}
      </>
    );
  }

  if (item.type === "shoeCabinet") {
    // 下駄箱: 縦長キャビネット＋扉の分割溝（正面=+z）。
    const { x: w, y: h, z: d } = item.size;
    return (
      <>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
        </mesh>
        {/* 扉の縦溝（左右2枚扉想定） */}
        <mesh position={[0, 0, d / 2 + 0.002]}>
          <boxGeometry args={[0.012, h * 0.96, 0.012]} />
          <meshStandardMaterial color="#9a9a96" roughness={0.5} />
        </mesh>
      </>
    );
  }

  return (
    <mesh castShadow={item.castsShadow} receiveShadow>
      <boxGeometry args={[item.size.x, item.size.y, item.size.z]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
};

export const DuctRail = () => (
  <mesh position={[-3.0, 2.37, -1.18]} castShadow>
    <boxGeometry args={[2.2, 0.035, 0.055]} />
    <meshStandardMaterial color="#10100f" roughness={0.45} metalness={0.8} />
  </mesh>
);
