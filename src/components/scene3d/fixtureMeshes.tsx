import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { isAimable } from "../../data/fixtureCatalog";
import type { RenderDebugMode } from "../../rendering/pathTracer";
import { useProjectStore } from "../../store/projectStore";
import type { LightFixture, Project, Selection } from "../../types";
import { ceilingMountHeightAt, voidCeilingHeightAt, voidTopHeightM } from "../../utils/ceiling";
import {
  isWallMountedFixture,
  nearestWallMountSurfaceAt,
  parseVoidWallId,
  wallMountedLightPlacementAt
} from "../../utils/fixtureMounting";
import { colorTemperatureToLinearColor } from "../../utils/lighting";
import { useEditMode, usePathTraced, usePlacement, useTouchDragGuard } from "./contexts";
import { DebugLine, LightDirectionLine } from "./debugHelpers";
import { useViewPlaneDrag } from "./dragHooks";
import { FixtureBody, PhysicalLight } from "./fixtureBody";
import { eventHitsDragHandle, eventObjectHasMarker, ignoreRaycast } from "./raycastUtils";

// ドラッグ移動中、他ライトのX/Z軸への吸着（パワポ風の整列スナップ）。自分自身は除外し、
// x/z 独立で最寄り候補に吸い付く。snapX/snapZ は効いている軸のガイド線座標（null=非吸着）。
const DRAG_SNAP_M = 0.12;
const snapDragToLightAxes = (
  x: number,
  z: number,
  lights: LightFixture[],
  selfId: string
): { x: number; z: number; snapX: number | null; snapZ: number | null } => {
  let snapX: number | null = null;
  let snapZ: number | null = null;
  let bestX = DRAG_SNAP_M;
  let bestZ = DRAG_SNAP_M;
  for (const light of lights) {
    if (light.id === selfId) continue;
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

type FixtureMoveMode = "horizontal" | "vertical";

export const FixtureMesh = ({
  fixture,
  emitsLight,
  castsRealtimeShadow,
  selected,
  onSelect,
  debugMode
}: {
  fixture: LightFixture;
  emitsLight: boolean;
  castsRealtimeShadow: boolean;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const lightColor = colorTemperatureToLinearColor(fixture.colorTemperatureK);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const pathTraced = usePathTraced();
  const editMode = useEditMode();
  const placement = usePlacement();
  const updateLight = useProjectStore((store) => store.updateLight);
  const beginHistoryGroup = useProjectStore((store) => store.beginHistoryGroup);
  const endHistoryGroup = useProjectStore((store) => store.endHistoryGroup);
  const deleteSelection = useProjectStore((store) => store.deleteSelection);
  const project = useProjectStore((store) => store.project);
  const floorLevelM = useProjectStore((store) => store.project.room.floorLevelM ?? 0);
  const lights = useProjectStore((store) => store.project.lights);
  const toggleLightSelection = useProjectStore((store) => store.toggleLightSelection);
  const multiSelected = useProjectStore((store) => store.selectedLightIds.includes(fixture.id));
  const wallMounted = isWallMountedFixture(fixture);
  const [moveMode, setMoveMode] = useState<FixtureMoveMode>("horizontal");
  // ドラッグ中に効いている整列軸のガイド位置（編集時のみ描画）。
  const [dragSnap, setDragSnap] = useState<{ snapX: number | null; snapZ: number | null } | null>(null);
  const wasSelectedRef = useRef(false);
  const movedRef = useRef(false);
  const heightDragging = useRef(false);
  const heightGrabY = useRef(0);
  const heightHit = useMemo(() => new THREE.Vector3(), []);
  const minMoveY = wallMounted ? 0.3 : 0.08;
  const maxMoveY = Math.max(
    minMoveY + 0.2,
    wallMounted
      ? wallMountHeightLimit(project, fixture) - 0.05
      : ceilingMountHeightAt(project, { x: fixture.position.x, z: fixture.position.z }) - 0.02
  );
  const drag = useViewPlaneDrag(
    { x: fixture.position.x, z: fixture.position.z },
    floorLevelM + fixture.position.y,
    (rawX, rawZ) => {
      if (wallMounted) {
        const placement = wallMountedLightPlacementAt(
          project,
          rawX,
          rawZ,
          fixture.position.y,
          fixture.floor ?? project.activeFloor ?? 1
        );
        if (!placement) return;
        movedRef.current = true;
        updateLight(fixture.id, {
          position: placement.position,
          mountHeightM: placement.position.y,
          rotationDeg: { ...fixture.rotationDeg, y: placement.rotationYDeg },
          target: placement.target
        });
        return;
      }
      // 生の(x,z)を他ライト軸へ吸着してから反映（掴み相対オフセットは useFloorDrag が保持済み）。
      const snap = snapDragToLightAxes(rawX, rawZ, lights, fixture.id);
      setDragSnap(snap.snapX !== null || snap.snapZ !== null ? { snapX: snap.snapX, snapZ: snap.snapZ } : null);
      movedRef.current = true;
      const x = snap.x;
      const z = snap.z;
      const dx = x - fixture.position.x;
      const dz = z - fixture.position.z;
      updateLight(fixture.id, {
        position: { ...fixture.position, x, z },
        target: fixture.target ? { ...fixture.target, x: fixture.target.x + dx, z: fixture.target.z + dz } : undefined
      });
    }
  );

  useEffect(() => {
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [controls]);

  const heightFromRay = (event: ThreeEvent<PointerEvent>) => {
    const start = new THREE.Vector3(fixture.position.x, floorLevelM + minMoveY, fixture.position.z);
    const end = new THREE.Vector3(fixture.position.x, floorLevelM + maxMoveY, fixture.position.z);
    event.ray.distanceSqToSegment(start, end, undefined, heightHit);
    return heightHit.y - floorLevelM;
  };

  const startHeightDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
    event.stopPropagation();
    beginHistoryGroup();
    heightDragging.current = true;
    heightGrabY.current = fixture.position.y - heightFromRay(event);
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
  };

  const stopHeightDrag = (event: ThreeEvent<PointerEvent>, releaseCapture = true) => {
    if (!heightDragging.current) return;
    heightDragging.current = false;
    endHistoryGroup();
    if (releaseCapture) (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  const handleHeightDragMove = (event: ThreeEvent<PointerEvent>) => {
    if (!heightDragging.current) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
      stopHeightDrag(event);
      return;
    }
    event.stopPropagation();
    const y = THREE.MathUtils.clamp(heightFromRay(event) + heightGrabY.current, minMoveY, maxMoveY);
    movedRef.current = true;
    updateLight(fixture.id, { position: { ...fixture.position, y }, mountHeightM: y });
  };

  const showOutline = (selected || multiSelected) && !pathTraced;
  const showAimEditor = selected && isAimable(fixture) && !pathTraced && editMode !== "delete";
  // ガイド線は非物理の編集補助なので常駐パストレ時は出さない（WYSIWYG不変条件）。
  const guideY = floorLevelM + fixture.position.y;
  const guideSpan = 40;

  return (
    <group
      position={[fixture.position.x, fixture.position.y, fixture.position.z]}
      // 外壁越しに奥のこの照明を選べるよう、選択可能マーカーを付与。
      userData={{ selectable: true }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        const canDragFixture = !eventHitsDragHandle(event);
        // 配置中は照明の上に重ねて置けるよう、床キャッチャーへ素通りさせる。
        if (placement.pendingAdd) return;
        // 手前の照明をクリックしたら確定（背後の壁へ選択が伝播するのを止める）。
        event.stopPropagation();
        if (editMode === "delete") {
          deleteSelection({ kind: "light", id: fixture.id });
          return;
        }
        // Shift+クリックは複数選択トグル。通常クリックは従来どおり単一選択。
        if (event.shiftKey) {
          toggleLightSelection(fixture.id);
          return;
        }
        wasSelectedRef.current = selected;
        movedRef.current = false;
        if (!selected) onSelect({ kind: "light", id: fixture.id });
        if (editMode === "select" && canDragFixture && (selected || multiSelected)) {
          if (moveMode === "vertical") startHeightDrag(event);
          else drag.onPointerDown(event);
        }
      }}
      onDoubleClick={(event: ThreeEvent<MouseEvent>) => {
        if (placement.pendingAdd || !eventObjectHasMarker(event, "fixtureBody")) return;
        event.stopPropagation();
        if (!selected) onSelect({ kind: "light", id: fixture.id });
        setMoveMode((current) => (current === "horizontal" ? "vertical" : "horizontal"));
      }}
      onPointerMove={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerMove(event);
              handleHeightDragMove(event);
            }
          : undefined
      }
      onPointerUp={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerUp(event);
              stopHeightDrag(event);
              if (wasSelectedRef.current && !movedRef.current) onSelect(null);
              wasSelectedRef.current = false;
              setDragSnap(null);
            }
          : undefined
      }
      onPointerCancel={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerCancel(event);
              stopHeightDrag(event);
              wasSelectedRef.current = false;
              setDragSnap(null);
            }
          : undefined
      }
      onLostPointerCapture={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onLostPointerCapture(event);
              stopHeightDrag(event, false);
            }
          : undefined
      }
    >
      <group userData={{ fixtureBody: true }}>
        {!pathTraced && <FixtureDragHitTarget fixture={fixture} />}
        <FixtureBody fixture={fixture} color={lightColor} active={emitsLight} debugMode={debugMode} />
        {emitsLight && <PhysicalLight fixture={fixture} castsRealtimeShadow={castsRealtimeShadow} debugMode={debugMode} />}
      </group>
      {showOutline && (
        <>
          <mesh raycast={ignoreRaycast}>
            <sphereGeometry args={[0.18, 24, 16]} />
            <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.95} />
          </mesh>
          <FixtureMoveModeCue mode={moveMode} minY={minMoveY} maxY={maxMoveY} currentY={fixture.position.y} />
        </>
      )}
      {!pathTraced && dragSnap?.snapX != null && (
        // group はライト中心に乗っているのでローカル座標へ戻して水平方向に描く。
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([0, guideY - fixture.position.y, -guideSpan, 0, guideY - fixture.position.y, guideSpan]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffd24a" transparent opacity={0.8} />
        </line>
      )}
      {!pathTraced && dragSnap?.snapZ != null && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([-guideSpan, guideY - fixture.position.y, 0, guideSpan, guideY - fixture.position.y, 0]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffd24a" transparent opacity={0.8} />
        </line>
      )}
      {showAimEditor && <LightAimHandle fixture={fixture} />}
      {!showAimEditor && debugMode !== "beauty" && fixture.target && (
        <LightDirectionLine fixture={fixture} />
      )}
      {/* 壁付き照明は設置高さ(position.y)自体を上下ドラッグできる専用グリップを出す
          （狙い先=targetの高さドラッグとは別物。壁面のx,z拘束は維持したまま高さだけ動かす）。 */}
      {wallMounted && selected && !pathTraced && editMode !== "delete" && <FixtureHeightHandle fixture={fixture} />}
    </group>
  );
};

