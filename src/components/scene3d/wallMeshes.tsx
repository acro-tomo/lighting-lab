import type { ThreeEvent } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { isWallLightAddKind } from "../../data/fixtureAddKinds";
import type { RenderDebugMode } from "../../rendering/pathTracer";
import { useProjectStore } from "../../store/projectStore";
import type { MaterialPreset, Project, Selection, VoidArea, WallSegment, WindowOpening } from "../../types";
import { wallInwardNormal } from "../../utils/wallGeometry";
import { isWallPending, useEditMode, usePathTraced, usePlacement } from "./contexts";
import { useFloorDrag } from "./dragHooks";
import { debugColorForRole, useWallpaperTexture } from "./materials";
import { eventHitsDragHandle, eventHitsOtherWall, eventHitsSelectable } from "./raycastUtils";
import type { FloorBounds } from "./roomGeometry";
import { projectPointOntoWall } from "./roomGeometry";

// 壁を窓/扉/開口の矩形でくり抜き、残った無地部分を矩形パネル群で埋める。
// 壁を1枚の不透明プレーンにすると、ガラスの後ろに壁が居座り「窓の外=壁」に
// 見える。開口を実際に開けることで、窓越しに外(空+地面+遠景)が見える。
type WallPanelRect = { cx: number; cy: number; w: number; h: number };
const wallPanelsWithHoles = (
  length: number,
  height: number,
  holes: { cx: number; w: number; bottom: number; top: number }[]
): WallPanelRect[] => {
  const halfL = length / 2;
  if (holes.length === 0) {
    return [{ cx: 0, cy: height / 2, w: length, h: height }];
  }
  // 壁内座標(0..length)で扱い、最後に中心基準(-halfL..halfL)へ変換する。
  const spans = holes
    .map((hole) => {
      const x0 = Math.max(0, hole.cx - hole.w / 2);
      const x1 = Math.min(length, hole.cx + hole.w / 2);
      const bottom = Math.max(0, hole.bottom);
      const top = Math.min(height, hole.top);
      return { x0, x1, bottom, top };
    })
    .filter((span) => span.x1 - span.x0 > 0.001 && span.top - span.bottom > 0.001)
    .sort((a, b) => a.x0 - b.x0);

  const panels: WallPanelRect[] = [];
  const pushColumn = (left: number, right: number, bottom: number, top: number) => {
    const w = right - left;
    const h = top - bottom;
    if (w <= 0.001 || h <= 0.001) return;
    panels.push({ cx: (left + right) / 2 - halfL, cy: (bottom + top) / 2, w, h });
  };

  let cursor = 0;
  spans.forEach((span) => {
    // 開口の左側を全高で埋める。
    pushColumn(cursor, span.x0, 0, height);
    // 開口の上下を埋める（左右方向は開口幅ぶん）。
    pushColumn(span.x0, span.x1, 0, span.bottom);
    pushColumn(span.x0, span.x1, span.top, height);
    cursor = Math.max(cursor, span.x1);
  });
  // 最後の開口の右側を全高で埋める。
  pushColumn(cursor, length, 0, height);
  return panels;
};

