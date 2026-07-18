// 通常操作は「選択したらそのままドラッグで移動」に統合する。
// 壁の作図だけ連続操作なので wall として残す。
export type EditMode = "select" | "wall";

export type AddItem = { kind: string; label: string; hint?: string };

export type AddCategory = { id: string; title: string; hint?: string; items: AddItem[] };
export type AddGroup = { id: string; title: string; items?: AddItem[]; categories?: AddCategory[] };
