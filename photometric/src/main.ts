/**
 * アプリエントリ。シーン組み立て・UI・編集操作。
 *
 * 描画（見た目）と照度計算（photometry/）は独立。露出・トーンマッピングを
 * 変えても lx 値は一切変化しない（照度は builtLuminaires の photometric
 * 定義と遮蔽レイキャストのみから計算する）。
 */
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './styles.css';
import type { FixturePreset, Furniture, Luminaire, SceneModel } from './core/types';
import { createRenderer, type RendererHandle } from './render/renderer';
import { buildArchitecture, buildFurniture, planBounds } from './render/sceneBuilder';
import { buildLuminaire, planToWorld, type BuiltLuminaire } from './render/lights';
import { createRaycastOcclusion } from './render/occlusion';
import { illuminanceAt, type OcclusionTester } from './photometry/illuminance';
import { loadPresets } from './app/presets';
import { prefetchIes, resolveIes } from './app/iesCache';
import { createSampleScene } from './data/sampleScene';
import {
  buildHeatmapMesh,
  buildLegendCanvas,
  computeIlluminanceGrid,
  insideFurniture,
  SCALE_OPTIONS,
  type IlluminanceGrid,
} from './app/heatmap';
import { pointInPolygon } from './core/room';
import { vec3 } from './core/vec3';
import { overlayColorMaterial, syncOverlayExposure } from './render/overlayMaterial';
import { createClipWarningPipeline, type ClipWarningPipeline } from './render/clipWarning';

interface App {
  renderer: RendererHandle;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  model: SceneModel;
  presets: FixturePreset[];
  builtLuminaires: BuiltLuminaire[];
  lightsGroup: THREE.Group;
  furnitureGroup: THREE.Group;
  furnitureDisplayMeshes: THREE.Mesh[];
  furnitureOccluders: THREE.Mesh[];
  architectureOccluders: THREE.Object3D[];
  floorMesh: THREE.Mesh;
  occlusion: OcclusionTester;
  ambient: THREE.AmbientLight;
  selectedLuminaireId: string | null;
  selectedFurnitureId: string | null;
  onSceneEdited: (() => void)[];
  heatmap: HeatmapState;
  probeMarker: THREE.Mesh;
  clipWarning: { enabled: boolean; pipeline: ClipWarningPipeline | null };
}

interface HeatmapState {
  enabled: boolean;
  /** 計算面高さ [m]（例: 床上0.75m） */
  height: number;
  scaleMax: (typeof SCALE_OPTIONS)[number];
  mesh: THREE.Mesh | null;
  grid: IlluminanceGrid | null;
  timer: number;
  lastComputeMs: number;
}

const query = new URLSearchParams(location.search);

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

/* ---------------------------------- 光源 ---------------------------------- */

function disposeLuminaireGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
    if (obj instanceof THREE.IESSpotLight) {
      obj.iesMap?.dispose();
      obj.dispose();
    }
  });
  group.clear();
}

function rebuildLights(app: App): void {
  disposeLuminaireGroup(app.lightsGroup);
  // IES があればその配光、なければビーム角近似（=推定配光バッジ）
  app.builtLuminaires = app.model.luminaires.map((lum) =>
    buildLuminaire(lum, resolveIes(lum.preset)),
  );
  for (const built of app.builtLuminaires) app.lightsGroup.add(built.group);
  notifyEdited(app);
}

function rebuildFurniture(app: App): void {
  app.furnitureGroup.removeFromParent();
  app.furnitureGroup.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
  });
  const built = buildFurniture(app.model.furniture);
  app.furnitureGroup = built.group;
  app.furnitureDisplayMeshes = built.displayMeshes;
  app.furnitureOccluders = built.occluders;
  app.scene.add(app.furnitureGroup);
  app.occlusion = createRaycastOcclusion([...app.architectureOccluders, ...app.furnitureOccluders]);
  notifyEdited(app);
}

function notifyEdited(app: App): void {
  for (const cb of app.onSceneEdited) cb();
}

/* -------------------------------- ヒートマップ ------------------------------- */

