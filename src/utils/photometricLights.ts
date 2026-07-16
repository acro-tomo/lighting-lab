import type { PhotometricLight } from "../../photometric/src/photometry/illuminance";
import {
  isotropicDistribution,
  threeSpotDistribution
} from "../../photometric/src/photometry/distribution";
import type { Vec3 } from "../../photometric/src/core/types";
import { vec3 } from "../../photometric/src/core/vec3";
import type { LightFixture } from "../types";
import {
  bracketRoomwardOffset,
  lumensToPhysicalPower,
  TAPE_LIGHT_EMIT_OFFSET_M,
  tapeLightOrientation
} from "./lighting";

// Project の照明を測光コア(photometric/)の PhotometricLight へ変換する。
// 幾何・光束は編集ビューのラスター光源(scene3d/fixtureBody.tsx PhysicalLight)と
// 一致させ、ヒートマップが「編集ビューで見えている光」の照度になるようにする。
//
// 座標系の注意:
// - 器具メッシュは <group position={[0, floorLevelM, 0]}> 内にあるため、
//   光源ワールド位置 = fixture.position + (0, floorLevelM, 0) + ローカルオフセット。
// - 一方 PhysicalLight の spot target は scene 直下に add され floorLevelM が
//   乗らない。光軸もそれに合わせ target 生値から計算する（WYSIWYG優先）。
//
// 調光・ON/OFF は lumensToPhysicalPower が織り込むので dimming は常に 1
// （二重適用しない）。

// fixtureBody.tsx PhysicalLight と同じ「光源を器具本体より下へ出す」量。
const SPOTLIGHT_DROP_M = 0.2;
const DOWNLIGHT_DROP_M = 0.05;
const PENDANT_DROP_M = 0.08;
// fixtureBody.tsx のペンダント spotLight: angle=degToRad(70)（半角）→ 全角140°。
const PENDANT_FULL_ANGLE_DEG = 140;
// fixtureBody.tsx のブラケット点光源の室内側オフセット量。
const BRACKET_ROOMWARD_OFFSET_M = 0.16;
// テープ(面光源)の等方点光源近似のサンプル点数。
const TAPE_SAMPLE_COUNT = 3;

const DOWN = vec3(0, -1, 0);

const aimAxis = (from: Vec3, to: { x: number; y: number; z: number }): Vec3 => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return DOWN;
  return vec3(dx / len, dy / len, dz / len);
};

// beamDistribution は (0,180] 以外で throw する。境界のUI入力に備えてクランプする。
const clampFullAngle = (deg: number): number => Math.min(180, Math.max(1, deg));

export const projectLightsToPhotometric = (
  lights: readonly LightFixture[],
  floorLevelM: number
): PhotometricLight[] => {
  const result: PhotometricLight[] = [];
  for (const fixture of lights) {
    const power = lumensToPhysicalPower(fixture);
    if (power <= 0) continue;
    const base = vec3(
      fixture.position.x,
      fixture.position.y + floorLevelM,
      fixture.position.z
    );
    // PhysicalLight の target 既定値と同一（scene 直下なので floorLevelM を乗せない）。
    const target = fixture.target ?? {
      x: fixture.position.x,
      y: 0.1,
      z: fixture.position.z
    };

    if (fixture.type === "tape") {
      // RectAreaLight を長さ方向 3 点の等方点光源で近似する。バー形状は
      // FixtureMesh グループが無回転なのでワールドX軸沿い。発光面と同じく
      // 照射方向へ TAPE_LIGHT_EMIT_OFFSET_M 浮かせて自遮蔽を避ける。
      const { direction } = tapeLightOrientation(fixture);
      const lengthM = fixture.lengthM ?? 1.2;
      const distribution = isotropicDistribution(power / TAPE_SAMPLE_COUNT);
      for (let i = 0; i < TAPE_SAMPLE_COUNT; i++) {
        const t = (i - (TAPE_SAMPLE_COUNT - 1) / 2) / TAPE_SAMPLE_COUNT;
        result.push({
          position: vec3(
            base.x + lengthM * t + direction.x * TAPE_LIGHT_EMIT_OFFSET_M,
            base.y + direction.y * TAPE_LIGHT_EMIT_OFFSET_M,
            base.z + direction.z * TAPE_LIGHT_EMIT_OFFSET_M
          ),
          axis: vec3(direction.x, direction.y, direction.z),
          distribution,
          dimming: 1
        });
      }
      continue;
    }

    if (fixture.type === "bracket") {
      const off = bracketRoomwardOffset(fixture, BRACKET_ROOMWARD_OFFSET_M);
      result.push({
        position: vec3(base.x + off.x, base.y, base.z + off.z),
        axis: DOWN,
        distribution: isotropicDistribution(power),
        dimming: 1
      });
      continue;
    }

    if (fixture.type === "pendant") {
      const position = vec3(base.x, base.y - PENDANT_DROP_M, base.z);
      result.push({
        position,
        axis: aimAxis(position, target),
        distribution: threeSpotDistribution(power, PENDANT_FULL_ANGLE_DEG, 0.5),
        dimming: 1
      });
      continue;
    }

    // downlight / spotlight 系: spotLight(angle=beamAngleDeg/2) と同じ全角ビーム。
    const drop = fixture.type === "spotlight" ? SPOTLIGHT_DROP_M : DOWNLIGHT_DROP_M;
    const position = vec3(base.x, base.y - drop, base.z);
    result.push({
      position,
      axis: aimAxis(position, target),
      distribution: threeSpotDistribution(
        power,
        clampFullAngle(fixture.beamAngleDeg),
        fixture.penumbra
      ),
      dimming: 1
    });
  }
  return result;
};