// 壁パネル1枚。壁紙テクスチャはパネル実寸でタイルするよう repeat を割り当て、
// パネルごとにクローンして縮尺を揃える（くり抜きで分割されても見た目が連続）。
const WallPanel = ({
  rect,
  wallHeight,
  depth,
  wallpaper,
  tile,
  material,
  debugMode,
  seeThrough
}: {
  rect: WallPanelRect;
  wallHeight: number;
  depth: number;
  wallpaper: THREE.Texture | null;
  tile: { w: number; h: number };
  material: MaterialPreset;
  debugMode: RenderDebugMode;
  // カメラがこの壁の外側にいるとき true。外壁スキン(material-5)を薄く透かして
  // 室外から室内を覗けるようにする。mesh 自体は raycast 対象のまま残す。
  seeThrough: boolean;
}) => {
  const map = useMemo(() => {
    if (!wallpaper) return null;
    const clone = wallpaper.clone();
    clone.needsUpdate = true;
    clone.repeat.set(
      Math.max(0.01, rect.w / Math.max(0.05, tile.w)),
      Math.max(0.01, rect.h / Math.max(0.05, tile.h))
    );
    return clone;
  }, [wallpaper, rect.w, rect.h, tile.w, tile.h]);
  const wallColor = debugColorForRole("wall", debugMode, material.baseColor);

  return (
    <mesh position={[rect.cx, rect.cy - wallHeight / 2, 0]} receiveShadow castShadow>
      <boxGeometry args={[rect.w, rect.h, depth]} />
      {[0, 1, 2, 3, 4].map((index) => (
        <meshStandardMaterial
          key={index}
          attach={`material-${index}`}
          map={map ?? undefined}
          color={map ? "#ffffff" : wallColor}
          roughness={material.roughness}
          metalness={material.metalness}
          emissive={material.emissiveColor}
          emissiveIntensity={debugMode === "beauty" ? material.emissiveIntensity : 0}
        />
      ))}
      {/* BoxGeometry material-5 is local -Z = 外壁スキン。室内側から見るときは不透明にして
          窓越しの見え方を正す(f80ab97)。室外側から覗くときは薄く透かして室内が見えるようにする。 */}
      <meshStandardMaterial
        attach="material-5"
        map={map ?? undefined}
        color={map ? "#ffffff" : wallColor}
        roughness={material.roughness}
        metalness={material.metalness}
        emissive={material.emissiveColor}
        emissiveIntensity={debugMode === "beauty" ? material.emissiveIntensity : 0}
        side={THREE.DoubleSide}
        transparent={seeThrough}
        opacity={seeThrough ? (debugMode === "beauty" ? 0.08 : 0.16) : 1}
        depthWrite={!seeThrough}
      />
    </mesh>
  );
};

// 壁コーナーの隙間埋め: 各端点が他の壁の端点と近接(=接続)していれば、その端だけ
// 半厚ぶん延長して隣接壁へ食い込ませる。自由端(どの壁とも接続しない端)は延長しない
// （外側へ飛び出さないように）。延長後の start/end を返す。
const cornerExtendedWall = (wall: WallSegment, walls: WallSegment[]): { start: { x: number; z: number }; end: { x: number; z: number } } => {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-4) return { start: { ...wall.start }, end: { ...wall.end } };
  const ux = dx / length;
  const uz = dz / length;
  // 端点が他の壁のいずれかの端点と近接しているか。epsilon は厚みの和の半分程度。
  const connected = (px: number, pz: number) => {
    for (const other of walls) {
      if (other.id === wall.id) continue;
      const eps = (wall.thicknessM + other.thicknessM) / 2 + 0.02;
      for (const pt of [other.start, other.end]) {
        if (Math.hypot(px - pt.x, pz - pt.z) <= eps) return true;
      }
    }
    return false;
  };
  const ext = wall.thicknessM / 2;
  const startExt = connected(wall.start.x, wall.start.z) ? ext : 0;
  const endExt = connected(wall.end.x, wall.end.z) ? ext : 0;
  return {
    start: { x: wall.start.x - ux * startExt, z: wall.start.z - uz * startExt },
    end: { x: wall.end.x + ux * endExt, z: wall.end.z + uz * endExt }
  };
};