function disposeHeatmapMesh(app: App): void {
  if (app.heatmap.mesh) {
    app.heatmap.mesh.removeFromParent();
    app.heatmap.mesh.geometry.dispose();
    const material = app.heatmap.mesh.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
    app.heatmap.mesh = null;
  }
}

function updateHeatmapNow(app: App): void {
  disposeHeatmapMesh(app);
  if (!app.heatmap.enabled) {
    app.heatmap.grid = null;
    updateHeatmapStats(app);
    return;
  }
  const start = performance.now();
  const grid = computeIlluminanceGrid(
    app.model,
    app.builtLuminaires.map((b) => b.photometric),
    app.occlusion,
    app.heatmap.height,
  );
  app.heatmap.lastComputeMs = performance.now() - start;
  app.heatmap.grid = grid;
  app.heatmap.mesh = buildHeatmapMesh(grid, app.heatmap.scaleMax, app.heatmap.height);
  app.scene.add(app.heatmap.mesh);
  updateHeatmapStats(app);
}

/** シーン編集後の再計算（デバウンス） */
function scheduleHeatmapUpdate(app: App): void {
  if (!app.heatmap.enabled) return;
  window.clearTimeout(app.heatmap.timer);
  app.heatmap.timer = window.setTimeout(() => updateHeatmapNow(app), 120);
}

function updateHeatmapStats(app: App): void {
  const statsEl = document.getElementById('heatmap-stats');
  if (!statsEl) return;
  const grid = app.heatmap.grid;
  statsEl.textContent = grid
    ? `平均 ${grid.mean.toFixed(0)}lx / 最小 ${grid.min.toFixed(0)}lx / 最大 ${grid.max.toFixed(0)}lx （計算 ${app.heatmap.lastComputeMs.toFixed(0)}ms・${GRID_LABEL}）`
    : '';
}

const GRID_LABEL = `直接照度・グリッド0.15m`;

/* ----------------------------------- UI ----------------------------------- */

function buildHud(app: App): void {
  const hud = document.getElementById('hud')!;
  hud.replaceChildren(
    el('div', { class: 'hud-badge', id: 'hud-backend', text: `レンダラー: ${app.renderer.backend === 'webgpu' ? 'WebGPU' : 'WebGL2'}` }),
    el('div', {
      class: 'hud-badge warn',
      text: 'Phase 1: 直接照度のみ（間接光は未実装・環境光は見た目用で照度に含めません）',
    }),
  );
}

