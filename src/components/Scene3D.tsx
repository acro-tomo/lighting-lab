import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { isLuxLabEnabled } from "../utils/luxLab";
import { TouchDragGuardProvider } from "./scene3d/contexts";
import { LuxPanel } from "./scene3d/luxPanel";
import { SceneRoot } from "./scene3d/sceneRoot";
import type { Scene3DProps } from "./scene3d/types";

// 既存の公開APIを維持する再export（App/HeaderBar 等の import パスを壊さない）。
export type { EditMode, LiveTraceStatus, ViewMode } from "./scene3d/types";
export { skyColorForAltitude } from "./scene3d/daylight";

export const Scene3D = (props: Scene3DProps) => (
  <>
    <Canvas
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [4.2, 3.4, 4.8], fov: 56, near: 0.05, far: 80 }}
      gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        // Khronos PBR Neutral: ACES と違い壁・床の色相が転ばない（色再現優先）。
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = props.project.camera.exposure;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
    >
      <TouchDragGuardProvider>
        <SceneRoot {...props} />
      </TouchDragGuardProvider>
    </Canvas>
    {/* 照度ヒートマップ(?lux=1 隠し機能)のHUD。親 .scene-stage (position:relative) 内に
        絶対配置する DOM overlay。ゲートOFF時は一切レンダリングしない。 */}
    {isLuxLabEnabled() && <LuxPanel />}
  </>
);
