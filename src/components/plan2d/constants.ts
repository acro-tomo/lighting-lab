export const MIN_SIZE_M = 0.2;
// 窓/扉をクリックで壁に設置するときの許容距離(m)。これ以内の最寄り壁に付く。
export const WALL_SNAP_M = 1.2;
// ライトをドラッグ移動するとき、他ライトの x/z にこの距離(m)以内なら整列スナップする。
export const SNAP_M = 0.12;
export const TOUCH_PAN_SENSITIVITY = 0.9;
export const TOUCH_PINCH_ZOOM_EXPONENT = 0.74;
export const TOUCH_TAP_MAX_MOVE_PX = 10;
export const TOUCH_WALL_DRAW_START_PX = 12;
export const WALL_VERTEX_SNAP_PX = 30;
// タッチ(指)はマウスより座標精度が低いため、壁の端点スナップ半径を広げる（要望: 最後の壁を閉じやすく）。
export const WALL_VERTEX_SNAP_PX_TOUCH = 46;
export const MIN_WALL_SEGMENT_M = 0.03;
// 実機ジェスチャー診断用HUD。?gdebug=1 で有効（一時的なデバッグ用）。
export const GESTURE_DEBUG = new URLSearchParams(window.location.search).has("gdebug");

// 尺モジュール: 1尺=303.333...mm。壁トレースは 1/4尺(約75.8mm)へ吸着する。
// グリッド原点はそのトレースの最初の点(origin)。origin + round((p-origin)/WALL_MODULE_M)*WALL_MODULE_M。
export const SHAKU_M = 0.30333333333333334;
export const WALL_MODULE_M = SHAKU_M / 4;

// bbox 全体が 100%(zoom=1) で余白付きに収まるよう planSize/pxPerM を決める。
// worldToSvg は (x - minX + MARGIN_M) * pxPerM。原点は bbox の min を使う。
export const MARGIN_M = 0.8;

// 外周(部屋の端)に来る太い壁ストロークがクリップされないよう、viewBoxを
// 表示用の余白ぶん広げる。座標系は getScreenCTM 逆行列で扱うため
// worldToSvg/svgPointToWorld は viewBox(pad) の影響を受けない。
export const VIEW_PAD = 60;
