/**
 * 間接光計算の進行管理（Phase 2）。
 *
 * - 操作停止（400ms）後に開始し、時分割（約8ms/スライス）でUIを止めずに計算
 * - 段階的高品質化: 48レイ → 144レイ → 144レイ＋2バウンス の多段パス。
 *   各パス完了ごとに照度系・描画系へ反映するので、粗い結果が先に出て
 *   時間とともに精細化する
 * - 差分再計算: 光源のみの変更ではプローブのレイキャスト結果を再利用して
 *   再ライティングだけ行う（ジオメトリ変更時はフィールドを作り直す）
 */
import type { SceneModel } from '../core/types';
import type { OcclusionTester, PhotometricLight } from '../photometry/illuminance';
import {
  IrradianceProbeField,
  type ProbeFieldConfig,
  type RadianceScene,
} from '../photometry/probes';

export type IndirectStatus = 'idle' | 'computing' | 'ready';

interface Pass {
  rays: number;
  secondBounce: boolean;
}

/**
 * 段階的高品質化のパス構成（フル計算時）。
 * パス1は少レイで素早く全体を出し、パス2で精細化＋2バウンス
 * （パス1のコミット済みフィールドを2バウンス目の光源として参照）。
 */
const FULL_PASSES: Pass[] = [
  { rays: 32, secondBounce: false },
  { rays: 96, secondBounce: true },
];
/** 光源のみ変更時（レイキャッシュ再利用で高速。1バウンス→2バウンスの順） */
const RELIGHT_PASSES: Pass[] = [
  { rays: 96, secondBounce: false },
  { rays: 96, secondBounce: true },
];

export interface IndirectDeps {
  getModel(): SceneModel;
  getProbeFieldConfig?(): ProbeFieldConfig;
  getRadianceScene(): RadianceScene;
  getLights(): PhotometricLight[];
  getOcclusion(): OcclusionTester;
  /** 各パス完了時（描画テクスチャ・ヒートマップ・UI更新） */
  onPassCommitted(
    field: IrradianceProbeField,
    passIndex: number,
    isFinal: boolean,
  ): void | Promise<void>;
  onStatusChanged(): void;
}

export class IndirectController {
  field: IrradianceProbeField | null = null;
  status: IndirectStatus = 'idle';
  /** 表示用: 現在パス/全パス・進捗0..1 */
  passLabel = '';
  progress = 0;
  lastComputeMs = 0;
  /** 照度（lx）への加算トグル */
  includeInLx = true;

  private timer = 0;
  private runToken = 0;
  private pendingKind: 'geometry' | 'lights' | null = null;

  constructor(private readonly deps: IndirectDeps) {}

  /** シーン変更通知。操作停止後に自動再計算 */
  invalidate(kind: 'geometry' | 'lights'): void {
    if (kind === 'geometry') this.field = null;
    this.pendingKind = this.pendingKind === 'geometry' ? 'geometry' : kind;
    this.runToken++;
    this.status = 'computing';
    this.progress = 0;
    this.passLabel = '待機中';
    this.deps.onStatusChanged();
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(), 400);
  }

  private async run(): Promise<void> {
    const token = this.runToken;
    const kind = this.pendingKind ?? 'geometry';
    this.pendingKind = null;

    if (kind === 'geometry' || !this.field) {
      this.field = new IrradianceProbeField(
        this.deps.getModel(),
        this.deps.getProbeFieldConfig?.(),
      );
    }
    const field = this.field;
    const passes = kind === 'lights' && field.canRelight() ? RELIGHT_PASSES : FULL_PASSES;
    const start = performance.now();

    for (let passIndex = 0; passIndex < passes.length; passIndex++) {
      const pass = passes[passIndex]!;
      this.passLabel = `パス ${passIndex + 1}/${passes.length}（${pass.rays}レイ${pass.secondBounce ? '・2バウンス' : ''}）`;
      const gen = field.gatherPass(
        this.deps.getRadianceScene(),
        this.deps.getLights(),
        this.deps.getOcclusion(),
        pass.rays,
        pass.secondBounce,
      );
      const finished = await this.driveSliced(gen, token);
      if (!finished) return; // 新しい変更で中断（再スケジュール済み）
      const isFinal = passIndex === passes.length - 1;
      await this.deps.onPassCommitted(field, passIndex, isFinal);
      if (token !== this.runToken) return;
    }

    this.lastComputeMs = performance.now() - start;
    this.status = 'ready';
    this.passLabel = '';
    this.progress = 1;
    this.deps.onStatusChanged();
  }

  /** 非表示化や破棄時に待機中・実行中の計算を止める */
  cancel(): void {
    window.clearTimeout(this.timer);
    this.runToken++;
    this.pendingKind = null;
    this.status = 'idle';
    this.passLabel = '';
    this.progress = 0;
    this.deps.onStatusChanged();
  }

  dispose(): void {
    this.cancel();
    this.field = null;
  }

  /** ジェネレータを約8ms/スライスで駆動。トークンが変わったら中断 */
  private driveSliced(gen: Generator<number>, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      const step = (): void => {
        if (token !== this.runToken) {
          resolve(false);
          return;
        }
        const deadline = performance.now() + 8;
        let result = gen.next();
        while (!result.done && performance.now() < deadline) result = gen.next();
        if (token !== this.runToken) {
          resolve(false);
        } else if (!result.done) {
          this.progress = result.value;
          this.deps.onStatusChanged();
          window.setTimeout(step, 0);
        } else {
          resolve(true);
        }
      };
      step();
    });
  }
}
