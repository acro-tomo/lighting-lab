export type ObjectKind =
  | "wall"
  | "window"
  | "opening"
  | "furniture"
  | "light"
  | "void"
  | "material";

export type Vec2M = {
  x: number;
  z: number;
};

export type Vec3M = {
  x: number;
  y: number;
  z: number;
};

export type RotationDeg = {
  x: number;
  y: number;
  z: number;
};

export type Selection = {
  kind: ObjectKind;
  id: string;
} | null;

export type MaterialPreset = {
  id: string;
  name: string;
  baseColor: string;
  roughness: number;
  metalness: number;
  emissiveColor: string;
  emissiveIntensity: number;
};

export type WallSegment = {
  id: string;
  name: string;
  start: Vec2M;
  end: Vec2M;
  thicknessM: number;
  heightM: number;
  materialId: string;
};

export type WindowOpening = {
  id: string;
  name: string;
  wallId: string;
  centerRatio: number;
  widthM: number;
  heightM: number;
  sillHeightM: number;
  hasGlass: boolean;
};

export type VoidArea = {
  id: string;
  name: string;
  center: Vec2M;
  size: Vec2M;
};

export type FurnitureType =
  | "roundTable"
  | "rectTable"
  | "chair"
  | "sofa"
  | "kitchen"
  | "cupboard"
  | "tv"
  | "shelf"
  | "counter"
  | "rug"
  | "stair"
  | "box";

export type FurnitureItem = {
  id: string;
  name: string;
  type: FurnitureType;
  position: Vec3M;
  size: Vec3M;
  rotationYDeg: number;
  materialId: string;
  color?: string;
  roughness?: number;
  metalness?: number;
  castsShadow: boolean;
};

export type LightType =
  | "downlight"
  | "spotlight"
  | "pendant"
  | "bracket"
  | "tape";

export type LightFixture = {
  id: string;
  name: string;
  type: LightType;
  position: Vec3M;
  mountHeightM: number;
  rotationDeg: RotationDeg;
  target?: Vec3M;
  lumens: number;
  colorTemperatureK: number;
  dimmer: number;
  enabled: boolean;
  beamAngleDeg: number;
  penumbra: number;
  castsShadow: boolean;
  note: string;
  lengthM?: number;
  cordLengthM?: number;
};

export type SceneLightState = {
  enabled: boolean;
  dimmer: number;
};

export type LightingScene = {
  id: string;
  name: string;
  description: string;
  lightStates: Record<string, SceneLightState>;
};

export type CameraView = {
  id: string;
  name: string;
  position: Vec3M;
  target: Vec3M;
  fov: number;
  exposure: number;
  resolutionWidth: number;
};

export type FloorPlanBackground = {
  dataUrl: string;
  fileName: string;
  kind: "image" | "pdf";
  scale?: {
    pixels: number;
    millimeters: number;
  };
};

export type CompareShot = {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
  cameraViewName: string;
  lightingSceneName: string;
  renderer: "realtime" | "pathtraced";
  samples?: number;
  resolution?: {
    width: number;
    height: number;
  };
};

export type Project = {
  id: string;
  name: string;
  room: {
    widthM: number;
    depthM: number;
    ceilingHeightM: number;
  };
  materials: MaterialPreset[];
  walls: WallSegment[];
  windows: WindowOpening[];
  voids: VoidArea[];
  furniture: FurnitureItem[];
  lights: LightFixture[];
  lightingScenes: LightingScene[];
  cameraViews: CameraView[];
  activeSceneId: string;
  activeCameraViewId: string;
  backgroundPlan?: FloorPlanBackground;
};
