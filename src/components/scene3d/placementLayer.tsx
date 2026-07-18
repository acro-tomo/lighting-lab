import type { ThreeEvent } from "@react-three/fiber";
import { useState } from "react";
import { isCeilingLightAddKind, isWallLightAddKind } from "../../data/fixtureAddKinds";
import { getFurniturePreset } from "../../data/furnitureCatalog";
import { windowPresetFromAddKind } from "../../data/windowCatalog";
import type { LightFixture, Project } from "../../types";
import { ceilingMountHeightAt } from "../../utils/ceiling";
import type { WallHover } from "./contexts";
import { nearestWallAt } from "./roomGeometry";

// 追加配置のゴーストプレビューとクリック設置。床全面を覆う不可視キャッチャーで
// カーソルのワールド座標を拾い、種別に応じて床ゴースト or 壁スナップゴーストを出す。
// 天井ライトを既存ライトのX/Z軸に整列スナップする。最寄りライトのx/zがしきい値内なら吸着し、
// どの軸を吸着したか（ガイド線描画用）も返す。
const LIGHT_SNAP_M = 0.15;
const snapToLightAxes = (
  x: number,
  z: number,
  lights: LightFixture[]
): { x: number; z: number; snapX: number | null; snapZ: number | null } => {
  let snapX: number | null = null;
  let snapZ: number | null = null;
  let bestX = LIGHT_SNAP_M;
  let bestZ = LIGHT_SNAP_M;
  for (const light of lights) {
    const dx = Math.abs(light.position.x - x);
    if (dx < bestX) {
      bestX = dx;
      snapX = light.position.x;
    }
    const dz = Math.abs(light.position.z - z);
    if (dz < bestZ) {
      bestZ = dz;
      snapZ = light.position.z;
    }
  }
  return { x: snapX ?? x, z: snapZ ?? z, snapX, snapZ };
};

