import { useRef, useState } from "react";
import { useI18n } from "../../i18n";
import type { LightFixture } from "../../types";
import {
  getCachedIesAsset,
  importIesFile,
  isIesAssetMissing,
  supportsIes,
  useIesVersion
} from "../../utils/iesAssets";

// 「器具・配光」セクション内のIES配光コントロール。詳細＋には隠さない。
export const IesControl = ({
  light,
  updateLight
}: {
  light: LightFixture;
  updateLight: (id: string, patch: Partial<LightFixture>) => void;
}) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useIesVersion(); // 原本の解決状況が変わったら表示を更新する

  if (!supportsIes(light)) return null;

  const reference = light.ies;
  const asset = reference ? getCachedIesAsset(reference.assetId) : undefined;
  const unresolved = Boolean(reference) && !asset && isIesAssetMissing(reference!.assetId);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      // 解析に成功してIndexedDBへ保存できたときだけ照明を更新する。
      const imported = await importIesFile(file);
      updateLight(light.id, {
        ies: { assetId: imported.assetId, fileName: imported.fileName }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ies-control">
      <span className="field-label">{t("IES配光")}</span>
      {asset ? (
        <>
          <p className="ies-status is-on">
            {t("IES適用中")}: <strong>{reference!.fileName || asset.fileName}</strong>
          </p>
          <dl className="ies-values">
            <div>
              <dt>{t("光束（IES由来）")}</dt>
              <dd>{Math.round(asset.lumens).toLocaleString("ja-JP")} lm</dd>
            </div>
            <div>
              <dt>{t("ビーム角（IES由来）")}</dt>
              <dd>{asset.beamAngleDeg.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>{t("色温度・調光（設定のまま）")}</dt>
              <dd>
                {light.colorTemperatureK}K / {Math.round(light.dimmer ?? 100)}%
              </dd>
            </div>
          </dl>
          <p className="field-hint">
            {t("照度計算はIESのθ/φ配光をそのまま使います。3D描画はφ平均の軸対称近似です。")}
          </p>
        </>
      ) : unresolved ? (
        <p className="ies-status is-missing">
          {t("IESファイルがありません／再選択が必要")}
          {reference?.fileName ? `: ${reference.fileName}` : ""}
        </p>
      ) : reference ? (
        <p className="ies-status">{t("IESファイルを読み込み中…")}</p>
      ) : (
        <p className="ies-status">{t("推定配光（ビーム角 {deg}° からの近似）", { deg: light.beamAngleDeg })}</p>
      )}

      <div className="ies-actions">
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? t("IESを解析中…") : reference ? t("別のIESへ変更") : t("IESファイルを選択")}
        </button>
        {reference && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null);
              updateLight(light.id, { ies: undefined });
            }}
          >
            {t("IESを解除")}
          </button>
        )}
      </div>
      {/* 拒否理由はパーサーの実メッセージをそのまま出す（何が非対応かを隠さない）。 */}
      {error && (
        <p className="ies-status is-error">
          {t("このIESは使えません")}: {error}
        </p>
      )}
      <p className="field-hint">{t("IESはこのブラウザ内でのみ解析・保存します。サーバーへは送信しません。")}</p>

      <input
        ref={inputRef}
        type="file"
        accept=".ies,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // 同じファイルを選び直せるようにする
          void pick(file);
        }}
      />
    </div>
  );
};
