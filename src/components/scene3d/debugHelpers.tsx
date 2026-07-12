import { useMemo } from "react";
import * as THREE from "three";
import type { LightFixture, Project } from "../../types";
import { wallInwardNormal } from "../../utils/wallGeometry";

export const DebugLine = ({
  from,
  to,
  color
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) => {
  const positions = useMemo(() => new Float32Array([...from, ...to]), [from, to]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} />
    </line>
  );
};

export const LightDirectionLine = ({ fixture }: { fixture: LightFixture }) => {
  if (!fixture.target) return null;
  return (
    <DebugLine
      from={[0, 0, 0]}
      to={[
        fixture.target.x - fixture.position.x,
        fixture.target.y - fixture.position.y,
        fixture.target.z - fixture.position.z
      ]}
      color="#ffd34f"
    />
  );
};

export const NormalDebugHelpers = ({ project }: { project: Project }) => {
  const wallLines = project.walls.map((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const midpoint = new THREE.Vector3((wall.start.x + wall.end.x) / 2, wall.heightM / 2, (wall.start.z + wall.end.z) / 2);
    if (length <= 0.001) return null;
    const inward = wallInwardNormal(wall, { x: 0, z: 0 });
    const normal = new THREE.Vector3(inward.x, 0, inward.z);
    const to = midpoint.clone().add(normal.multiplyScalar(0.45));
    return (
      <DebugLine
        key={wall.id}
        from={[midpoint.x, midpoint.y, midpoint.z]}
        to={[to.x, to.y, to.z]}
        color="#78e08f"
      />
    );
  });

  return (
    <>
      <DebugLine from={[0, 0.03, 0]} to={[0, 0.48, 0]} color="#78e08f" />
      <DebugLine from={[0, project.room.ceilingHeightM - 0.03, 0]} to={[0, project.room.ceilingHeightM - 0.48, 0]} color="#74a8ff" />
      {wallLines}
    </>
  );
};