export const PlacementLayer = ({
  pendingAdd,
  project,
  onPlaceObject,
  onPlaceOnWall,
  wallCursor
}: {
  pendingAdd: string;
  project: Project;
  onPlaceObject?: (at: { x: number; z: number }) => void;
  onPlaceOnWall?: (wallId: string, centerRatio: number, heightM?: number) => void;
  wallCursor: WallHover;
}) => {
  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
  // 窓・扉は床カーソルから最寄り壁へスナップ。壁ライト(wallspot)は壁メッシュのヒット(wallCursor)を使う。
  const isWindowOrDoor = pendingAdd === "door" || pendingAdd.startsWith("window");
  const isWallItem = isWindowOrDoor || isWallLightAddKind(pendingAdd);
  // 天井ライトは既存ライトのX/Z軸へ吸着し、整列ガイド線を出す。
  const isCeilingLight = isCeilingLightAddKind(pendingAdd);

  // ゴーストの寸法・形状を種別から決める。
  const ghostColor = "#7fe9ff";
  const ghostMaterial = (
    <meshBasicMaterial color={ghostColor} transparent opacity={0.45} depthWrite={false} />
  );

  // 天井ライトのスナップ結果（ガイド線描画とクリック設置で共有）。
  const ceilingSnap = cursor && isCeilingLight ? snapToLightAxes(cursor.x, cursor.z, project.lights) : null;

  // 床に置く物（家具・吹き抜け・下げ天井・階段）と天井ライトのゴースト。
  const floorGhost = (() => {
    if (!cursor || isWallItem) return null;
    if (pendingAdd.startsWith("furniture:")) {
      const preset = getFurniturePreset(pendingAdd.slice("furniture:".length));
      const s = preset?.size ?? { x: 0.6, y: 0.6, z: 0.6 };
      return (
        <mesh position={[cursor.x, s.y / 2, cursor.z]}>
          <boxGeometry args={[s.x, s.y, s.z]} />
          {ghostMaterial}
        </mesh>
      );
    }
    if (isCeilingLight && ceilingSnap) {
      // 天井ライトはスナップ後の(x,z)で天井面付近にマーカーを出す。
      const ceil = ceilingMountHeightAt(project, ceilingSnap);
      return (
        <group position={[ceilingSnap.x, 0, ceilingSnap.z]}>
          <mesh position={[0, ceil - 0.05, 0]}>
            <sphereGeometry args={[0.1, 16, 12]} />
            {ghostMaterial}
          </mesh>
          <mesh position={[0, ceil - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.18, 0.24, 24]} />
            {ghostMaterial}
          </mesh>
        </group>
      );
    }
    // void / ceilingZone / stair は床上の薄い箱で十分。
    return (
      <mesh position={[cursor.x, 0.05, cursor.z]}>
        <boxGeometry args={[1.2, 0.1, 1.2]} />
        {ghostMaterial}
      </mesh>
    );
  })();

  // 整列スナップが効いている軸に細いガイド線を出す（パストレ常駐時は PlacementLayer 自体が非表示）。
  const snapGuides = (() => {
    if (!isCeilingLight || !ceilingSnap) return null;
    const y = ceilingMountHeightAt(project, ceilingSnap) - 0.04;
    const span = Math.max(project.room.widthM, project.room.depthM) + 4;
    return (
      <>
        {ceilingSnap.snapX !== null && (
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([ceilingSnap.snapX, y, -span, ceilingSnap.snapX, y, span]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffd24a" transparent opacity={0.8} />
          </line>
        )}
        {ceilingSnap.snapZ !== null && (
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([-span, y, ceilingSnap.snapZ, span, y, ceilingSnap.snapZ]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffd24a" transparent opacity={0.8} />
          </line>
        )}
      </>
    );
  })();

  // 窓・扉のゴースト: 床カーソルから最寄り壁へスナップし壁面上に板を出す。
  const windowWall = isWindowOrDoor && cursor ? nearestWallAt(cursor.x, cursor.z, project.walls) : null;
  // 壁ライト(wallspot)のゴースト: 壁メッシュが拾ったヒット(wallCursor)へ壁面に吸い付けて出す。
  const wallGhost = (() => {
    if (isWallLightAddKind(pendingAdd)) {
      if (!wallCursor) return null;
      return (
        <group position={[wallCursor.x, wallCursor.y, wallCursor.z]} rotation={[0, wallCursor.angle, 0]}>
          <mesh>
            <boxGeometry args={[0.16, 0.16, 0.08]} />
            {ghostMaterial}
          </mesh>
        </group>
      );
    }
    if (!windowWall) return null;
    const { wall: seg } = windowWall;
    let ratio = windowWall.ratio;
    let w = 0.85;
    let h = 2.0;
    let sill = 0;
    if (pendingAdd.startsWith("window")) {
      const preset = windowPresetFromAddKind(pendingAdd);
      if (preset) {
        w = preset.widthM;
        h = preset.heightM;
        sill = preset.sillHeightM;
        const wallLengthM = Math.hypot(seg.end.x - seg.start.x, seg.end.z - seg.start.z);
        if (wallLengthM > 0 && preset.widthM <= wallLengthM) {
          const halfRatio = preset.widthM / wallLengthM / 2;
          ratio = Math.min(1 - halfRatio, Math.max(halfRatio, ratio));
        } else {
          ratio = 0.5;
        }
      }
    }
    const x = seg.start.x + (seg.end.x - seg.start.x) * ratio;
    const z = seg.start.z + (seg.end.z - seg.start.z) * ratio;
    const angle = Math.atan2(seg.end.z - seg.start.z, seg.end.x - seg.start.x);
    const y = sill + h / 2;
    return (
      <group position={[x, y, z]} rotation={[0, -angle, 0]}>
        <mesh>
          <boxGeometry args={[w, h, 0.06]} />
          {ghostMaterial}
        </mesh>
      </group>
    );
  })();

  const place = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const x = event.point.x;
    const z = event.point.z;
    // 壁ライトは床カーソルでは確定しない（壁/吹き抜け側面のヒット＋高さで設置）。
    if (isWallLightAddKind(pendingAdd)) return;
    if (isWindowOrDoor) {
      const hit = nearestWallAt(x, z, project.walls);
      if (hit) onPlaceOnWall?.(hit.wall.id, hit.ratio);
    } else if (isCeilingLight) {
      const snap = snapToLightAxes(x, z, project.lights);
      onPlaceObject?.({ x: snap.x, z: snap.z });
    } else {
      onPlaceObject?.({ x, z });
    }
  };

  return (
    <group>
      {/* 部屋外でもカーソルを拾えるよう広い不可視キャッチャー。床 y=0 のわずか上。 */}
      <mesh
        position={[0, 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setCursor({ x: event.point.x, z: event.point.z });
        }}
        onClick={place}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial visible={false} transparent opacity={0} depthWrite={false} />
      </mesh>
      {floorGhost}
      {snapGuides}
      {wallGhost}
    </group>
  );
};