function luminaireEditor(app: App, lum: Luminaire, rerender: () => void): HTMLElement {
  const editor = el('div', { class: 'section' });

  const presetSelect = el('select');
  for (const preset of app.presets) {
    const opt = el('option', { value: preset.model, text: `${preset.model} (${preset.flux}lm/${preset.cct}K/${preset.beamAngleDeg}°)` });
    if (preset.model === lum.preset.model) opt.selected = true;
    presetSelect.append(opt);
  }
  presetSelect.addEventListener('change', () => {
    const preset = app.presets.find((p) => p.model === presetSelect.value);
    if (preset) {
      lum.preset = preset;
      if (!preset.dimmable) lum.dimming = 1;
      rebuildLights(app);
      rerender();
    }
  });

  const numberRow = (
    label: string,
    value: number,
    step: number,
    apply: (v: number) => void,
    attrs: Record<string, string> = {},
  ) => {
    const input = el('input', { type: 'number', step: String(step), value: String(Math.round(value * 1000) / 1000), ...attrs });
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) {
        apply(v);
        rebuildLights(app);
      }
    });
    return el('div', { class: 'row' }, [el('label', { text: label }), input]);
  };

  const dimRow = el('div', { class: 'row' });
  const dimInput = el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(lum.dimming * 100)) });
  const dimOut = el('output', { text: `${Math.round(lum.dimming * 100)}%` });
  if (!lum.preset.dimmable) dimInput.disabled = true;
  dimInput.addEventListener('input', () => {
    lum.dimming = Number(dimInput.value) / 100;
    dimOut.textContent = `${dimInput.value}%`;
    rebuildLights(app);
  });
  dimRow.append(el('label', { text: '調光率' }), dimInput, dimOut);

  const info = el('p', { class: 'disclaimer' });
  info.textContent = `${lum.preset.maker} / 全光束 ${lum.preset.flux}lm / ${lum.preset.cct}K` +
    (lum.preset.dataSource === 'representative' ? '（代表値サンプル）' : '');

  const deleteBtn = el('button', { class: 'danger', text: 'この器具を削除' });
  deleteBtn.addEventListener('click', () => {
    app.model.luminaires = app.model.luminaires.filter((l) => l.id !== lum.id);
    app.selectedLuminaireId = null;
    rebuildLights(app);
    rerender();
  });

  editor.append(
    el('div', { class: 'row' }, [el('label', { text: '品番' }), presetSelect]),
    resolveIes(lum.preset) === null
      ? el('p', { class: 'disclaimer', text: '⚠ 推定配光: IESデータがないためビーム角からの近似です' })
      : el('p', { class: 'disclaimer', text: 'IES配光データを使用（測光・描画共通）' }),
    info,
    numberRow('位置 x [m]', lum.position.x, 0.05, (v) => (lum.position.x = v)),
    numberRow('位置 y [m]', lum.position.y, 0.05, (v) => (lum.position.y = v)),
    numberRow('取付高 [m]', lum.mountHeight, 0.05, (v) => (lum.mountHeight = v)),
    numberRow('チルト [°]', lum.aim.tiltDeg, 5, (v) => (lum.aim.tiltDeg = Math.max(0, Math.min(90, v)))),
    numberRow('パン [°]', lum.aim.panDeg, 5, (v) => (lum.aim.panDeg = v)),
    dimRow,
    deleteBtn,
  );
  return editor;
}

