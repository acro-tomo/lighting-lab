import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { isWallLightAddKind } from "../../data/fixtureAddKinds";
import type { RenderDebugMode } from "../../rendering/pathTracer";
import { useProjectStore } from "../../store/projectStore";
import type {
  CeilingZone,
  FloorZone,
  MaterialPreset,
  Project,
  Selection,
  VoidArea,
  VoidSide
} from "../../types";
import { voidCeilingHeightAt } from "../../utils/ceiling";
import { visibleVoidSides, voidWallId } from "../../utils/fixtureMounting";
import { useEditMode, usePathTraced, usePlacement } from "./contexts";
import { debugColorForRole } from "./materials";
import { eventHitsDragHandle, eventHitsOtherWall } from "./raycastUtils";
import { computeFloorBounds, computeRoomPolygon } from "./roomGeometry";
import type { UpperVoidRegion } from "./upperVoid";
import { BaseBoards, VoidMarker, WallMesh, WindowMesh } from "./wallMeshes";

export const RoomShell = ({
  project,
  materialMap,
  floorTexture,
  floorMaterial,
  selection,
  onSelect,
  debugMode,
  upperVoid,
  canEditWalls
}: {
  project: Project;
  materialMap: Map<string, MaterialPreset>;
  floorTexture: THREE.Texture | null;
  floorMaterial: MaterialPreset;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
  // 2階の吹き抜け連続領域がある(=1階表示で2階を見せる)。void上蓋を出さず上方へ抜く。
  upperVoid: UpperVoidRegion | null;
  canEditWalls: boolean;
}) => {
  const ceilingMaterial = materialMap.get("cal-ceiling-white") ?? materialMap.get("wall-white") ?? project.materials[0];
  // 吹き抜けは下階天井を開口するだけだと黒背景に抜けて「穴」に見える。
  // 上階天井の高さまで側面と上蓋で囲い、二層分の吹き抜けとして閉じる。
  // 天井付け照明の設置高さ(ceilingMountHeightAt)と同じ式を使い、見た目と設置高さを揃える。
  const upperCeilingHeight = voidCeilingHeightAt(project, project.activeFloor ?? 1);
  const floorBounds = computeFloorBounds(project);
  const roomCenter = useMemo(
    () => new THREE.Vector3(floorBounds.centerX, 0, floorBounds.centerZ),
    [floorBounds.centerX, floorBounds.centerZ]
  );
  // 室内仕上げ床のレベル。土間(FloorZone)が地面(Y=0)より下に潜らないよう室内全体を持ち上げる。
  // 未設定(=0)なら translate ゼロで従来とピクセル等価。
  const floorLevelM = project.room.floorLevelM ?? 0;
  const showCeiling = project.showCeiling ?? true;

  return (
    <group position={[0, floorLevelM, 0]}>
      <Floor
        project={project}
        floorTexture={floorTexture}
        floorMaterial={floorMaterial}
        debugMode={debugMode}
      />
      {(project.floorZones ?? []).map((zone) => (
        <FloorZoneMesh
          key={zone.id}
          zone={zone}
          floorTexture={floorTexture}
          floorMaterial={floorMaterial}
          selected={selection?.kind === "floorZone" && selection.id === zone.id}
          onSelect={onSelect}
          debugMode={debugMode}
        />
      ))}
      {project.voids.map((voidArea) => (
        <VoidMarker
          key={voidArea.id}
          voidArea={voidArea}
          heightM={project.room.ceilingHeightM}
          selected={selection?.kind === "void" && selection.id === voidArea.id}
          onSelect={onSelect}
        />
      ))}
      {/* 天井ON/OFF: 非矩形間取りでバウンディングボックス天井が室外にかかる場合に手動で消せる。
          void の上蓋(VoidWell)は吹き抜けの黒抜け防止のため天井OFFでも残す。 */}
      {showCeiling && <Ceiling project={project} material={ceilingMaterial} debugMode={debugMode} />}
      {showCeiling &&
        (project.ceilingZones ?? []).map((zone) => (
          <CeilingZoneMesh
            key={zone.id}
            zone={zone}
            ceilingHeightM={project.room.ceilingHeightM}
            material={ceilingMaterial}
            selected={selection?.kind === "ceilingZone" && selection.id === zone.id}
            debugMode={debugMode}
          />
        ))}
      {project.voids.map((voidArea) => (
        <VoidWell
          key={`well-${voidArea.id}`}
          voidArea={voidArea}
          lowerY={project.room.ceilingHeightM}
          // 2階を見せるときは側面を2階床レベルまでに留め、上蓋は出さない（2階床/天井へ抜く）。
          upperY={upperVoid ? project.room.ceilingHeightM : upperCeilingHeight}
          showLid={!upperVoid}
          material={ceilingMaterial}
          debugMode={debugMode}
        />
      ))}
      {project.walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          walls={project.walls}
          windows={project.windows}
          material={materialMap.get(wall.materialId) ?? ceilingMaterial}
          roomCenter={roomCenter}
          floorBounds={floorBounds}
          selected={canEditWalls && selection?.kind === "wall" && selection.id === wall.id}
          onSelect={onSelect}
          debugMode={debugMode}
          canEditWalls={canEditWalls}
        />
      ))}
      {project.windows.map((windowItem) => {
        const kind = windowItem.hasGlass ? "window" : "opening";
        return (
          <WindowMesh
            key={windowItem.id}
            windowItem={windowItem}
            walls={project.walls}
            selected={selection?.kind === kind && selection.id === windowItem.id}
            onSelect={onSelect}
            debugMode={debugMode}
          />
        );
      })}
      <BaseBoards project={project} />
    </group>
  );
};

