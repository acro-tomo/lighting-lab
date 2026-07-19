import * as THREE from "three";
import { ShapedAreaLight } from "three-gpu-pathtracer";
import type { Project } from "../../types";
import {
  bracketRoomwardOffset,
  colorTemperatureToLinearColor,
  lumensToPhysicalPower,
  lumensToSpotlightPeakCandela,
  TAPE_LIGHT_EMIT_OFFSET_M,
  TAPE_LIGHT_HEIGHT_M,
  tapeLightOrientation
} from "../../utils/lighting";
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
    const lumens = lumensToPhysicalPower(fixture);
    if (lumens <= 0) return;
    const color = colorTemperatureToLinearColor(fixture.colorTemperatureK);
    const targetPosition = fixture.target ?? { x: fixture.position.x, y: 0.1, z: fixture.position.z };

    if (fixture.type === "tape") {
      const emissive = new THREE.MeshStandardMaterial({
        color: "#fff3d0",
        emissive: color,
        emissiveIntensity: 0.8,
        roughness: 0.48
      });
      addBox(scene, [fixture.lengthM ?? 1.2, 0.035, 0.018], [fixture.position.x, fixture.position.y, fixture.position.z], emissive, 0, "fixture", debugMode);
      // NEE対応の面光源(RectAreaLight互換)。編集ラスター(fixtureBody)の RectAreaLight と
      // 同寸法・同power・同じ向きで WYSIWYG を保つ。バーに遮られないよう照射方向へ少し出す。
      const { direction, quaternion } = tapeLightOrientation(fixture);
      const light = new ShapedAreaLight(color, 1, fixture.lengthM ?? 1.2, TAPE_LIGHT_HEIGHT_M);
      light.power = lumens;
      light.quaternion.copy(quaternion);
      light.position.set(
        fixture.position.x + direction.x * TAPE_LIGHT_EMIT_OFFSET_M,
        fixture.position.y + direction.y * TAPE_LIGHT_EMIT_OFFSET_M,
        fixture.position.z + direction.z * TAPE_LIGHT_EMIT_OFFSET_M
      );
      scene.add(light);
      return;
    }

    if (fixture.type === "bracket") {
      // 壁に密着した点光源は逆二乗で至近の壁を白飛びさせるため、照射方向(室内側)へ
      // ~0.16m 離す（編集ラスターと同じ式で WYSIWYG を保つ）。
      const off = bracketRoomwardOffset(fixture, 0.16);
      const light = new THREE.PointLight(color, 1, 0, 2);
      light.power = lumens;
      light.position.set(
        fixture.position.x + off.x,
        fixture.position.y,
        fixture.position.z + off.z
      );
      scene.add(light);
      return;
    }

    if (fixture.type === "pendant") {
      const cordLength = fixture.cordLengthM ?? 0.8;
      const fixtureMaterial = (color: string, roughness: number, metalness = 0) =>
        diagnosticMaterial(
          "fixture",
          debugMode,
          new THREE.MeshStandardMaterial({ color, roughness, metalness })
        );
      const addPendantMesh = (geometry: THREE.BufferGeometry, y: number, material: THREE.Material) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(fixture.position.x, fixture.position.y + y, fixture.position.z);
        scene.add(mesh);
      };

      if (fixture.model === "pendant-globe") {
        addPendantMesh(
          new THREE.CylinderGeometry(0.006, 0.006, cordLength, 10),
          cordLength / 2,
          fixtureMaterial("#11100f", 0.5, 0.55)
        );
        addPendantMesh(
          new THREE.CylinderGeometry(0.032, 0.026, 0.07, 24),
          0.137,
          fixtureMaterial("#171513", 0.35, 0.62)
        );
        addPendantMesh(
          new THREE.SphereGeometry(0.145, 40, 24),
          0,
          diagnosticMaterial(
            "fixture",
            debugMode,
            new THREE.MeshPhysicalMaterial({
              color: "#f2d6a3",
              roughness: 0.16,
              metalness: 0,
              transmission: 0.72,
              thickness: 0.025,
              ior: 1.42,
              attenuationColor: "#f4bd72",
              attenuationDistance: 0.8
            })
          )
        );
        const emitter = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 28, 18),
          diagnosticMaterial(
            "fixture",
            debugMode,
            new THREE.MeshStandardMaterial({
              color: "#fff1d0",
              emissive: color,
              emissiveIntensity: 1.1,
              roughness: 0.28
            })
          )
        );
        emitter.position.set(fixture.position.x, fixture.position.y - 0.01, fixture.position.z);
        scene.add(emitter);

        const light = new THREE.PointLight(color, 1, 0, 2);
        light.power = lumens;
        light.position.copy(emitter.position);
        scene.add(light);
        return;
      }

      addPendantMesh(
        new THREE.CylinderGeometry(0.012, 0.012, cordLength, 12),
        cordLength / 2,
        fixtureMaterial("#111111", 0.5, 0.6)
      );
      addPendantMesh(
        new THREE.ConeGeometry(0.24, 0.22, 48, 1, true),
        0,
        diagnosticMaterial(
          "fixture",
          debugMode,
          new THREE.MeshStandardMaterial({
            color: "#10100f",
            roughness: 0.36,
            metalness: 0.7,
            side: THREE.DoubleSide
          })
        )
      );
      addPendantMesh(
        new THREE.CylinderGeometry(0.072, 0.072, 0.012, 32),
        0.11,
        fixtureMaterial("#10100f", 0.4, 0.5)
      );
      const emitter = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 24, 16),
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

      // 下方配光のスポット(≈140°)。全方向 pointLight だと天井まで照るのを防ぐ。
      const light = new THREE.SpotLight(color, 1, 0, THREE.MathUtils.degToRad(70), 0.5, 2);
      light.intensity = lumensToSpotlightPeakCandela(lumens, 140, 0.5);
      light.position.set(fixture.position.x, fixture.position.y - 0.08, fixture.position.z);
      light.castShadow = fixture.castsShadow;
      light.target.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
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
    light.intensity = lumensToSpotlightPeakCandela(
      lumens,
      fixture.beamAngleDeg,
      fixture.penumbra
    );
    // 編集ラスターと同じく、器具本体の遮蔽を避ける最小量だけ下げる。
    const lightDrop = fixture.type === "spotlight" ? 0.2 : 0.05;
    light.position.set(
      fixture.position.x,
      fixture.position.y - lightDrop,
      fixture.position.z
    );
    light.castShadow = fixture.castsShadow;
    light.target.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
    light.target.updateMatrixWorld(true);
    scene.add(light);
    scene.add(light.target);
  });
};