function buildPanel(app: App): void {
  const panel = document.getElementById('panel')!;

  const render = () => {
    panel.replaceChildren();

    panel.append(
      el('h1', { text: '照明シミュレーター（測光）' }),
      el('p', {
        class: 'disclaimer',
        text: '照度[lx]はレンダリング画像とは独立した測光計算による直接照度です。色温度はCCTに基づく色みの再現であり、演色性（CRI）は再現できません。',
      }),
    );

    // 表示設定
    const view = el('div', { class: 'section' });
    view.append(el('h2', { text: '表示（照度計算には影響しません）' }));
    const evRow = el('div', { class: 'row' });
    const evInput = el('input', { type: 'range', min: '-3', max: '3', step: '0.5', value: String(app.renderer.getExposureEv()) });
    const evOut = el('output', { text: `${app.renderer.getExposureEv().toFixed(1)}EV` });
    evInput.addEventListener('input', () => {
      app.renderer.setExposureEv(Number(evInput.value));
      evOut.textContent = `${Number(evInput.value).toFixed(1)}EV`;
    });
    evRow.append(el('label', { text: '固定露出' }), evInput, evOut);

    const ambientRow = el('div', { class: 'row' });
    const ambientCheck = el('input', { type: 'checkbox' });
    ambientCheck.checked = app.ambient.visible;
    ambientCheck.addEventListener('change', () => {
      app.ambient.visible = ambientCheck.checked;
    });
    ambientRow.append(el('label', { text: '補助環境光' }), ambientCheck, el('span', { class: 'disclaimer', text: '床反射の近似（見た目のみ）' }));

    // 天井の表示/非表示（表示のみ。遮蔽判定・照度計算には影響しない）
    const ceilingRow = el('div', { class: 'row' });
    const ceilingMeshes = app.scene
      .getObjectByName('architecture')!
      .children.filter((o) => o.name.startsWith('ceiling'));
    const ceilingCheck = el('input', { type: 'checkbox' });
    ceilingCheck.checked = ceilingMeshes.every((m) => m.visible);
    ceilingCheck.addEventListener('change', () => {
      for (const mesh of ceilingMeshes) mesh.visible = ceilingCheck.checked;
    });
    ceilingRow.append(el('label', { text: '天井を表示' }), ceilingCheck);

    // 白飛び警告（表示上の飽和検出。lx計算とは無関係）
    const clipRow = el('div', { class: 'row' });
    const clipCheck = el('input', { type: 'checkbox' });
    clipCheck.checked = app.clipWarning.enabled;
    clipCheck.addEventListener('change', () => {
      app.clipWarning.enabled = clipCheck.checked;
    });
    clipRow.append(
      el('label', { text: '白飛び警告' }),
      clipCheck,
      el('span', { class: 'disclaimer', text: '表示上限超えの画素を強調' }),
    );

    view.append(evRow, ambientRow, ceilingRow, clipRow);
    panel.append(view);

    // 視点（反射確認モード）
    const viewpointSection = el('div', { class: 'section' });
    viewpointSection.append(el('h2', { text: '視点' }));
    const vpRow = el('div', { class: 'row' });
    const sofaBtn = el('button', { text: 'ソファ視点（映り込み確認）' });
    sofaBtn.addEventListener('click', () => setReflectionViewpoint(app));
    const homeBtn = el('button', { text: '俯瞰' });
    homeBtn.addEventListener('click', () => setHomeViewpoint(app));
    vpRow.append(sofaBtn, homeBtn);
    viewpointSection.append(
      vpRow,
      el('p', {
        class: 'disclaimer',
        text: '低Roughness面（消灯TV画面など）への光源の映り込みを目視確認するモードです。',
      }),
    );
    panel.append(viewpointSection);

    // 照度ヒートマップ
    const heatSection = el('div', { class: 'section' });
    heatSection.append(el('h2', { text: '照度ヒートマップ（直接照度・測光計算）' }));

    const enableRow = el('div', { class: 'row' });
    const enableCheck = el('input', { type: 'checkbox' });
    enableCheck.checked = app.heatmap.enabled;
    enableCheck.addEventListener('change', () => {
      app.heatmap.enabled = enableCheck.checked;
      updateHeatmapNow(app);
    });
    enableRow.append(el('label', { text: '表示' }), enableCheck);

    const heightRow = el('div', { class: 'row' });
    const heightInput = el('input', { type: 'number', step: '0.05', min: '0', max: '2', value: String(app.heatmap.height) });
    heightInput.addEventListener('change', () => {
      const v = Number(heightInput.value);
      if (Number.isFinite(v) && v >= 0) {
        app.heatmap.height = v;
        updateHeatmapNow(app);
      }
    });
    heightRow.append(el('label', { text: '計算面高 [m]' }), heightInput);

    const scaleRow = el('div', { class: 'row' });
    const scaleSelect = el('select');
    for (const max of SCALE_OPTIONS) {
      const opt = el('option', { value: String(max), text: `0〜${max} lx（固定）` });
      if (max === app.heatmap.scaleMax) opt.selected = true;
      scaleSelect.append(opt);
    }
    scaleSelect.addEventListener('change', () => {
      app.heatmap.scaleMax = Number(scaleSelect.value) as (typeof SCALE_OPTIONS)[number];
      legendHolder.replaceChildren(buildLegendCanvas(app.heatmap.scaleMax));
      updateHeatmapNow(app);
    });
    scaleRow.append(el('label', { text: 'スケール' }), scaleSelect);

    const legendHolder = el('div');
    legendHolder.append(buildLegendCanvas(app.heatmap.scaleMax));

    heatSection.append(
      enableRow,
      heightRow,
      scaleRow,
      legendHolder,
      el('p', { class: 'disclaimer', id: 'heatmap-stats' }),
      el('p', { class: 'disclaimer', text: '3Dビューをクリックすると、その位置の計算面高さでの実数lx値を表示します。' }),
    );
    panel.append(heatSection);
    updateHeatmapStats(app);

    // 器具
    const lumSection = el('div', { class: 'section' });
    lumSection.append(el('h2', { text: `照明器具（${app.model.luminaires.length}）` }));
    const list = el('div', { class: 'lum-list' });
    for (const lum of app.model.luminaires) {
      const item = el('div', { class: `lum-item${lum.id === app.selectedLuminaireId ? ' selected' : ''}` });
      item.append(
        el('span', { class: 'name', text: `${lum.id} — ${lum.preset.model}` }),
        ...(resolveIes(lum.preset) === null
          ? [el('span', { class: 'badge', text: '推定配光' })]
          : [el('span', { class: 'badge info', text: 'IES' })]),
      );
      item.addEventListener('click', () => {
        app.selectedLuminaireId = lum.id === app.selectedLuminaireId ? null : lum.id;
        app.selectedFurnitureId = null;
        render();
      });
      list.append(item);
    }
    lumSection.append(list);

    const addRow = el('div', { class: 'row' });
    const addLight = (kind: 'downlight' | 'spot') => {
      const preset = app.presets.find((p) => p.kind === kind);
      if (!preset) return;
      const bounds = planBounds(app.model.floorPlan);
      const id = `${kind}-${Date.now() % 100000}`;
      app.model.luminaires.push({
        id,
        preset,
        position: { x: Math.round(bounds.center.x * 20) / 20, y: Math.round(-bounds.center.z * 20) / 20 },
        mountHeight: app.model.floorPlan.ceilingHeight,
        aim: { tiltDeg: kind === 'spot' ? 30 : 0, panDeg: 0 },
        dimming: 1,
      });
      app.selectedLuminaireId = id;
      rebuildLights(app);
      render();
    };
    const addDl = el('button', { text: '＋ダウンライト' });
    addDl.addEventListener('click', () => addLight('downlight'));
    const addSp = el('button', { text: '＋スポット' });
    addSp.addEventListener('click', () => addLight('spot'));
    addRow.append(addDl, addSp);
    lumSection.append(addRow);

    const selected = app.model.luminaires.find((l) => l.id === app.selectedLuminaireId);
    if (selected) lumSection.append(luminaireEditor(app, selected, render));
    panel.append(lumSection);

    // 家具
    const furnSection = el('div', { class: 'section' });
    furnSection.append(
      el('h2', { text: '家具（クリックで選択・ドラッグで移動）' }),
      el('p', {
        class: 'disclaimer',
        text: app.selectedFurnitureId
          ? `選択中: ${app.model.furniture.find((f) => f.id === app.selectedFurnitureId)?.name ?? ''}`
          : '3Dビューで家具・器具の発光面をドラッグすると平面上を移動できます。',
      }),
    );
    panel.append(furnSection);
  };

  render();
  app.onSceneEdited.push(() => {
    // 選択中の器具が消えた場合などの整合を保つ（毎回の全再描画は避ける）
  });
}

