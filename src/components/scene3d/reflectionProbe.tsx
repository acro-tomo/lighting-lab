import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { useProjectStore } from "../../store/projectStore";
import { usePathTraced } from "./contexts";
import { computeFloorBounds } from "./roomGeometry";

// 編集ビュー(ラスター)用の反射プローブ。scene.environment が無いと TV・ガラス・金属が
// 点光源のハイライトしか映らず質感が死ぬため、部屋内部から低解像度キューブを焼いて
// PMREM 経由の IBL として与える。常駐パストレ(リアル)時は liveTracer.ts が
// scene.environment(Sky/夜)を所有するので、このプローブは完全に無効化する(WYSIWYG)。

// 環境反射の強さ。直接光の見え方(光だまり・影)を支配しない控えめな値から調整する。
export const EDIT_ENVIRONMENT_INTENSITY = 0.5;
// 反射用途なので低解像度で十分。HDR(HalfFloat)で焼き、輝度のクランプを避ける。
const PROBE_RESOLUTION = 128;
// 目線近くの家具・TV面が拾う反射を優先し、床から1.2mに置く。
const PROBE_HEIGHT_M = 1.2;
const REBAKE_DEBOUNCE_MS = 500;

export const ReflectionProbe = () => {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const pathTraced = usePathTraced();

  useEffect(() => {
    // パストレ中は liveTracer が environment を差し替え/復元するため一切触らない。
    // pathTraced が dep なので、パストレ開始のコミットでは liveTracer のマウント effect
    // より先に本 cleanup が走り environment=null に戻す→競合しない。
    if (pathTraced) return;

    const cubeTarget = new THREE.WebGLCubeRenderTarget(PROBE_RESOLUTION, {
      type: THREE.HalfFloatType
    });
    const cubeCamera = new THREE.CubeCamera(0.05, 50, cubeTarget);
    const pmrem = new THREE.PMREMGenerator(gl);
    let envRT: THREE.WebGLRenderTarget | null = null;
    let bakeTimer = 0;

    const bake = () => {
      const project = useProjectStore.getState().project;
      // 表示中(活性階)の壁の外接矩形中心にプローブを置く。壁が無ければ room 寸法へフォールバック。
      const activeFloor = project.activeFloor ?? 1;
      const walls = project.walls.filter((w) => (w.floor ?? 1) === activeFloor);
      const bounds = computeFloorBounds({ ...project, walls });
      cubeCamera.position.set(
        bounds.centerX,
        (project.room.floorLevelM ?? 0) + PROBE_HEIGHT_M,
        bounds.centerZ
      );

      // 自身の environment を映し込むと再ベイクのたびに明るさが累積するため、焼く間は外す。
      const prevEnv = scene.environment;
      scene.environment = null;
      // IBL は線形のシーン参照値で保持する(skyEnvironment.ts と同パターン)。
      const prevToneMapping = gl.toneMapping;
      gl.toneMapping = THREE.NoToneMapping;
      scene.updateMatrixWorld(true);
      cubeCamera.update(gl, scene);
      gl.toneMapping = prevToneMapping;
      scene.environment = prevEnv;

      const nextRT = pmrem.fromCubemap(cubeTarget.texture);
      const prevRT = envRT;
      envRT = nextRT;
      scene.environment = nextRT.texture;
      scene.environmentIntensity = EDIT_ENVIRONMENT_INTENSITY;
      prevRT?.dispose();
    };

    const schedule = () => {
      window.clearTimeout(bakeTimer);
      bakeTimer = window.setTimeout(bake, REBAKE_DEBOUNCE_MS);
    };

    // R3Fの子メッシュが全てコミットされてから初回ベイク(1フレーム待つ。liveTracer と同じ理由)。
    const raf = requestAnimationFrame(bake);
    // プロジェクト編集(家具移動・材質変更など)でデバウンス再ベイク。毎フレーム更新はしない。
    const unsubscribe = useProjectStore.subscribe((state, prev) => {
      if (state.project !== prev.project) schedule();
    });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(bakeTimer);
      unsubscribe();
      // 自分が設定した environment だけ外す(他所有者のものは触らない)。
      if (envRT && scene.environment === envRT.texture) {
        scene.environment = null;
        scene.environmentIntensity = 1;
      }
      envRT?.dispose();
      pmrem.dispose();
      cubeTarget.dispose();
    };
  }, [gl, scene, pathTraced]);

  return null;
};
