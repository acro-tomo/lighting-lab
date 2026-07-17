export type ObjectKind =
  | "wall"
  | "window"
  | "opening"
  | "furniture"
  | "light"
  | "void"
  | "ceilingZone"
  | "floorZone"
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

// コピー＆ペースト用クリップボード（非永続・undo対象外）。
// data は対象オブジェクトのディープコピー。kind ごとに具体型は異なるため unknown 保持。
export type Clipboard = {
  kind: ObjectKind;
  data: unknown;
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

// 階タグ。undefined = 1階（後方互換：既存JSONは全て1階扱い）。
export type FloorTag = 1 | 2;

export type WallSegment = {
  id: string;
  name: string;
  start: Vec2M;
  end: Vec2M;
  thicknessM: number;
  heightM: number;
  materialId: string;
  /**
   * start→end へ歩いたとき室内側が左/右のどちらか。壁の厚みをその側へ寄せ、
   * 内側の面を芯線に合わせる指定。undefined は従来の中心振り分け(対称)扱い。
   */
  innerSide?: "left" | "right";
  /**
   * 壁種別。undefined = "wall"（通常の実壁・フル高さ＝後方互換）。
   * "wall": 通常の壁。"half": 腰壁（低い実壁、高さは heightM）。
   * "railing": 手すり（支柱＋笠木の抜けた手すり、高さは heightM）。
   */
  kind?: "wall" | "half" | "railing";
  /** 所属階。undefined = 1階。 */
  floor?: FloorTag;
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
  /** 所属階。undefined = 1階。 */
  floor?: FloorTag;
};

export type VoidSide = "north" | "south" | "west" | "east";

export type VoidArea = {
  id: string;
  name: string;
  center: Vec2M;
  size: Vec2M;
  /** 吹き抜け内周で壁を作らない辺。undefined = 4辺すべて壁あり。 */
  openSides?: VoidSide[];
  /** 所属階。undefined = 1階。 */
  floor?: FloorTag;
};

// 下げ天井: 指定した矩形領域だけ天井を dropM 分だけ下げる（折り上げの逆）。
export type CeilingZone = {
  id: string;
  name: string;
  center: Vec2M;
  size: Vec2M;
  /** 天井からの下がり量(m)。0.2〜0.4 が一般的。 */
  dropM: number;
  /** 所属階。undefined = 1階。 */
  floor?: FloorTag;
};

// 下げ床 / 土間: 指定した矩形領域だけ床を dropM 分だけ下げる（玄関土間・上がり框の段差）。
export type FloorZone = {
  id: string;
  name: string;
  center: Vec2M;
  size: Vec2M;
  /** 床からの下がり量(m)。玄関土間の一段下げは 0.15 程度。 */
  dropM: number;
  /** 所属階。undefined = 1階。 */
  floor?: FloorTag;
};

export type FurnitureType =
  | "roundTable"
  | "rectTable"
  | "chair"
  | "sofa"
  | "bed"
  | "kitchen"
  | "cupboard"
  | "fridge"
  | "tv"
  | "shelf"
  | "counter"
  | "rug"
  | "stair"
  | "washer"
  | "washstand"
  | "toilet"
  | "bathtub"
  | "desk"
  | "shoeCabinet"
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
  /** 所属階。undefined = 1階。 */
  floor?: FloorTag;
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
  /** 所属階。undefined = 1階。 */
  floor?: FloorTag;
};

// 唯一のカメラ＝編集視点かつ最終レンダーPNGの既定視点。
// 旧 CameraView から id/name を除いた形。
export type ProjectCamera = {
  position: Vec3M;
  target: Vec3M;
  fov: number;
  exposure: number;
  /** 最終レンダーPNGの横解像度(px)。 */
  resolutionWidth: number;
};

export type FloorPlanBackground = {
  dataUrl: string;
  fileName: string;
  kind: "image" | "pdf";
  /** 1階基準などで仮合わせ済みだが、ユーザー確認がまだ必要な背景。 */
  alignmentPending?: boolean;
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

export type InterFloorStructure = {
  kind: "wood" | "rc" | "custom";
  thicknessM: number;
};

export type Project = {
  id: string;
  name: string;
  /** レンダー測光キャリブレーションの世代。未設定は旧方式として読み込む。 */
  renderCalibrationVersion?: number;
  room: {
    widthM: number;
    depthM: number;
    ceilingHeightM: number;
    /**
     * 室内の仕上げ床面が地面(Y=0)から何m上がっているか。
     * 下げ床/土間(FloorZone)はこの floorLevelM から dropM 下げる。
     * undefined/未設定は 0(従来通り)。
     */
    floorLevelM?: number;
    /** 階間床の表示用設定。未設定は厚さ 0m として扱う（後方互換）。 */
    interFloorStructure?: InterFloorStructure;
  };
  materials: MaterialPreset[];
  walls: WallSegment[];
  windows: WindowOpening[];
  voids: VoidArea[];
  ceilingZones?: CeilingZone[];
  floorZones?: FloorZone[];
  furniture: FurnitureItem[];
  lights: LightFixture[];
  /** 編集視点かつ最終レンダーの既定視点。 */
  camera: ProjectCamera;
  /** 1階の間取り図背景。後方互換：旧JSONの backgroundPlan は1階背景としてそのまま有効。 */
  backgroundPlan?: FloorPlanBackground;
  /** 2階の間取り図背景。undefined = 2階背景なし。 */
  backgroundPlan2?: FloorPlanBackground;
  daylight?: Daylight;
  /** 天井の表示ON/OFF。undefined は true 扱い(既定で天井表示)。 */
  showCeiling?: boolean;
  /** 編集中の活性階。undefined = 1階。 */
  activeFloor?: FloorTag;
};