const InvisibleHitMaterial = () => (
  <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
);

const FixtureDragHitTarget = ({ fixture }: { fixture: LightFixture }) => {
  if (fixture.type === "tape") {
    return (
      <mesh>
        <boxGeometry args={[Math.max(fixture.lengthM ?? 1.2, 0.5), 0.36, 0.36]} />
        <InvisibleHitMaterial />
      </mesh>
    );
  }

  return (
    <mesh>
      <sphereGeometry args={[0.42, 18, 12]} />
      <InvisibleHitMaterial />
    </mesh>
  );
};

const FixtureMoveModeCue = ({
  mode,
  minY,
  maxY,
  currentY
}: {
  mode: FixtureMoveMode;
  minY: number;
  maxY: number;
  currentY: number;
}) => {
  if (mode === "vertical") {
    const x = 0.32;
    const low = minY - currentY;
    const high = maxY - currentY;
    return (
      <group renderOrder={39}>
        <DebugLine from={[x, low, 0]} to={[x, high, 0]} color="#7fd6ff" />
        <mesh position={[x, Math.min(high, 0.42), 0]} renderOrder={39} raycast={ignoreRaycast}>
          <coneGeometry args={[0.04, 0.1, 18]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.88} depthTest={false} />
        </mesh>
        <mesh position={[x, Math.max(low, -0.42), 0]} rotation-x={Math.PI} renderOrder={39} raycast={ignoreRaycast}>
          <coneGeometry args={[0.04, 0.1, 18]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.88} depthTest={false} />
        </mesh>
      </group>
    );
  }

  return (
    <mesh rotation-x={Math.PI / 2} renderOrder={39} raycast={ignoreRaycast}>
      <torusGeometry args={[0.28, 0.01, 8, 48]} />
      <meshBasicMaterial color="#f5c64d" transparent opacity={0.78} depthTest={false} />
    </mesh>
  );
};

