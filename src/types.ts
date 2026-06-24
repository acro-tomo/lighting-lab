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
  /** 壁紙等のテクスチャ画像（dataURL）。 */
  textureDataUrl?: string;
  /** 画像1枚が実空間で覆うサイズ(m)。リピート数は面の寸法から自動計算する。 */
  textureSizeM?: { w: number; h: number };
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
  /** "window"=窓(枠+ガラス) / "opening"=開口 / "door"=扉(ドア板)。未指定はhasGlassから判定。 */
  style?: "window" | "opening" | "door";
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
  /** 器具カタログのモデルID（配光・ビーム角・グレア処理を固定する）。 */
  model?: string;
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
  /**
   * 背景画像をワールド座標(m)へ正しい縮尺で重ねるための配置情報。
   * 縮尺ツールで実距離を確定したときに設定される。未設定の旧JSONは
   * 従来どおりキャンバスにフィット表示する（後方互換）。
   */
  placement?: {
    /** 画像ピクセル(0,0)が対応するワールド座標 X(m) */
    originXM: number;
    /** 画像ピクセル(0,0)が対応するワールド座標 Z(m) */
    originZM: number;
    /** 画像1ピクセルあたりのワールド距離(m) */
    metersPerPixel: number;
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

export type Daylight = {
  enabled: boolean;        // 日光ON/OFF
  month: number;           // 1-12
  day: number;             // 1-31
  hour: number;            // 0-23.99（小数で分も表現。ローカル太陽時として扱う）
  northOffsetDeg: number;  // 建物の向き。真北が -Z 方向(=北/TV壁側)からY軸まわり時計回りに何度ずれているか
  latitudeDeg: number;     // 緯度。既定 35（東京付近）
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
  daylight?: Daylight;
};
