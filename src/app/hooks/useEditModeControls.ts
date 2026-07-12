import { useCallback, useEffect, useState } from "react";
import type { EditMode } from "../../components/EditToolbar";
import type { Selection } from "../../types";

export type MobileView = "plan" | "scene";

// 編集モード（選択/壁/配置待ち）・スマホ表示切替・フォーカス表示のUI状態と操作をまとめる。
export const useEditModeControls = ({
  selection,
  select,
  deleteSelection,
  setNotice
}: {
  selection: Selection;
  select: (next: Selection) => void;
  deleteSelection: (selection: NonNullable<Selection>) => void;
  setNotice: (notice: string) => void;
}) => {
  const [mode, setMode] = useState<EditMode>("select");
  const [planEditMode, setPlanEditMode] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [focusViewport, setFocusViewport] = useState(false);
  const [focusPlan, setFocusPlan] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("plan");
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  // パネル開閉で3Dコンテナ幅が変わるため、R3Fに再計測させる。
  useEffect(() => {
    const handle = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
    return () => window.clearTimeout(handle);
  }, [focusViewport, focusPlan, mobileView]);

  const openMobileView = useCallback((view: MobileView) => {
    setMobileView(view);
    setMobileSettingsOpen(false);
    setFocusPlan(false);
    setFocusViewport(false);
  }, []);

  const handleSelect = useCallback((next: Selection) => {
    if (next?.kind === "wall" && !planEditMode) return;
    select(next);
  }, [planEditMode, select]);

  const handleEditModeChange = useCallback((next: EditMode) => {
    setMode(next);
    setPendingAdd(null);
    if (next === "wall") {
      setPlanEditMode(true);
      openMobileView("plan");
    }
  }, [openMobileView]);

  const handlePlanEditModeChange = useCallback((enabled: boolean) => {
    setPlanEditMode(enabled);
    setPendingAdd(null);
    setMode("select");
    if (enabled) {
      openMobileView("plan");
      setNotice("間取り編集を開始しました。壁の選択・移動・削除ができます。");
    } else {
      if (selection?.kind === "wall") select(null);
      setNotice("間取り編集を終了しました。壁は誤操作防止のため選択できません。");
    }
  }, [openMobileView, select, selection, setNotice]);

  useEffect(() => {
    if (planEditMode) return;
    if (mode === "wall") setMode("select");
    if (selection?.kind === "wall") select(null);
  }, [mode, planEditMode, select, selection]);

  const canDeleteSelection = !!selection && (selection.kind !== "wall" || planEditMode);

  const handleMobileClear = useCallback(() => {
    if (pendingAdd) {
      setPendingAdd(null);
      setNotice("配置を終了しました。");
      return;
    }
    if (selection) {
      select(null);
      setNotice("選択を解除しました。");
    }
  }, [pendingAdd, select, selection, setNotice]);

  const handleMobileDelete = useCallback(() => {
    if (!selection || (selection.kind === "wall" && !planEditMode)) return;
    deleteSelection(selection);
    setNotice("選択中の要素を削除しました。");
  }, [deleteSelection, planEditMode, selection, setNotice]);

  return {
    mode,
    setMode,
    planEditMode,
    pendingAdd,
    setPendingAdd,
    focusViewport,
    setFocusViewport,
    focusPlan,
    setFocusPlan,
    mobileView,
    mobileSettingsOpen,
    setMobileSettingsOpen,
    openMobileView,
    handleSelect,
    handleEditModeChange,
    handlePlanEditModeChange,
    canDeleteSelection,
    handleMobileClear,
    handleMobileDelete
  };
};