/* ------------------------------ 視点プリセット ------------------------------ */

/**
 * 反射確認モード: 目線高さの視点カメラから、低Roughnessの反射性オブジェクト
 * （例: 消灯TV画面）への光源の映り込みを確認する。
 */
function setReflectionViewpoint(app: App): void {
  const eyeHeight = 1.15; // 座位の目線高さ
  const sofa = app.model.furniture.find((f) => f.id === 'sofa');
  // 最も Roughness の低い家具を注視対象にする（TV等）
  const target = [...app.model.furniture].sort(
    (a, b) => a.material.roughness - b.material.roughness,
  )[0];
  if (!target) return;
  const eye = sofa
    ? planToWorld(sofa.position, eyeHeight)
    : planToWorld({ x: target.position.x, y: target.position.y - 2.5 }, eyeHeight);
  const look = planToWorld(target.position, target.elevation + target.size.h / 2);
  app.camera.position.set(eye.x, eye.y, eye.z);
  app.controls.target.set(look.x, look.y, look.z);
  app.controls.update();
}

function setHomeViewpoint(app: App): void {
  const bounds = planBounds(app.model.floorPlan);
  app.camera.position.set(
    bounds.center.x + bounds.radius * 1.1,
    bounds.radius * 1.4,
    bounds.center.z + bounds.radius * 1.3,
  );
  app.controls.target.copy(bounds.center);
  app.controls.update();
}

