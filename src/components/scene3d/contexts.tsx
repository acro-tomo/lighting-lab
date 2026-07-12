import { useThree } from "@react-three/fiber";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { isWallLightAddKind } from "../../data/fixtureAddKinds";
import type { EditMode } from "./types";

// 操作モードをシーン全体へ配る。通常の選択モードでドラッグ移動も行う。
export const EditModeContext = createContext<EditMode>("select");
export const useEditMode = () => useContext(EditModeContext);

type TouchDragGuard = { hasMultiTouch: () => boolean };
const TouchDragGuardContext = createContext<TouchDragGuard>({ hasMultiTouch: () => false });
export const useTouchDragGuard = () => useContext(TouchDragGuardContext);

export const TouchDragGuardProvider = ({ children }: { children: ReactNode }) => {
  const gl = useThree((state) => state.gl);
  const touchPointerIds = useRef(new Set<number>());
  useEffect(() => {
    const canvas = gl.domElement;
    const track = (event: PointerEvent) => {
      if (event.pointerType === "touch") touchPointerIds.current.add(event.pointerId);
    };
    const untrack = (event: PointerEvent) => {
      if (event.pointerType === "touch") touchPointerIds.current.delete(event.pointerId);
    };
    const clear = () => touchPointerIds.current.clear();
    canvas.addEventListener("pointerdown", track, { capture: true });
    canvas.addEventListener("pointerup", untrack, { capture: true });
    canvas.addEventListener("pointercancel", untrack, { capture: true });
    window.addEventListener("blur", clear);
    return () => {
      canvas.removeEventListener("pointerdown", track, { capture: true });
      canvas.removeEventListener("pointerup", untrack, { capture: true });
      canvas.removeEventListener("pointercancel", untrack, { capture: true });
      window.removeEventListener("blur", clear);
    };
  }, [gl.domElement]);

  const value = useMemo<TouchDragGuard>(
    () => ({ hasMultiTouch: () => touchPointerIds.current.size >= 2 }),
    []
  );
  return <TouchDragGuardContext.Provider value={value}>{children}</TouchDragGuardContext.Provider>;
};

// パストレ常駐モードでは選択枠・グロー・補助光など非物理の演出を隠す。
// これにより編集用シーンをそのまま物理ベースで描画でき、見たまま=最終結果になる。
export const PathTracedContext = createContext(false);
export const usePathTraced = () => useContext(PathTracedContext);

// 追加配置中かどうかを編集メッシュへ配る。配置中は子メッシュのクリックを
// 「選択」ではなく「配置」に振り替える/素通りさせる（パストレ常駐時は null=無効）。
// 壁ライト(wallspot)のゴーストプレビュー用に、壁メッシュが拾ったカーソルの壁上ヒットを共有する。
export type WallHover = { wallId: string; ratio: number; x: number; y: number; z: number; angle: number } | null;
type PlacementCtx = {
  pendingAdd: string | null;
  onPlaceOnWall?: (wallId: string, centerRatio: number, heightM?: number) => void;
  // 壁メッシュ→SceneRoot へ壁上カーソルを上げる（wallspot 配置時のみ使用）。
  onWallHover?: (hit: WallHover) => void;
};
export const PlacementContext = createContext<PlacementCtx>({ pendingAdd: null });
export const usePlacement = () => useContext(PlacementContext);
export const isWallPending = (pendingAdd: string | null) =>
  pendingAdd === "door" || isWallLightAddKind(pendingAdd) || (pendingAdd?.startsWith("window") ?? false);