const Ceiling = ({ project, material, debugMode }: { project: Project; material: MaterialPreset; debugMode: RenderDebugMode }) => {
  // 部屋矩形を1枚の Shape にし、全 void を hole(THREE.Path) として抜く。
  // 任意個数の吹き抜けに対応でき、旧4分割方式の破綻も無い。
  // 床と同じく壁の囲いに合わせる。mesh を中心(centerX,centerZ)へ移動するので
  // Shape は中心原点・サイズ sizeX×sizeZ、void hole は mesh ローカルへオフセットする。
  const bounds = computeFloorBounds(project);
  const { centerX, centerZ, sizeX, sizeZ } = bounds;
  // L字など非矩形は室内ポリゴンで張る。取れなければ bbox 矩形にフォールバック。
  const polygon = useMemo(() => computeRoomPolygon(project), [project.walls]);
  const geometry = useMemo(() => {
    const halfW = sizeX / 2;
    const halfD = sizeZ / 2;
    // Shape は XY 平面で作る。ローカル(u,v) = (x, z) とし、後で回転して水平面に置く。
    // 頂点は mesh(centerX,centerZ) 中心のローカル座標へ変換する（void hole と同じ規約）。
    const shape = new THREE.Shape();
    if (polygon) {
      polygon.forEach((p, i) => {
        const lx = p.x - centerX;
        const lz = p.z - centerZ;
        if (i === 0) shape.moveTo(lx, lz);
        else shape.lineTo(lx, lz);
      });
      shape.closePath();
    } else {
      shape.moveTo(-halfW, -halfD);
      shape.lineTo(halfW, -halfD);
      shape.lineTo(halfW, halfD);
      shape.lineTo(-halfW, halfD);
      shape.closePath();
    }
    for (const voidArea of project.voids) {
      // void の center は絶対座標。mesh が centerX/centerZ にあるためローカルへ変換する。
      const minX = voidArea.center.x - centerX - voidArea.size.x / 2;
      const maxX = voidArea.center.x - centerX + voidArea.size.x / 2;
      const minZ = voidArea.center.z - centerZ - voidArea.size.z / 2;
      const maxZ = voidArea.center.z - centerZ + voidArea.size.z / 2;
      if (maxX - minX < 0.02 || maxZ - minZ < 0.02) continue;
      const hole = new THREE.Path();
      hole.moveTo(minX, minZ);
      hole.lineTo(maxX, minZ);
      hole.lineTo(maxX, maxZ);
      hole.lineTo(minX, maxZ);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geo = new THREE.ShapeGeometry(shape);
    // XY平面(法線+Z)生成。+90°回転で水平に倒すと法線は -Y（下向き）になり、
    // 室内（下）から見える＝旧単一void実装と同じ向き。
    geo.rotateX(Math.PI / 2);
    return geo;
  }, [centerX, centerZ, sizeX, sizeZ, project.voids, polygon]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh receiveShadow castShadow position={[centerX, project.room.ceilingHeightM, centerZ]} geometry={geometry}>
      <meshStandardMaterial
        color={debugColorForRole("ceiling", debugMode, material.baseColor)}
        roughness={material.roughness}
        metalness={material.metalness}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// 床。下げ床(floorZones)がある場合は天井と同じ Shape+holes 方式で各ピットを刳り抜く。
// floorZones が無ければ従来通り単純な planeGeometry のままにする。
const Floor = ({
  project,
  floorTexture,
  floorMaterial,
  debugMode
}: {
  project: Project;
  floorTexture: THREE.Texture | null;
  floorMaterial: MaterialPreset;
  debugMode: RenderDebugMode;
}) => {
  const bounds = computeFloorBounds(project);
  const { centerX, centerZ, sizeX, sizeZ } = bounds;
  const zones = project.floorZones ?? [];
  // 床も室内ポリゴンで張れば室外へはみ出さない。取れなければ bbox 矩形。
  const polygon = useMemo(() => computeRoomPolygon(project), [project.walls]);

  const geometry = useMemo(() => {
    // ポリゴンも下げ床ピットも無ければ従来通り planeGeometry を使う（null を返す）。
    if (zones.length === 0 && !polygon) return null;
    const halfW = sizeX / 2;
    const halfD = sizeZ / 2;
    const shape = new THREE.Shape();
    if (polygon) {
      polygon.forEach((p, i) => {
        const lx = p.x - centerX;
        const lz = p.z - centerZ;
        if (i === 0) shape.moveTo(lx, lz);
        else shape.lineTo(lx, lz);
      });
      shape.closePath();
    } else {
      shape.moveTo(-halfW, -halfD);
      shape.lineTo(halfW, -halfD);
      shape.lineTo(halfW, halfD);
      shape.lineTo(-halfW, halfD);
      shape.closePath();
    }
    for (const zone of zones) {
      // zone.center は絶対座標。mesh が centerX/centerZ にあるためローカルへ変換する。
      const minX = zone.center.x - centerX - zone.size.x / 2;
      const maxX = zone.center.x - centerX + zone.size.x / 2;
      const minZ = zone.center.z - centerZ - zone.size.z / 2;
      const maxZ = zone.center.z - centerZ + zone.size.z / 2;
      if (maxX - minX < 0.02 || maxZ - minZ < 0.02) continue;
      const hole = new THREE.Path();
      hole.moveTo(minX, minZ);
      hole.lineTo(maxX, minZ);
      hole.lineTo(maxX, maxZ);
      hole.lineTo(minX, maxZ);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geo = new THREE.ShapeGeometry(shape);
    // 床は上向き(+Y)。-90°回転で法線を +Y にする（planeGeometry の rotation-x=-π/2 と同じ向き）。
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [centerX, centerZ, sizeX, sizeZ, zones, polygon]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  const materialProps = {
    map: debugMode === "beauty" ? floorTexture ?? undefined : undefined,
    color: debugColorForRole("floor", debugMode, floorMaterial.baseColor),
    roughness: floorMaterial.roughness,
    metalness: floorMaterial.metalness
  };

  if (!geometry) {
    return (
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[centerX, 0, centerZ]}>
        <planeGeometry args={[sizeX, sizeZ]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
    );
  }

  return (
    <mesh receiveShadow position={[centerX, 0, centerZ]} geometry={geometry}>
      <meshStandardMaterial {...materialProps} />
    </mesh>
  );
};

// 下げ床(玄関土間など): 床に開けたピットへ Y=-dropM の床パネルを敷き、縁に蹴込みの側面を立てる。
const FloorZoneMesh = ({
  zone,
  floorTexture,
  floorMaterial,
  selected,
  onSelect,
  debugMode
}: {
  zone: FloorZone;
  floorTexture: THREE.Texture | null;
  floorMaterial: MaterialPreset;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const pathTraced = usePathTraced();
  const editMode = useEditMode();
  const deleteSelection = useProjectStore((store) => store.deleteSelection);
  const drop = Math.max(0.02, zone.dropM);
  const { center, size } = zone;
  const color = debugColorForRole("floor", debugMode, floorMaterial.baseColor);
  const sideColor = debugColorForRole("wall", debugMode, floorMaterial.baseColor);
  const wall = (
    <meshStandardMaterial color={sideColor} roughness={floorMaterial.roughness} metalness={0} side={THREE.DoubleSide} />
  );
  return (
    <group
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        if (editMode === "delete") {
          deleteSelection({ kind: "floorZone", id: zone.id });
          return;
        }
        // 選択中の下げ床を再クリックしたら選択解除（手軽に解除できるように）。
        onSelect(selected ? null : { kind: "floorZone", id: zone.id });
      }}
    >
      {/* 下げパネル（ピット底） */}
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[center.x, -drop, center.z]}>
        <planeGeometry args={[size.x, size.z]} />
        <meshStandardMaterial
          map={debugMode === "beauty" ? floorTexture ?? undefined : undefined}
          color={color}
          roughness={floorMaterial.roughness}
          metalness={floorMaterial.metalness}
        />
      </mesh>
      {/* 蹴込み（立ち上がり）: Y=0→-drop の側面4枚。黒抜け防止。 */}
      <mesh receiveShadow position={[center.x, -drop / 2, center.z - size.z / 2]}>
        <boxGeometry args={[size.x, drop, 0.02]} />
        {wall}
      </mesh>
      <mesh receiveShadow position={[center.x, -drop / 2, center.z + size.z / 2]}>
        <boxGeometry args={[size.x, drop, 0.02]} />
        {wall}
      </mesh>
      <mesh receiveShadow position={[center.x - size.x / 2, -drop / 2, center.z]}>
        <boxGeometry args={[0.02, drop, size.z]} />
        {wall}
      </mesh>
      <mesh receiveShadow position={[center.x + size.x / 2, -drop / 2, center.z]}>
        <boxGeometry args={[0.02, drop, size.z]} />
        {wall}
      </mesh>
      {selected && !pathTraced && (
        <mesh position={[center.x, -drop / 2, center.z]}>
          <boxGeometry args={[size.x + 0.04, drop + 0.04, size.z + 0.04]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
};

// 下げ天井: 天井から dropM 分だけ垂れ下がる軒（ソフィット）の箱として描く。
const CeilingZoneMesh = ({
  zone,
  ceilingHeightM,
  material,
  selected,
  debugMode
}: {
  zone: CeilingZone;
  ceilingHeightM: number;
  material: MaterialPreset;
  selected: boolean;
  debugMode: RenderDebugMode;
}) => {
  const pathTraced = usePathTraced();
  const drop = Math.max(0.02, zone.dropM);
  return (
    <group position={[zone.center.x, ceilingHeightM - drop / 2, zone.center.z]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[zone.size.x, drop, zone.size.z]} />
        <meshStandardMaterial
          color={debugColorForRole("ceiling", debugMode, material.baseColor)}
          roughness={material.roughness}
          metalness={material.metalness}
        />
      </mesh>
      {selected && !pathTraced && (
        <mesh>
          <boxGeometry args={[zone.size.x + 0.04, drop + 0.04, zone.size.z + 0.04]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
};

const voidOutsideFaceIndex = (side: VoidSide) => {
  switch (side) {
    case "north":
      return 5;
    case "south":
      return 4;
    case "west":
      return 1;
    case "east":
      return 0;
  }
};

const VoidWell = ({
  voidArea,
  lowerY,
  upperY,
  material,
  debugMode,
  showLid = true
}: {
  voidArea: VoidArea;
  lowerY: number;
  upperY: number;
  material: MaterialPreset;
  debugMode: RenderDebugMode;
  // 上蓋(天井蓋)を出すか。2階を見せるときは false にして上方へ抜く。
  showLid?: boolean;
}) => {
  const height = upperY - lowerY;
  if (height <= 0.02) return null;
  const midY = (lowerY + upperY) / 2;
  const { center, size } = voidArea;
  const placement = usePlacement();
  const color = debugColorForRole("ceiling", debugMode, material.baseColor);
  const sideConfigs = visibleVoidSides(voidArea).map((sideName) => ({
    sideName,
    position:
      sideName === "north"
        ? [center.x, midY, center.z - size.z / 2]
        : sideName === "south"
          ? [center.x, midY, center.z + size.z / 2]
          : sideName === "west"
            ? [center.x - size.x / 2, midY, center.z]
            : [center.x + size.x / 2, midY, center.z],
    args: sideName === "north" || sideName === "south" ? [size.x, height, 0.04] : [0.04, height, size.z],
    outsideFaceIndex: voidOutsideFaceIndex(sideName)
  })) as {
    sideName: VoidSide;
    position: [number, number, number];
    args: [number, number, number];
    outsideFaceIndex: number;
  }[];
  const resolveVoidHitPoint = (sideName: "north" | "south" | "west" | "east", event: ThreeEvent<PointerEvent>) => {
    const candidates = [event.point.clone()];
    if (event.object) candidates.push(event.object.localToWorld(event.point.clone()));
    const minX = center.x - size.x / 2;
    const maxX = center.x + size.x / 2;
    const minZ = center.z - size.z / 2;
    const maxZ = center.z + size.z / 2;
    const plane =
      sideName === "north"
        ? { axis: "z" as const, value: minZ }
        : sideName === "south"
          ? { axis: "z" as const, value: maxZ }
          : sideName === "west"
            ? { axis: "x" as const, value: minX }
            : { axis: "x" as const, value: maxX };
    const outside = (value: number, min: number, max: number) => Math.max(0, min - value, value - max);
    let best = candidates[0];
    let bestScore = Infinity;
    for (const point of candidates) {
      const sideScore = Math.abs(point[plane.axis] - plane.value);
      const rangeScore = plane.axis === "z" ? outside(point.x, minX, maxX) : outside(point.z, minZ, maxZ);
      const heightScore = outside(point.y, lowerY, upperY);
      const score = sideScore + rangeScore * 2 + heightScore;
      if (score < bestScore) {
        bestScore = score;
        best = point;
      }
    }
    return best;
  };
  const voidWallHit = (sideName: "north" | "south" | "west" | "east", point: THREE.Vector3) => {
    const alongX = sideName === "north" || sideName === "south";
    const ratio = alongX
      ? THREE.MathUtils.clamp((point.x - (center.x - size.x / 2)) / size.x, 0, 1)
      : THREE.MathUtils.clamp((point.z - (center.z - size.z / 2)) / size.z, 0, 1);
    const x = alongX
      ? center.x + (ratio - 0.5) * size.x
      : sideName === "west"
        ? center.x - size.x / 2
        : center.x + size.x / 2;
    const z = alongX
      ? sideName === "north"
        ? center.z - size.z / 2
        : center.z + size.z / 2
      : center.z + (ratio - 0.5) * size.z;
    return {
      wallId: voidWallId(voidArea.id, sideName),
      ratio,
      x,
      y: point.y,
      z,
      angle: alongX ? 0 : Math.PI / 2
    };
  };
  const voidWallHandlers = (sideName: "north" | "south" | "west" | "east") => ({
    onPointerMove: isWallLightAddKind(placement.pendingAdd)
      ? (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          placement.onWallHover?.(voidWallHit(sideName, resolveVoidHitPoint(sideName, event)));
        }
      : undefined,
    onPointerDown: isWallLightAddKind(placement.pendingAdd)
      ? (event: ThreeEvent<PointerEvent>) => {
          const hit = voidWallHit(sideName, resolveVoidHitPoint(sideName, event));
          // グリップや奥の別の壁/吹き抜け壁があれば、この面より優先して譲る。
          if (eventHitsDragHandle(event) || eventHitsOtherWall(event, hit.wallId)) return;
          event.stopPropagation();
          placement.onPlaceOnWall?.(hit.wallId, hit.ratio, hit.y);
        }
      : undefined
  });
  const outsideOpacity = debugMode === "beauty" ? 0.36 : 0.62;
  return (
    <group>
      {sideConfigs.map((config) => (
        <mesh
          key={config.sideName}
          position={config.position}
          receiveShadow
          castShadow
          userData={{ wallId: voidWallId(voidArea.id, config.sideName) }}
          {...voidWallHandlers(config.sideName)}
        >
          <boxGeometry args={config.args} />
          {Array.from({ length: 6 }, (_, index) => {
            const outside = index === config.outsideFaceIndex;
            return (
              <meshStandardMaterial
                key={index}
                attach={`material-${index}`}
                color={color}
                roughness={material.roughness}
                metalness={material.metalness}
                transparent={outside}
                opacity={outside ? outsideOpacity : 1}
                depthWrite={!outside}
              />
            );
          })}
        </mesh>
      ))}
      {showLid && (
        <mesh position={[center.x, upperY, center.z]} rotation-x={Math.PI / 2} receiveShadow castShadow>
          <planeGeometry args={[size.x, size.z]} />
          <meshStandardMaterial
            color={color}
            roughness={material.roughness}
            metalness={material.metalness}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};