/* ------------------------------ ドラッグ編集 ------------------------------ */

function setupPointerEditing(app: App, rerenderPanel: () => void): void {
  const canvas = app.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  let dragging: { kind: 'luminaire' | 'furniture'; id: string } | null = null;
  let downAt: { x: number; y: number } | null = null;

  const pick = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, app.camera);
  };

  canvas.addEventListener('pointerdown', (event) => {
    downAt = { x: event.clientX, y: event.clientY };
    pick(event);
    // 発光面ディスク → 器具、表示メッシュ → 家具
    const discs = app.builtLuminaires
      .flatMap((b) => b.group.children)
      .filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    const discHits = raycaster.intersectObjects(discs, false);
    if (discHits.length > 0) {
      const id = discHits[0]!.object.name.replace('luminaire-disc:', '');
      dragging = { kind: 'luminaire', id };
      app.selectedLuminaireId = id;
      app.selectedFurnitureId = null;
      app.controls.enabled = false;
      rerenderPanel();
      return;
    }
    const furnHits = raycaster.intersectObjects(app.furnitureDisplayMeshes, false);
    if (furnHits.length > 0) {
      const id = furnHits[0]!.object.name.replace('furniture:', '');
      dragging = { kind: 'furniture', id };
      app.selectedFurnitureId = id;
      app.selectedLuminaireId = null;
      app.controls.enabled = false;
      rerenderPanel();
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    pick(event);
    if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;
    const x = hit.x;
    const y = -hit.z;
    if (dragging.kind === 'luminaire') {
      const lum = app.model.luminaires.find((l) => l.id === dragging!.id);
      const built = app.builtLuminaires[app.model.luminaires.indexOf(lum!)];
      if (lum && built) {
        const from = planToWorld(lum.position, 0);
        built.group.position.set(x - from.x, 0, -y - from.z);
      }
    } else {
      const item = app.model.furniture.find((f) => f.id === dragging!.id);
      if (item) {
        const targets = [
          ...app.furnitureDisplayMeshes.filter((m) => m.name === `furniture:${item.id}`),
          ...app.furnitureOccluders.filter((m) => m.name === `furniture-occluder:${item.id}`),
        ];
        for (const mesh of targets) {
          mesh.position.set(x, item.elevation + item.size.h / 2, -y);
        }
      }
    }
  });

  /** クリック（ドラッグでない）→ 実数lx値プローブ */
  const probe = (event: PointerEvent) => {
    pick(event);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -app.heatmap.height);
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const x = hit.x;
    const y = -hit.z;
    const h = app.heatmap.height;
    if (!pointInPolygon({ x, y }, app.model.floorPlan.outline)) return;
    if (app.model.furniture.some((f) => insideFurniture({ x, y }, h, f))) return;
    const result = illuminanceAt(
      { position: vec3(x, h, -y), normal: vec3(0, 1, 0) },
      app.builtLuminaires.map((b) => b.photometric),
      app.occlusion,
    );
    app.probeMarker.position.set(x, h + 0.02, -y);
    app.probeMarker.visible = true;
    const hud = document.getElementById('hud')!;
    let readout = document.getElementById('hud-lx');
    if (!readout) {
      readout = el('div', { class: 'hud-lx', id: 'hud-lx' });
      hud.append(readout);
    }
    readout.textContent = `${result.total.toFixed(1)} lx（直接照度） @ (${x.toFixed(2)}, ${y.toFixed(2)}) 高さ${h.toFixed(2)}m`;
  };

  const endDrag = (event: PointerEvent) => {
    const wasClick =
      downAt !== null &&
      Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) < 5;
    downAt = null;
    if (!dragging) {
      if (wasClick) probe(event);
      return;
    }
    pick(event);
    const active = dragging;
    dragging = null;
    app.controls.enabled = true;
    if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;
    const x = Math.round(hit.x * 100) / 100;
    const y = Math.round(-hit.z * 100) / 100;
    if (active.kind === 'luminaire') {
      const lum = app.model.luminaires.find((l) => l.id === active.id);
      if (lum) {
        lum.position = { x, y };
        rebuildLights(app);
      }
    } else {
      const item = app.model.furniture.find((f) => f.id === active.id);
      if (item) {
        item.position = { x, y };
        rebuildFurniture(app);
      }
    }
    rerenderPanel();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => {
    dragging = null;
    app.controls.enabled = true;
  });
}

