import { useEffect, useRef } from "react";
import { demoProject } from "../../data/demoProject";
import { projectSchema } from "../../schema/projectSchema";
import { loadProjectFromIndexedDb, saveProjectToIndexedDb } from "../../storage/projectStorage";
import type { CompareShot, Project } from "../../types";
import { cloneProject } from "../../utils/units";
import { migrateLoadedProject } from "../appUtils";
import { useI18n } from "../../i18n";

// 初回読込（共有デモ or IndexedDB復元）とデバウンス自動保存をまとめて扱う。
export const useProjectPersistence = (
  project: Project,
  setProject: (project: Project) => void,
  setCompareShots: (shots: CompareShot[]) => void,
  setNotice: (notice: string) => void
) => {
  const { t } = useI18n();
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;

    // ?demo=1 は配布用デモ、?demo=2 は標準デモを開く。
    // 読込後はクエリを消し、リロードでの再上書きと透かしURLの汚れを防ぐ。
    const url = new URL(window.location.href);
    const demoVersion = url.searchParams.get("demo");
    const demoRequested = demoVersion !== null;
    if (demoRequested) {
      url.searchParams.delete("demo");
      window.history.replaceState(null, "", url);
    }

    const loadRequestedDemo = async () => {
      if (demoVersion === "2") {
        setProject(cloneProject(demoProject));
        setCompareShots([]);
        setNotice(t("デモの間取りを読み込みました。照明や家具を動かして夜の見え方を試せます。"));
        return;
      }
      const response = await fetch(`${import.meta.env.BASE_URL}demo/share-demo-project.json`);
      if (!response.ok) throw new Error(`demo fetch failed: ${response.status}`);
      const parsed = await migrateLoadedProject(
        projectSchema.parse(await response.json()) as Project & { compareShots?: CompareShot[] }
      );
      setProject(parsed);
      setCompareShots(Array.isArray(parsed.compareShots) ? parsed.compareShots : []);
      setNotice(t("デモの間取りを読み込みました。照明や家具を動かして夜の見え方を試せます。"));
    };

    loadProjectFromIndexedDb()
      .catch(() => {
        setNotice(t("自動保存データを読めませんでした。デモプロジェクトで起動しています。"));
        return undefined;
      })
      .then(async (savedProject) => {
        if (demoRequested) {
          // 自動保存が既にある場合は、直後の自動保存でデモに上書きされるため必ず確認する。
          const useDemo =
            !savedProject ||
            window.confirm(
              t("共有リンクのデモ間取りを読み込みますか？\nOK: デモを開く（作業中のプロジェクトはデモで上書き保存されます）\nキャンセル: 前回の続きを開く")
            );
          if (useDemo) {
            try {
              await loadRequestedDemo();
              return;
            } catch {
              setNotice(t("デモデータを読み込めませんでした。通常どおり起動します。"));
            }
          }
        }
        if (savedProject) {
          // スキーマ検証は loadProjectFromIndexedDb 内で済んでいる（二重検証しない）。
          const parsed = await migrateLoadedProject(
            savedProject as Project & { compareShots?: CompareShot[] }
          );
          setProject(parsed);
          if (Array.isArray(parsed.compareShots)) {
            setCompareShots(parsed.compareShots);
          }
          setNotice(t("前回のプロジェクトをIndexedDBから復元しました。"));
        }
      });
  }, [setCompareShots, setNotice, setProject, t]);

  useEffect(() => {
    const flush = () =>
      saveProjectToIndexedDb(project).catch(() => {
        setNotice(t("IndexedDBへの自動保存に失敗しました。JSON保存を使ってください。"));
      });
    const handle = window.setTimeout(flush, 500);
    // 配置直後にすぐリロード/タブを閉じてもデバウンス前の変更を失わないよう、
    // 離脱(非表示/pagehide)時は即時に最新プロジェクト全体を保存する。
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearTimeout(handle);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [project, setNotice, t]);
};
