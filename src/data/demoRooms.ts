// ?demo=<key> で開ける部屋のカタログ。実体は public/demo/rooms/*.json で、
// バンドルには含めずに読込時 fetch する（部屋を増やしても初期ロードが重くならない）。
export type DemoRoom = {
  /** URL の ?demo= に渡す値。 */
  key: string;
  /** 共有時の説明用。プロジェクト名は JSON 側が持つ。 */
  label: string;
  /** public/ からの相対パス。 */
  file: string;
};

export const demoRooms: DemoRoom[] = [
  {
    key: "machiya",
    label: "京町家リノベ｜通り庭と火袋の家",
    file: "demo/rooms/jp-machiya-toriniwa.json"
  },
  {
    key: "hiraya",
    label: "和モダンの平屋｜縁側と建築化照明の家",
    file: "demo/rooms/jp-hiraya-engawa.json"
  },
  {
    key: "skipfloor",
    label: "都市の狭小3階建て｜スキップフロアのLDK",
    file: "demo/rooms/jp-skipfloor-tokyo.json"
  },
  {
    key: "copenhagen",
    label: "コペンハーゲンの住戸｜ダウンライトを使わない夜",
    file: "demo/rooms/dk-copenhagen-apartment.json"
  },
  {
    key: "mediterranean",
    label: "南欧のアーチの家｜壁を照らす夜",
    file: "demo/rooms/es-mediterranean-arch.json"
  },
  {
    key: "loft",
    label: "ブルックリンのロフト｜天井4.2mを照らす",
    file: "demo/rooms/us-brooklyn-loft.json"
  }
];

export const findDemoRoom = (key: string | null): DemoRoom | undefined =>
  key ? demoRooms.find((room) => room.key === key) : undefined;
