import * as THREE from "three";
import type { Project } from "../../types";
import { bracketRoomwardOffset, colorTemperatureToHex, lumensToPhysicalPower } from "../../utils/lighting";
import { addBox } from "./geometry";
import { diagnosticMaterial, makeMaterial } from "./materials";
import type { RenderDebugMode } from "./qualityPresets";

// 太陽高度から太陽光色を補間する。Scene3D の挙動に合わせる。
export const sunColorForAltitude = (altitudeDeg: number): THREE.Color => {
  const warm = new THREE.Color("#ffd9a8");
  const white = new THREE.Color("#fff4e6");
  return warm.lerp(white, Math.min(1, Math.max(0, altitudeDeg / 35)));
};

// パストレーサは castShadow フラグを参照せず全光源が物理的に影を落とすため、
// 編集ビュー(Scene3D)と異なり本ファイルの光源には castShadow を設定しない。
export const addFixtureLights = (scene: THREE.Scene, project: Project, debugMode: RenderDebugMode) => {
  project.lights.forEach((fixture) => {
    const power = lumensToPhysicalPower(fixture);
    if (power <= 0) return;
    const color = colorTemperatureToHex(fixture.colorTemperatureK);
    const targetPosition = fixture.target ?? { x: fixture.position.x, y: 0.7, z: fixture.position.z };

    if (fixture.type === "tape") {
      const emissive = new THREE.MeshStandardMaterial({
        color: "#fff3d0",
        emissive: color,
        emissiveIntensity: 0.8,
        roughness: 0.48
      });
      addBox(scene, [fixture.lengthM ?? 1.2, 0.035, 0.018], [fixture.position.x, fixture.position.y, fixture.position.z], emissive, 0, "fixture", debugMode);
      const light = new THREE.PointLight(color, 1, 0, 2);
      light.power = power;
      light.position.set(fixture.position.x, fixture.position.y, fixture.position.z);
      scene.add(light);
      return;
    }

    if (fixture.type === "bracket") {
      // 壁に密着した点光源は逆二乗で至近の壁を白飛びさせるため、照射方向(室内側)へ
      // ~0.16m 離す（編集ラスターと同じ式で WYSIWYG を保つ）。
      const off = bracketRoomwardOffset(fixture, 0.16);
      const light = new THREE.PointLight(color, 1, 0, 2);
      light.power = power;
      light.position.set(
        fixture.position.x + off.x,
        fixture.position.y,
        fixture.position.z + off.z
      );
      scene.add(light);
      return;
    }

    if (fixture.type === "pendant") {
      const emitter = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 24, 16),
        diagnosticMaterial(
          "fixture",
          debugMode,
          new THREE.MeshStandardMaterial({
            color: "#fff2d0",
            emissive: color,
            emissiveIntensity: 1.1,
            roughness: 0.36
          })
        )
      );
      emitter.position.set(fixture.position.x, fixture.position.y - 0.08, fixture.position.z);
      scene.add(emitter);

      // シェード上面の不透明キャップ。上方への光漏れ(天井照り)を遮る。
      addBox(
        scene,
        [0.16, 0.012, 0.16],
        [fixture.position.x, fixture.position.y + 0.03, fixture.position.z],
        makeMaterial(undefined, "#15140f"),
        0,
        "fixture",
        debugMode
      );

      // 下方配光のスポット(≈140°)。全方向 pointLight だと天井まで照るのを防ぐ。
      const light = new THREE.SpotLight(color, 1, 0, THREE.MathUtils.degToRad(70), 0.5, 2);
      light.power = power;
      light.position.set(fixture.position.x, fixture.position.y - 0.08, fixture.position.z);
      light.castShadow = fixture.castsShadow;
      light.target.position.set(fixture.position.x, 0.1, fixture.position.z);
      light.target.updateMatrixWorld(true);
      scene.add(light);
      scene.add(light.target);
      return;
    }

    const light = new THREE.SpotLight(
      color,
      1,
      0,
      THREE.MathUtils.degToRad(fixture.beamAngleDeg / 2),
      fixture.penumbra,
      2
    );
    light.power = power;
    light.position.set(fixture.position.x, fixture.position.y, fixture.position.z);
    light.castShadow = fixture.castsShadow;
    light.target.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
    light.target.updateMatrixWorld(true);
    scene.add(light);
    scene.add(light.target);
  });
};