const LightAimHandle = ({ fixture }: { fixture: LightFixture }) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const updateLight = useProjectStore((store) => store.updateLight);
  const beginHistoryGroup = useProjectStore((store) => store.beginHistoryGroup);
  const endHistoryGroup = useProjectStore((store) => store.endHistoryGroup);
  const project = useProjectStore((store) => store.project);
  const floorLevelM = useProjectStore((store) => store.project.room.floorLevelM ?? 0);
  const target = fixture.target ?? { x: fixture.position.x, y: 0, z: fixture.position.z };
  const minTargetY = 0;
  const maxTargetY = Math.max(
    minTargetY + 0.2,
    fixture.position.y + 1.2,
    wallMountHeightLimit(project, fixture),
    project.room.ceilingHeightM + 0.8
  );
  const localOffset = {
    x: target.x - fixture.position.x,
    y: target.y - fixture.position.y,
    z: target.z - fixture.position.z
  };
  const dragRef = useRef<{
    mode: "plane" | "height" | null;
    grabX: number;
    grabY: number;
    grabZ: number;
  }>({ mode: null, grabX: 0, grabY: 0, grabZ: 0 });
  const horizontalPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const heightHit = useMemo(() => new THREE.Vector3(), []);
  const heightGripOffsetX = 0.28;

  useEffect(() => {
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [controls]);

  const heightFromRay = (event: ThreeEvent<PointerEvent>) => {
    const start = new THREE.Vector3(target.x + heightGripOffsetX, floorLevelM + minTargetY, target.z);
    const end = new THREE.Vector3(target.x + heightGripOffsetX, floorLevelM + maxTargetY, target.z);
    event.ray.distanceSqToSegment(start, end, undefined, heightHit);
    return heightHit.y - floorLevelM;
  };

  const startHorizontalDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
    event.stopPropagation();
    beginHistoryGroup();
    horizontalPlane.constant = -(floorLevelM + target.y);
    // レイが水平面とほぼ平行(カメラが面と同高)だと intersectPlane が外れるが、
    // ここで return するとドラッグが起動しない。掴みオフセット0でモードだけ確定し、
    // 以降の move で面ヒットが取れた時点から追従を開始する（信頼性優先）。
    const grabbed = event.ray.intersectPlane(horizontalPlane, hit);
    dragRef.current = {
      mode: "plane",
      grabX: grabbed ? target.x - hit.x : 0,
      grabY: 0,
      grabZ: grabbed ? target.z - hit.z : 0
    };
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
  };

  const startHeightDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
    event.stopPropagation();
    beginHistoryGroup();
    dragRef.current = {
      mode: "height",
      grabX: 0,
      grabY: target.y - heightFromRay(event),
      grabZ: 0
    };
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (!drag.mode) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
      stopDrag(event);
      return;
    }
    event.stopPropagation();
    if (drag.mode === "plane") {
      horizontalPlane.constant = -(floorLevelM + target.y);
      if (!event.ray.intersectPlane(horizontalPlane, hit)) return;
      updateLight(fixture.id, {
        target: {
          ...target,
          x: hit.x + drag.grabX,
          z: hit.z + drag.grabZ
        }
      });
      return;
    }
    updateLight(fixture.id, {
      target: {
        ...target,
        y: THREE.MathUtils.clamp(heightFromRay(event) + drag.grabY, minTargetY, maxTargetY)
      }
    });
  };

  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current.mode) return;
    event.stopPropagation();
    dragRef.current.mode = null;
    endHistoryGroup();
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  // setPointerCapture は event.target（＝onPointerDown を持つグリップmesh）に掛かるため、
  // 追従/終了ハンドラも同じmeshに置かないと move が親グループに届かず即ドロップする。
  // useFloorDrag と同じく capture 先とハンドラ所有者を一致させる。
  const gripDragHandlers = {
    onPointerMove: handlePointerMove,
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag
  };

  return (
    <group renderOrder={40}>
      <DebugLine from={[0, 0, 0]} to={[localOffset.x, localOffset.y, localOffset.z]} color="#ffd34f" />
      <DebugLine
        from={[localOffset.x + heightGripOffsetX, minTargetY - fixture.position.y, localOffset.z]}
        to={[localOffset.x + heightGripOffsetX, maxTargetY - fixture.position.y, localOffset.z]}
        color="#ffe38a"
      />
      {/* depthTest 無効で常に手前に描く=見た目は最優先のため、raycast上も奥の壁/吹き抜けに
          負けないよう userData.dragHandle を付与する（WallMesh/VoidMarker側が優先譲歩する）。 */}
      <group position={[localOffset.x, localOffset.y, localOffset.z]} userData={{ dragHandle: true }}>
        {/* 当たり判定プロキシ: リング内側まで掴める不可視ディスク（colorWrite=false で
            描画されないが raycast 対象）。極小グリップのヒット面積不足を補う。 */}
        <mesh onPointerDown={startHorizontalDrag} {...gripDragHandlers} renderOrder={41}>
          <cylinderGeometry args={[0.2, 0.2, 0.04, 24]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} depthTest={false} transparent opacity={0} />
        </mesh>
        <mesh rotation-x={Math.PI / 2} onPointerDown={startHorizontalDrag} {...gripDragHandlers} renderOrder={42}>
          <torusGeometry args={[0.17, 0.02, 8, 40]} />
          <meshBasicMaterial color="#ffd34f" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh onPointerDown={startHorizontalDrag} {...gripDragHandlers} renderOrder={43}>
          <sphereGeometry args={[0.06, 18, 12]} />
          <meshBasicMaterial color="#fff2a8" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh position={[heightGripOffsetX, 0, 0]} onPointerDown={startHeightDrag} {...gripDragHandlers} renderOrder={44}>
          <sphereGeometry args={[0.055, 18, 12]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh position={[heightGripOffsetX, 0.12, 0]} onPointerDown={startHeightDrag} {...gripDragHandlers} renderOrder={44}>
          <coneGeometry args={[0.045, 0.09, 18]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.85} depthTest={false} />
        </mesh>
        <mesh position={[heightGripOffsetX, -0.12, 0]} rotation-x={Math.PI} onPointerDown={startHeightDrag} {...gripDragHandlers} renderOrder={44}>
          <coneGeometry args={[0.045, 0.09, 18]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.85} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};

// 壁付き照明の可動域上限の目安。所属する壁の高さ（吹き抜け壁なら吹き抜け上部の高さ）を使い、
// 見つからなければ通常天井高さにフォールバックする。
const wallMountHeightLimit = (project: Project, fixture: LightFixture): number => {
  const floor = fixture.floor ?? project.activeFloor ?? 1;
  const surface = nearestWallMountSurfaceAt(project, fixture.position.x, fixture.position.z, floor);
  if (!surface) return project.room.ceilingHeightM;
  const voidWall = parseVoidWallId(surface.wallId);
  if (voidWall) {
    const matchedVoid = project.voids.find((voidArea) => voidArea.id === voidWall.voidId);
    return matchedVoid ? voidTopHeightM(project, matchedVoid) : voidCeilingHeightAt(project, floor);
  }
  const wall = project.walls.find((candidate) => candidate.id === surface.wallId);
  return wall?.heightM ?? project.room.ceilingHeightM;
};

// 壁付き照明の設置高さ(position.y)を直接ドラッグするグリップ。壁面へのx,z拘束は保ったまま
// 高さだけ動かす（狙い先=targetの高さドラッグ(startHeightDrag/LightAimHandle)とは別物）。
const FixtureHeightHandle = ({ fixture }: { fixture: LightFixture }) => {
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const touchGuard = useTouchDragGuard();
  const updateLight = useProjectStore((store) => store.updateLight);
  const beginHistoryGroup = useProjectStore((store) => store.beginHistoryGroup);
  const endHistoryGroup = useProjectStore((store) => store.endHistoryGroup);
  const project = useProjectStore((store) => store.project);
  const floorLevelM = useProjectStore((store) => store.project.room.floorLevelM ?? 0);
  const minY = 0.3;
  const maxY = Math.max(minY + 0.2, wallMountHeightLimit(project, fixture) - 0.05);
  const gripOffsetX = -0.26;
  const dragging = useRef(false);
  const grabY = useRef(0);
  const hit = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [controls]);

  const heightFromRay = (event: ThreeEvent<PointerEvent>) => {
    const start = new THREE.Vector3(fixture.position.x + gripOffsetX, floorLevelM + minY, fixture.position.z);
    const end = new THREE.Vector3(fixture.position.x + gripOffsetX, floorLevelM + maxY, fixture.position.z);
    event.ray.distanceSqToSegment(start, end, undefined, hit);
    return hit.y - floorLevelM;
  };

  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) return;
    event.stopPropagation();
    beginHistoryGroup();
    dragging.current = true;
    grabY.current = fixture.position.y - heightFromRay(event);
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    if (controls) controls.enabled = false;
  };

  const stopDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    endHistoryGroup();
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    if (event.pointerType === "touch" && touchGuard.hasMultiTouch()) {
      stopDrag(event);
      return;
    }
    event.stopPropagation();
    const y = THREE.MathUtils.clamp(heightFromRay(event) + grabY.current, minY, maxY);
    updateLight(fixture.id, { position: { ...fixture.position, y }, mountHeightM: y });
  };

  const gripDragHandlers = {
    onPointerMove: handlePointerMove,
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag
  };

  return (
    <group renderOrder={40}>
      <DebugLine
        from={[gripOffsetX, minY - fixture.position.y, 0]}
        to={[gripOffsetX, maxY - fixture.position.y, 0]}
        color="#7fd6ff"
      />
      {/* WallMesh/VoidMarker側が奥の壁より優先して譲るための目印(LightAimHandleと同じ仕組み)。 */}
      <group position={[gripOffsetX, 0, 0]} userData={{ dragHandle: true }}>
        <mesh onPointerDown={startDrag} {...gripDragHandlers} renderOrder={41}>
          <sphereGeometry args={[0.06, 18, 12]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.95} depthTest={false} />
        </mesh>
        <mesh position={[0, 0.11, 0]} onPointerDown={startDrag} {...gripDragHandlers} renderOrder={41}>
          <coneGeometry args={[0.045, 0.09, 18]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.85} depthTest={false} />
        </mesh>
        <mesh position={[0, -0.11, 0]} rotation-x={Math.PI} onPointerDown={startDrag} {...gripDragHandlers} renderOrder={41}>
          <coneGeometry args={[0.045, 0.09, 18]} />
          <meshBasicMaterial color="#7fd6ff" transparent opacity={0.85} depthTest={false} />
        </mesh>
      </group>
    </group>
  );
};