/* ---------------------------------- 起動 ---------------------------------- */

async function init(): Promise<void> {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = await createRenderer(canvas, {
    forceWebGL: query.get('backend') === 'webgl2',
  });

  const presets = await loadPresets(`${import.meta.env.BASE_URL}presets.json`);
  await prefetchIes(presets, import.meta.env.BASE_URL);
  const model = createSampleScene(presets);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);

  const architecture = buildArchitecture(model);
  scene.add(architecture.group);

  const furnitureBuilt = buildFurniture(model.furniture);
  scene.add(furnitureBuilt.group);

  // 床反射の近似としての弱い環境光（1つだけ・照度計算には含めない）
  const ambient = new THREE.AmbientLight(0xffffff, 15);
  scene.add(ambient);

  const bounds = planBounds(model.floorPlan);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 100);
  camera.position.set(bounds.center.x + bounds.radius * 1.1, bounds.radius * 1.4, bounds.center.z + bounds.radius * 1.3);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(bounds.center);
  controls.maxDistance = bounds.radius * 6;
  controls.update();

  const lightsGroup = new THREE.Group();
  lightsGroup.name = 'luminaires';
  scene.add(lightsGroup);

  const app: App = {
    renderer,
    scene,
    camera,
    controls,
    model,
    presets,
    builtLuminaires: [],
    lightsGroup,
    furnitureGroup: furnitureBuilt.group,
    furnitureDisplayMeshes: furnitureBuilt.displayMeshes,
    furnitureOccluders: furnitureBuilt.occluders,
    architectureOccluders: architecture.occluders,
    floorMesh: architecture.floorMesh,
    occlusion: createRaycastOcclusion([...architecture.occluders, ...furnitureBuilt.occluders]),
    ambient,
    selectedLuminaireId: null,
    selectedFurnitureId: null,
    onSceneEdited: [],
    heatmap: {
      enabled: false,
      height: 0.75,
      scaleMax: 300,
      mesh: null,
      grid: null,
      timer: 0,
      lastComputeMs: 0,
    },
    probeMarker: new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 12),
      overlayColorMaterial(0.95, 0.95, 0.98),
    ),
    clipWarning: { enabled: false, pipeline: null },
  };
  app.probeMarker.visible = false;
  app.probeMarker.name = 'probe-marker';
  scene.add(app.probeMarker);
  app.onSceneEdited.push(() => scheduleHeatmapUpdate(app));

  rebuildLights(app);
  buildHud(app);
  buildPanel(app);
  const rerenderPanel = () => buildPanel(app);
  setupPointerEditing(app, rerenderPanel);

  const resize = () => {
    const viewport = document.getElementById('viewport')!;
    const { clientWidth, clientHeight } = viewport;
    renderer.setSize(clientWidth, clientHeight, Math.min(window.devicePixelRatio, 2));
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(document.getElementById('viewport')!);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    syncOverlayExposure(renderer.three.toneMappingExposure);
    if (app.clipWarning.enabled) {
      app.clipWarning.pipeline ??= createClipWarningPipeline(renderer.three, scene, camera);
      app.clipWarning.pipeline.render(scene, camera);
    } else {
      renderer.render(scene, camera);
    }
  });

  // 検証スクリプト用（UIからは使わない）
  (window as unknown as { __app: App }).__app = app;
}

init().catch((error) => {
  const hud = document.getElementById('hud');
  if (hud) {
    hud.append(
      el('div', { class: 'hud-badge warn', text: `起動エラー: ${error instanceof Error ? error.message : String(error)}` }),
    );
  }
  console.error(error);
});
