// Cloudflare Pages Function: POST /api/feedback
// アプリ内フィードバックフォームの内容を受け取り、GitHubの（非公開）リポジトリに
// Issueとして起票する。トークン(GITHUB_TOKEN)はサーバ側の秘密として保持し、
// クライアントのバンドルには一切含めない。これによりリポジトリを非公開のまま、
// GitHubアカウントを持たない他ユーザーからの投稿を受け付けられる。

interface Env {
  GITHUB_TOKEN: string;
  // "owner/repo" 形式。未設定時は DEFAULT_REPO を使う。
  GITHUB_REPO?: string;
}

const DEFAULT_REPO = "acro-tomo/ldk-lighting-lab";
const MAX_BODY = 4000;
const MAX_CONTACT = 200;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GITHUB_TOKEN) {
    return json({ error: "サーバ側のトークンが未設定です。" }, 500);
  }

  let payload: { type?: string; body?: string; contact?: string; website?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "リクエスト形式が不正です。" }, 400);
  }

  // ハニーポット欄に値が入っていればbotとみなし、静かに成功扱いで破棄する。
  if (payload.website) return json({ ok: true });

  const type = payload.type === "bug" ? "bug" : "feature";
  const body = (payload.body ?? "").trim().slice(0, MAX_BODY);
  const contact = (payload.contact ?? "").trim().slice(0, MAX_CONTACT);
  if (!body) return json({ error: "内容が空です。" }, 400);

  const repo = env.GITHUB_REPO ?? DEFAULT_REPO;
  // "bug" / "enhancement" はGitHubリポジトリの既定ラベル。
  const label = type === "bug" ? "bug" : "enhancement";
  const titlePrefix = type === "bug" ? "[不具合]" : "[要望]";
  const firstLine = body.split("\n")[0].slice(0, 60);
  const title = `${titlePrefix} ${firstLine}`;

  const issueBody = [
    body,
    "",
    "---",
    `- 種別: ${type === "bug" ? "不具合" : "要望"}`,
    contact ? `- 連絡先: ${contact}` : "- 連絡先: （なし）",
    "- 送信元: アプリ内フィードバックフォーム",
    `- 受信時刻: ${new Date().toISOString()}`
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "ldk-lighting-lab-feedback"
    },
    body: JSON.stringify({ title, body: issueBody, labels: [label] })
  });

  if (!res.ok) {
    // 失敗の詳細（トークン権限・レート等）はサーバログにのみ残し、
    // クライアントには情報を漏らさない簡潔なメッセージを返す。
    const detail = await res.text();
    console.error("GitHub issue creation failed", res.status, detail);
    return json({ error: "起票に失敗しました。時間をおいて再度お試しください。" }, 502);
  }

  const created = (await res.json()) as { html_url?: string };
  return json({ ok: true, url: created.html_url });
};
