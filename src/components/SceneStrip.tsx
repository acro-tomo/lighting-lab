import type { CompareShot, Project } from "../types";
import { useProjectStore } from "../store/projectStore";

type SceneStripProps = {
  project: Project;
  compareShots: CompareShot[];
  compareOpen: boolean;
  onDuplicateScene: () => void;
  onRenameScene: () => void;
  onSaveCameraView: () => void;
};

export const SceneStrip = ({
  project,
  compareShots,
  compareOpen,
  onDuplicateScene,
  onRenameScene,
  onSaveCameraView
}: SceneStripProps) => {
  const setActiveScene = useProjectStore((state) => state.setActiveScene);
  const setActiveCameraView = useProjectStore((state) => state.setActiveCameraView);
  const removeCompareShot = useProjectStore((state) => state.removeCompareShot);

  return (
    <footer className="scene-strip">
      <section>
        <p className="eyebrow">Lighting Scene</p>
        <div className="segmented">
          {project.lightingScenes.map((scene) => (
            <button
              key={scene.id}
              className={scene.id === project.activeSceneId ? "is-active" : ""}
              onClick={() => setActiveScene(scene.id)}
            >
              <span>{scene.name}</span>
              <small>{scene.description}</small>
            </button>
          ))}
        </div>
        <div className="mini-actions">
          <button onClick={onDuplicateScene}>シーン複製</button>
          <button onClick={onRenameScene}>名称変更</button>
        </div>
      </section>
      <section>
        <p className="eyebrow">Camera View</p>
        <div className="camera-tabs">
          {project.cameraViews.map((view) => (
            <button
              key={view.id}
              className={view.id === project.activeCameraViewId ? "is-active" : ""}
              onClick={() => setActiveCameraView(view.id)}
            >
              {view.name}
            </button>
          ))}
        </div>
        <div className="mini-actions">
          <button onClick={onSaveCameraView}>現在視点を保存</button>
        </div>
      </section>
      {compareOpen && (
        <section className="compare-drawer">
          <p className="eyebrow">Compare</p>
          {compareShots.length === 0 ? (
            <p className="muted">「レンダリング開始」で現在の固定カメラ・固定露出の画像を比較一覧へ保存します。</p>
          ) : (
            <div className="compare-grid">
              {compareShots.map((shot) => (
                <article key={shot.id} className="compare-shot">
                  <img src={shot.dataUrl} alt={shot.name} />
                  <div>
                    <strong>{shot.name}</strong>
                    <span>{shot.cameraViewName} / {shot.lightingSceneName}</span>
                    <span>{shot.renderer === "pathtraced" ? `Path traced ${shot.samples ?? 0} samples` : "Realtime"}</span>
                    <span>{new Date(shot.createdAt).toLocaleString("ja-JP")}</span>
                  </div>
                  <button onClick={() => removeCompareShot(shot.id)}>削除</button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </footer>
  );
};
