import { projectSchema } from "../schema/projectSchema";
import type { CompareShot, Project } from "../types";

// ?demo=<key> で開ける部屋のカタログ。実体は public/demo/rooms/*.json で、
// バンドルには含めずに読込時 fetch する（部屋を増やしても初期ロードが重くならない）。
// サムネイルは public/demo/rooms/thumbs/<key>.jpg（480x360）。
export type DemoRoom = {
  /** URL の ?demo= に渡す値。 */
  key: string;
  /** 選択画面に出す名前。プロジェクト名は JSON 側が持つ。 */
  label: string;
  /** 選択画面の1行説明。寸法と照明手法を入れる。 */
  summary: string;
  /** public/ からの相対パス。 */
  file: string;
  /** public/ からの相対パス。選択画面のサムネイル。 */
  thumb: string;
};

export const demoRooms: DemoRoom[] = [
  {
    key: "machiya",
    label: "京町家リノベ",
    summary: "間口4.2m × 奥行15m / 天井2.35m ・ 和紙ペンダントと行灯だけの夜",
    file: "demo/rooms/jp-machiya-toriniwa.json",
    thumb: "demo/rooms/thumbs/machiya.jpg"
  },
  {
    key: "hiraya",
    label: "和モダンの平屋",
    summary: "12m × 7.2m / 天井2.4m ・ ダウンライト4灯＋折り上げの間接照明",
    file: "demo/rooms/jp-hiraya-engawa.json",
    thumb: "demo/rooms/thumbs/hiraya.jpg"
  },
  {
    key: "skipfloor",
    label: "狭小3階建てのスキップフロア",
    summary: "7.4m × 8.4m / 天井4.4m ・ 低く吊ったペンダントと壁向きスポット",
    file: "demo/rooms/jp-skipfloor-tokyo.json",
    thumb: "demo/rooms/thumbs/skipfloor.jpg"
  },
  {
    key: "copenhagen",
    label: "コペンハーゲンの住戸",
    summary: "8.6m × 6.4m / 天井3.25m ・ ダウンライト0灯、小さな灯り9つ",
    file: "demo/rooms/dk-copenhagen-apartment.json",
    thumb: "demo/rooms/thumbs/copenhagen.jpg"
  },
  {
    key: "mediterranean",
    label: "南欧のアーチの家",
    summary: "9.6m × 8m / 天井3.05m ・ 梁現しの塗り壁をブラケットで舐める",
    file: "demo/rooms/es-mediterranean-arch.json",
    thumb: "demo/rooms/thumbs/mediterranean.jpg"
  },
  {
    key: "loft",
    label: "ブルックリンのロフト",
    summary: "13.5m × 8.6m / 天井4.2m ・ トラックスポットと長吊りペンダント",
    file: "demo/rooms/us-brooklyn-loft.json",
    thumb: "demo/rooms/thumbs/loft.jpg"
  }
];

export const findDemoRoom = (key: string | null): DemoRoom | undefined =>
  key ? demoRooms.find((room) => room.key === key) : undefined;

export const demoAssetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/** public/ 上のプロジェクトJSONを取得してスキーマ検証まで済ませる。 */
export const fetchDemoProject = async (file: string) => {
  const response = await fetch(demoAssetUrl(file));
  if (!response.ok) throw new Error(`demo fetch failed: ${response.status}`);
  return projectSchema.parse(await response.json()) as Project & { compareShots?: CompareShot[] };
};
