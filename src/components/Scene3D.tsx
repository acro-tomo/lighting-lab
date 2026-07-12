import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { TouchDragGuardProvider } from "./scene3d/contexts";
import { SceneRoot } from "./scene3d/sceneRoot";
import type { Scene3DProps } from "./scene3d/types";

// 既存の公開APIを維持する再export（App/HeaderBar 等の import パスを壊さない）。
export type { EditMode, LiveTraceStatus, ViewMode } from "./scene3d/types";
export { skyColorForAltitude } from "./scene3d/daylight";

export const Scene3D = (props: Scene3DProps) => (
  <Canvas
    shadows
    dpr={[1, 1.6]}
    camera={{ position: [4.2, 3.4, 4.8], fov: 56, near: 0.05, far: 80 }}
    gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
    onCreated={({ gl }) => {
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 0.9;
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }}
  >
    <TouchDragGuardProvider>
      <SceneRoot {...props} />
    </TouchDragGuardProvider>
  </Canvas>
);
