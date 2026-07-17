import { useState } from "react";
import { useI18n } from "../i18n";

type FeedbackType = "feature" | "bug";
type SubmitState = "idle" | "sending" | "done" | "error";

const serverErrorMessage = (code: string | undefined, t: (key: string) => string) => {
  switch (code) {
    case "feedback_unavailable": return t("フィードバック送信は現在利用できません。");
    case "empty_message": return t("内容を入力してください。");
    case "issue_creation_failed": return t("フィードバック送信に失敗しました。時間をおいて再度お試しください。");
    default: return t("送信に失敗しました。");
  }
};

// 送信先はCloudflare Pages Function（functions/api/feedback.ts）。
// ローカルvite単体では存在しないため、未配信環境では送信エラーになる。
const ENDPOINT = "/api/feedback";

export const FeedbackForm = () => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("feature");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  // スパムbot除けのハニーポット。人間には見えない欄。
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      setState("error");
      setMessage(t("内容を入力してください。"));
      return;
    }
    setState("sending");
    setMessage("");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, body: trimmed, contact: contact.trim(), website })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(`${serverErrorMessage(data?.error, t)} (${res.status})`);
      }
      setState("done");
      setMessage(t("送信しました。ありがとうございます。"));
      setBody("");
      setContact("");
      setType("feature");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : t("送信に失敗しました。"));
    }
  };

  return (
    <div className="feedback-widget" aria-label={t("フィードバック")}>
      {open && (
        <form className="feedback-body" onSubmit={submit}>
          <div className="feedback-head">
            <strong>{t("ご意見・不具合の報告")}</strong>
            <button
              type="button"
              className="feedback-close"
              onClick={() => setOpen(false)}
              aria-label={t("閉じる")}
            >
              ×
            </button>
          </div>

          <div className="feedback-types" role="radiogroup" aria-label={t("種別")}>
            <label className={type === "feature" ? "feedback-type is-active" : "feedback-type"}>
              <input
                type="radio"
                name="fb-type"
                checked={type === "feature"}
                onChange={() => setType("feature")}
              />
              {t("要望")}
            </label>
            <label className={type === "bug" ? "feedback-type is-active" : "feedback-type"}>
              <input
                type="radio"
                name="fb-type"
                checked={type === "bug"}
                onChange={() => setType("bug")}
              />
              {t("不具合")}
            </label>
          </div>

          <textarea
            className="feedback-text"
            placeholder={
              type === "bug"
                ? t("起きたこと・再現手順・期待した動作など")
                : t("ほしい機能・改善してほしい点など")
            }
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            rows={5}
          />

          <input
            className="feedback-contact"
            type="text"
            placeholder={t("連絡先（任意・返信がほしい場合）")}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            maxLength={200}
          />

          {/* ハニーポット: botが埋めるとサーバ側で破棄する。aria-hiddenで支援技術からも隠す。 */}
          <input
            className="feedback-hp"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />

          {message && (
            <p className={state === "error" ? "feedback-msg is-error" : "feedback-msg is-ok"}>
              {message}
            </p>
          )}

          <button type="submit" className="feedback-submit" disabled={state === "sending"}>
            {state === "sending" ? t("送信中…") : t("送信")}
          </button>

          <p className="feedback-note">
            {t("内容は開発者の課題管理（GitHub）に送られます。個人情報や機密は書かないでください。")}
          </p>
        </form>
      )}

      <button
        type="button"
        className={open ? "feedback-toggle is-open" : "feedback-toggle"}
        onClick={() => {
          setOpen((v) => !v);
          setState("idle");
          setMessage("");
        }}
        title={t("ご意見・不具合を送る")}
      >
        💬 {t("要望")}
      </button>
    </div>
  );
};