export const WallMesh = ({
  wall,
  walls,
  windows,
  material,
  roomCenter,
  floorBounds,
  selected,
  onSelect,
  debugMode,
  canEditWalls
}: {
  wall: WallSegment;
  walls: WallSegment[];
  windows: WindowOpening[];
  material: MaterialPreset;
  roomCenter: THREE.Vector3;
  floorBounds: FloorBounds;
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
  canEditWalls: boolean;
}) => {
  // コーナーの隙間を塞ぐため接続端だけ半厚ぶん延長した端点で描く。
  // 窓 hole は元の centerRatio から絶対座標(wx,wz)を求め、延長後の midpoint/length に
  // 対して射影するので、延長してもガラス位置・幅はずれない（cx は絶対位置基準）。
  const ext = cornerExtendedWall(wall, walls);
  const dx = ext.end.x - ext.start.x;
  const dz = ext.end.z - ext.start.z;
  const length = Math.hypot(dx, dz);
  const midpointVector = new THREE.Vector3((ext.start.x + ext.end.x) / 2, wall.heightM / 2, (ext.start.z + ext.end.z) / 2);
  const inward = wallInwardNormal(wall, { x: roomCenter.x, z: roomCenter.z });
  const inwardNormal = new THREE.Vector3(inward.x, 0, inward.z);
  const rotationY = Math.atan2(inwardNormal.x, inwardNormal.z);
  const pathTraced = usePathTraced();
  const placement = usePlacement();
  const camera = useThree((state) => state.camera);
  const tile = material.textureSizeM ?? { w: 0.92, h: 0.92 };
  const groupRef = useRef<THREE.Group>(null);

  // 外壁スキンの外向き法線(=inwardの逆)。カメラがこの側にいる=室外から覗いている。
  const exteriorNormal = useMemo(
    () => new THREE.Vector3(-inwardNormal.x, 0, -inwardNormal.z),
    [inwardNormal.x, inwardNormal.z]
  );
  // 外壁を透かすのは、カメラが建物外形の外から覗いている時だけ。
  // 壁単体の外側判定だけだと、室内から窓越しに見た別壁の外側面まで透ける。
  const [exteriorSeeThrough, setExteriorSeeThrough] = useState(false);
  useFrame(() => {
    // 常駐パストレ時は f80ab97 の不透明挙動を維持（編集ビュー専用の可視化）。
    if (pathTraced) return;
    const outsideWall =
      (camera.position.x - midpointVector.x) * exteriorNormal.x +
        (camera.position.z - midpointVector.z) * exteriorNormal.z >
      0;
    const halfX = floorBounds.sizeX / 2;
    const halfZ = floorBounds.sizeZ / 2;
    const insideFloorBounds =
      camera.position.x >= floorBounds.centerX - halfX &&
      camera.position.x <= floorBounds.centerX + halfX &&
      camera.position.z >= floorBounds.centerZ - halfZ &&
      camera.position.z <= floorBounds.centerZ + halfZ;
    const next = outsideWall && !insideFloorBounds;
    setExteriorSeeThrough((prev) => (prev === next ? prev : next));
  });

  const wallHitFromEvent = (event: ThreeEvent<PointerEvent>) => {
    const group = groupRef.current;
    const candidates = [event.point.clone()];
    if (event.object) candidates.push(event.object.localToWorld(event.point.clone()));
    let bestWorld = candidates[0];
    let bestScore = Infinity;
    for (const world of candidates) {
      const local = group ? group.worldToLocal(world.clone()) : world.clone();
      const clampedX = THREE.MathUtils.clamp(local.x, -length / 2, length / 2);
      const clampedY = THREE.MathUtils.clamp(local.y, -wall.heightM / 2, wall.heightM / 2);
      const score =
        Math.abs(local.x - clampedX) +
        Math.abs(local.y - clampedY) +
        Math.abs(local.z) * 2;
      if (score < bestScore) {
        bestScore = score;
        bestWorld = world;
      }
    }
    const { ratio } = projectPointOntoWall(bestWorld.x, bestWorld.z, wall);
    const surfaceOffset = wall.thicknessM / 2 + 0.04;
    const wallX = wall.start.x + (wall.end.x - wall.start.x) * ratio;
    const wallZ = wall.start.z + (wall.end.z - wall.start.z) * ratio;
    const angle = Math.atan2(inwardNormal.x, inwardNormal.z);
    return {
      wallId: wall.id,
      ratio,
      x: wallX + inwardNormal.x * surfaceOffset,
      y: bestWorld.y,
      z: wallZ + inwardNormal.z * surfaceOffset,
      angle
    };
  };

  // この壁に属する開口を、壁ローカルX(-length/2..length/2)・高さに変換してくり抜く。
  // パネルの並ぶローカル +X 軸（rotationY適用後の(1,0,0)）に窓中心を射影して
  // cx を求めることで、壁の向きやrotationの符号によらず WindowMesh と必ず一致する。
  const localXAxis = new THREE.Vector3(Math.cos(rotationY), 0, -Math.sin(rotationY));
  const holes = windows.map((windowItem) => {
    const wx = wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio;
    const wz = wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio;
    const cxCentered = new THREE.Vector3(wx - midpointVector.x, 0, wz - midpointVector.z).dot(localXAxis);
    return {
      // wallPanelsWithHoles は壁内座標(0..length)で扱うので中心基準から変換。
      cx: cxCentered + length / 2,
      w: windowItem.widthM,
      bottom: windowItem.sillHeightM,
      top: windowItem.sillHeightM + windowItem.heightM
    };
  });
  // 手すりは「抜け」が要るのでソリッドパネルにせず笠木+縦支柱で組む（窓くり抜きは不要）。
  const isRailing = wall.kind === "railing";
  const panels = isRailing ? [] : wallPanelsWithHoles(length, wall.heightM, holes);
  // 縦支柱を約0.11m間隔で両端含めて配置（壁ローカルX: -length/2..length/2）。
  const postSpacing = 0.11;
  const postCount = Math.max(2, Math.round(length / postSpacing) + 1);
  const postXs = isRailing
    ? Array.from({ length: postCount }, (_, i) => -length / 2 + (length * i) / (postCount - 1))
    : [];
  // 笠木/下桟の厚みは壁厚を上限に細くする。
  const railDepth = Math.min(wall.thicknessM, 0.06);
  // 壁全体ぶんの基準テクスチャ(repeat=1)を読み、パネルごとに repeat を実寸で割り当てる。
  const wallpaper = useWallpaperTexture(
    debugMode === "beauty" ? material.textureDataUrl : undefined,
    1,
    1
  );

  return (
    <group
      ref={groupRef}
      position={[midpointVector.x, midpointVector.y, midpointVector.z]}
      rotation={[0, rotationY, 0]}
      // canEditWalls=false の壁（吹き抜け上部の2階echo壁など、UpperVoidLevel由来の非編集複製）は
      // 実際のクリック対象ではないため wallId を持たせず、eventHitsOtherWall の誤判定を避ける。
      userData={canEditWalls ? { wallId: wall.id } : undefined}
      // 選択は onPointerDown で確定する。手前の家具/照明は同じ pointerdown で
      // stopPropagation するため、onClick だと手前を選んでも click が壁へ伝播して
      // 選択が壁に転写される再発バグになる。pointer 系で統一して伝播を断つ。
      // 壁ライト(wallspot)配置中は、カーソルが壁上に来たら壁面ヒットをゴーストへ上げる。
      onPointerMove={
        isWallLightAddKind(placement.pendingAdd)
          ? (event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation();
              placement.onWallHover?.(wallHitFromEvent(event));
            }
          : undefined
      }
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        // 壁物（窓・扉・壁ライト）の配置中は、選択ではなくクリックした壁自身へ設置する。
        // クリック点(x,z)をこの壁に射影して比率を求める（最寄り壁＝クリック壁）。
        if (isWallPending(placement.pendingAdd)) {
          // 外壁の外側面をクリックした時、奥に別の壁/吹き抜け壁があればそちらを優先する
          // （外から窓/壁ライト等を置こうとすると手前の外壁に置かれてしまう問題への対処）。
          if ((event.face?.normal.z ?? 0) < 0 && eventHitsOtherWall(event, wall.id)) return;
          event.stopPropagation();
          const hit = wallHitFromEvent(event);
          // 壁ライトはカーソルの壁上ワールドYをそのまま高さに渡す（壁面に吸い付かせる）。
          // 窓/扉は heightM 省略で種別既定の高さに任せる。
          const heightM = isWallLightAddKind(placement.pendingAdd) ? hit.y : undefined;
          placement.onPlaceOnWall?.(wall.id, hit.ratio, heightM);
          return;
        }
        // ドラッグハンドル(グリップ)は depthTest 無効で常に手前に見えるため、
        // 見た目どおりグリップを優先して掴めるようにする（奥の壁に負けない）。
        if (eventHitsDragHandle(event)) return;
        // 外壁スキン(local -Z = exterior, material-5)を室外からクリックした
        // 場合のみ、奥にライト/家具があれば壁を奪わず伝播させ奥を選ばせる。室内側の不透明
        // 面(+Z)クリックは従来どおり壁を選択する（壁裏の不可視オブジェクトを誤選択しない）。
        // 手前に選択可能物がある場合は相手が先に stopPropagation するため、ここに来る時点で
        // 選択可能物は常に壁より奥のケースに限られる。
        if ((event.face?.normal.z ?? 0) < 0 && eventHitsSelectable(event)) return;
        event.stopPropagation();
        if (!canEditWalls) return;
        // 選択中の壁を再クリックしたら選択解除（手軽に解除できるように）。
        onSelect(selected ? null : { kind: "wall", id: wall.id });
      }}
    >
      {/* 壁を開口でくり抜いた残りパネル群。castShadow で窓開口を通る日光が
          室内に差し込む（夜間の人工照明は器具側の影で支配的なので影響は小さい）。 */}
      {panels.map((panel, index) => (
        <WallPanel
          key={index}
          rect={panel}
          wallHeight={wall.heightM}
          depth={wall.thicknessM}
          wallpaper={wallpaper}
          tile={tile}
          material={material}
          debugMode={debugMode}
          seeThrough={exteriorSeeThrough && !pathTraced}
        />
      ))}
      {isRailing && (
        <>
          {/* 笠木（上桟）と下桟。group原点Yは heightM/2 なので局所Yは world高さ-heightM/2。 */}
          <mesh position={[0, (wall.heightM - 0.025) - wall.heightM / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[length, 0.05, railDepth]} />
            <meshStandardMaterial
              color={debugColorForRole("wall", debugMode, material.baseColor)}
              roughness={material.roughness}
              metalness={material.metalness}
            />
          </mesh>
          <mesh position={[0, 0.05 - wall.heightM / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[length, 0.05, railDepth]} />
            <meshStandardMaterial
              color={debugColorForRole("wall", debugMode, material.baseColor)}
              roughness={material.roughness}
              metalness={material.metalness}
            />
          </mesh>
          {postXs.map((px, index) => (
            <mesh key={`post-${index}`} position={[px, 0, 0]} receiveShadow castShadow>
              <boxGeometry args={[0.04, wall.heightM, 0.04]} />
              <meshStandardMaterial
                color={debugColorForRole("wall", debugMode, material.baseColor)}
                roughness={material.roughness}
                metalness={material.metalness}
              />
            </mesh>
          ))}
        </>
      )}
      {selected && !pathTraced && (
        <mesh>
          <planeGeometry args={[length + 0.03, wall.heightM + 0.03]} />
          <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};

export const BaseBoards = ({ project }: { project: Project }) => (
  <>
    {project.walls.map((wall) => {
      // 手すりは床から浮く笠木構造なので、下に巾木が出ると不自然。巾木を描かない。
      if (wall.kind === "railing") return null;
      const dx = wall.end.x - wall.start.x;
      const dz = wall.end.z - wall.start.z;
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      return (
        <mesh
          key={`${wall.id}-baseboard`}
          position={[(wall.start.x + wall.end.x) / 2, 0.055, (wall.start.z + wall.end.z) / 2]}
          rotation={[0, -angle, 0]}
          castShadow
        >
          <boxGeometry args={[length, 0.11, 0.035]} />
          <meshStandardMaterial color="#cfc8bb" roughness={0.82} />
        </mesh>
      );
    })}
  </>
);

export const WindowMesh = ({
  windowItem,
  walls,
  selected,
  onSelect,
  debugMode
}: {
  windowItem: WindowOpening;
  walls: WallSegment[];
  selected: boolean;
  onSelect: (selection: Selection) => void;
  debugMode: RenderDebugMode;
}) => {
  const wall = walls.find((item) => item.id === windowItem.wallId);
  const pathTraced = usePathTraced();
  const placement = usePlacement();
  const editMode = useEditMode();
  const updateWindow = useProjectStore((store) => store.updateWindow);
  const floorLevelM = useProjectStore((store) => store.project.room.floorLevelM ?? 0);
  // 窓の現在のワールド中心(x,z)。掴み位置の相対オフセットを保つため useFloorDrag の current に渡す。
  const centerX = wall ? wall.start.x + (wall.end.x - wall.start.x) * windowItem.centerRatio : 0;
  const centerZ = wall ? wall.start.z + (wall.end.z - wall.start.z) * windowItem.centerRatio : 0;
  // 窓は壁に拘束されるので、床平面ヒット(x,z)を所属壁へ射影し centerRatio を再計算する。
  // x,z は平面のY高さに依存しないため、平面Yは floorLevelM(室内床)に揃えれば十分。
  // 選択済みオブジェクトの再クリックで選択解除するトグル判定用。実際にドラッグが
  // 発生した場合（=移動操作）は解除しない、クリックのみ(移動なし)の時だけ解除する。
  const wasSelectedRef = useRef(false);
  const movedRef = useRef(false);
  const drag = useFloorDrag(
    { x: centerX, z: centerZ },
    floorLevelM,
    (x, z) => {
      if (!wall) return;
      movedRef.current = true;
      const { ratio } = projectPointOntoWall(x, z, wall);
      updateWindow(windowItem.id, { centerRatio: Math.max(0, Math.min(1, ratio)) });
    }
  );
  if (!wall) return null;

  const x = centerX;
  const z = centerZ;
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
  const y = windowItem.sillHeightM + windowItem.heightM / 2;
  const style = windowItem.style ?? (windowItem.hasGlass ? "window" : "opening");
  const kind = windowItem.hasGlass ? "window" : "opening";
  const w = windowItem.widthM;
  const h = windowItem.heightM;
  const f = 0.06; // 枠の見付け幅
  const frameColor = debugColorForRole("fixture", debugMode, style === "door" ? "#cfc7b8" : "#e7e3da");
  const frame = (
    <meshStandardMaterial color={frameColor} roughness={0.6} metalness={0} />
  );

  return (
    <group
      position={[x, y, z - 0.012]}
      rotation={[0, -angle, 0]}
      // 選択は pointerdown で確定（onClick だと手前→背後へ click が伝播して選択転写が起きる）。
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        // 配置中は既存の窓/扉の上に重ねて置けるよう、壁メッシュへ素通りさせる。
        if (placement.pendingAdd) return;
        event.stopPropagation();
        wasSelectedRef.current = selected;
        movedRef.current = false;
        if (!selected) onSelect({ kind, id: windowItem.id });
        // 通常操作では壁沿いの水平移動ドラッグを開始（高さ変更は矢印キーに任せる）。
        if (editMode === "select" && selected) drag.onPointerDown(event);
      }}
      onPointerMove={editMode === "select" ? drag.onPointerMove : undefined}
      onPointerUp={
        editMode === "select"
          ? (event: ThreeEvent<PointerEvent>) => {
              drag.onPointerUp(event);
              // 移動を伴わないクリックで、既に選択中の窓/扉を再選択しようとした場合のみ解除する。
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
      {/* 枠（窓・扉とも周囲に回す） */}
      {style !== "opening" && (
        <>
          <mesh position={[0, h / 2 - f / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, f, 0.1]} />
            {frame}
          </mesh>
          <mesh position={[0, -h / 2 + f / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, f, 0.1]} />
            {frame}
          </mesh>
          <mesh position={[-w / 2 + f / 2, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[f, h, 0.1]} />
            {frame}
          </mesh>
          <mesh position={[w / 2 - f / 2, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[f, h, 0.1]} />
            {frame}
          </mesh>
        </>
      )}

      {style === "window" && (
        <>
          <mesh>
            <boxGeometry args={[w - f * 2, h - f * 2, 0.012]} />
            <meshPhysicalMaterial
              color={debugColorForRole("glass", debugMode, "#bcd4e0")}
              roughness={0.03}
              metalness={0}
              transmission={0.95}
              transparent
              opacity={1.0}
              ior={1.5}
            />
          </mesh>
          {/* 中桟（横） */}
          <mesh castShadow>
            <boxGeometry args={[w - f * 2, 0.035, 0.05]} />
            {frame}
          </mesh>
        </>
      )}

      {style === "door" && (
        <>
          {/* ドア板 */}
          <mesh position={[0, 0, 0.01]} castShadow receiveShadow>
            <boxGeometry args={[w - f * 2, h - f * 2, 0.04]} />
            <meshStandardMaterial color={debugColorForRole("furniture", debugMode, "#9d8b73")} roughness={0.7} metalness={0} />
          </mesh>
          {/* 取手 */}
          <mesh position={[w / 2 - f - 0.07, 0, 0.05]}>
            <boxGeometry args={[0.025, 0.14, 0.03]} />
            <meshStandardMaterial color="#2a2a28" roughness={0.4} metalness={0.7} />
          </mesh>
        </>
      )}

      {style === "opening" && !pathTraced && (
        <mesh userData={{ luxIgnore: true }}>
          <boxGeometry args={[w, h, 0.012]} />
          <meshBasicMaterial color="#0a0908" transparent opacity={0.42} />
        </mesh>
      )}

      {selected && !pathTraced && (
        <mesh position={[0, 0, -0.02]} userData={{ luxIgnore: true }}>
          <boxGeometry args={[w + 0.08, h + 0.08, 0.025]} />
          <meshBasicMaterial color="#f5c64d" wireframe />
        </mesh>
      )}
    </group>
  );
};

export const VoidMarker = ({
  voidArea,
  heightM,
  selected,
  onSelect
}: {
  voidArea: VoidArea;
  heightM: number;
  selected: boolean;
  onSelect: (selection: Selection) => void;
}) => {
  const pathTraced = usePathTraced();
  const placement = usePlacement();
  if (pathTraced) return null;
  return (
  <group
    position={[voidArea.center.x, heightM + 0.36, voidArea.center.z]}
    // 選択は pointerdown で確定（onClick だと手前→背後へ click が伝播して選択転写が起きる）。
    onPointerDown={(event: ThreeEvent<PointerEvent>) => {
      // 配置中はクリックを床キャッチャーへ素通りさせる（選択も伝播停止もしない）。
      if (placement.pendingAdd) return;
      // ドラッグハンドル(グリップ)は常に手前に見えるため、覆いかぶさるこのマーカーより
      // 優先して掴めるようにする（吹き抜け際の照明グリップを掴みにくい問題への対処）。
      if (eventHitsDragHandle(event)) return;
      event.stopPropagation();
      // 選択中の吹き抜けを再クリックしたら選択解除（手軽に解除できるように）。
      onSelect(selected ? null : { kind: "void", id: voidArea.id });
    }}
  >
    {selected && (
      <mesh>
        <boxGeometry args={[voidArea.size.x, 0.72, voidArea.size.z]} />
        <meshBasicMaterial color="#f5c64d" wireframe transparent opacity={0.45} />
      </mesh>
    )}
    <mesh position={[0, -0.39, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[voidArea.size.x, voidArea.size.z]} />
      <meshBasicMaterial color="#050505" transparent opacity={selected ? 0.42 : 0.16} />
    </mesh>
  </group>
  );
};
