import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

// event.intersections の各ヒットの祖先を辿り、指定した userData キーを持つオブジェクトが
// 含まれるか調べる。壁/吹き抜けの見た目上の奥にある要素を優先させたい判定の共通処理。
export const eventHitsMarker = (event: ThreeEvent<PointerEvent>, key: string): boolean =>
  event.intersections.some((intersection) => {
    return objectHasMarker(intersection.object, key);
  });

export const objectHasMarker = (object: THREE.Object3D | null | undefined, key: string): boolean => {
  let current = object ?? null;
  while (current) {
    if (current.userData?.[key]) return true;
    current = current.parent;
  }
  return false;
};

export const eventObjectHasMarker = (event: { object: THREE.Object3D }, key: string): boolean =>
  objectHasMarker(event.object, key);

export const ignoreRaycast: THREE.Object3D["raycast"] = () => {};

// 距離ソート済みの event.intersections に、壁以外の選択可能オブジェクト
// （userData.selectable を持つ照明/家具ルート）が含まれるか。raycast は
// opacity/transparent を無視するため外壁面も手前ヒットになる。室外から
// 外壁面をクリックした時、奥に選択対象があれば壁が手前でも選択を譲るための判定。
export const eventHitsSelectable = (event: ThreeEvent<PointerEvent>): boolean => eventHitsMarker(event, "selectable");

// ドラッグハンドル(グリップ)は depthTest 無効で常に手前に見えるよう描くため、raycast上は
// 奥の壁/吹き抜けに負けることがある。見た目どおりグリップを優先して掴めるようにする判定。
export const eventHitsDragHandle = (event: ThreeEvent<PointerEvent>): boolean => eventHitsMarker(event, "dragHandle");

// event.intersections に、自分(ownWallId)以外の壁面/吹き抜け壁面(userData.wallId)が
// 含まれるか。外壁の外側からその奥の壁/吹き抜け壁へ窓・扉・壁ライトを置きたい時、
// 手前の外壁ではなく奥の壁を優先させるための判定。
export const eventHitsOtherWall = (event: ThreeEvent<PointerEvent>, ownWallId: string): boolean =>
  event.intersections.some((intersection) => {
    let object: THREE.Object3D | null = intersection.object;
    while (object) {
      const id = object.userData?.wallId;
      if (typeof id === "string" && id !== ownWallId) return true;
      object = object.parent;
    }
    return false;
  });
