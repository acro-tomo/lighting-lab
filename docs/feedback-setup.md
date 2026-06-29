# フィードバックフォーム セットアップ

アプリ右下の「💬 ご意見」フォームから送られた要望・不具合を、GitHubの
**非公開リポジトリ**にIssueとして自動起票する仕組みのセットアップ手順です。

## 仕組み

```
ブラウザ（他ユーザー） ──POST /api/feedback──▶ Cloudflare Pages Function
                                                  │ GITHUB_TOKEN（サーバ側の秘密）
                                                  ▼
                                          GitHub Issues API（Issue起票）
```

- トークンは **Cloudflare側にだけ** 置き、クライアントのバンドルには出さない。
- そのため **投稿者はGitHubアカウント不要**、リポジトリは **非公開のまま** 運用できる。
- 関連ファイル: `functions/api/feedback.ts`（サーバ）/ `src/components/FeedbackForm.tsx`（UI）。

## 1. GitHubトークンを発行

[fine-grained personal access token](https://github.com/settings/tokens?type=beta) を作成する。

- **Repository access**: Only select repositories → `acro-tomo/ldk-lighting-lab` のみ
- **Permissions** → Repository permissions:
  - **Issues**: Read and write
  - （Metadata: Read-only は自動で付与される）
- 他の権限は付けない（最小権限）。
- 有効期限は適宜（切れたら再発行して下の秘密を更新）。

> 発行したトークンはこのリポジトリにコミットしないこと。Cloudflareの秘密にのみ保存する。

## 2. Cloudflare Pages に秘密として登録

Cloudflare Pages プロジェクトの **Settings → Variables and Secrets** で登録する。

- 名前: `GITHUB_TOKEN`
- 値: 手順1のトークン
- 種別: **Secret（暗号化）**
- Production と Preview の両方に設定する

CLIで登録する場合:

```bash
npx wrangler pages secret put GITHUB_TOKEN --project-name <your-pages-project>
```

別リポジトリへ送りたい場合のみ、変数 `GITHUB_REPO`（`owner/repo` 形式）も設定する。
未設定なら `functions/api/feedback.ts` の `DEFAULT_REPO`（`acro-tomo/ldk-lighting-lab`）が使われる。

## 3. デプロイ

`functions/` 配下はCloudflare Pagesが自動でFunctionとしてデプロイするのでGit pushで反映される。
反映後、アプリ右下の「💬 ご意見」から送信すると、対象リポジトリのIssuesに
`[要望]` / `[不具合]` のタイトルで起票される（ラベルは `enhancement` / `bug`）。

## ローカル動作確認

vite単体（`npm run dev`）では `/api/feedback` が存在しないため送信は失敗する。
Functionも含めて確認するには wrangler を使う:

```bash
npm run build
GITHUB_TOKEN=*** npx wrangler pages dev dist
```

## 注意

- **スパム対策**: ハニーポット欄と文字数上限のみの最小実装。公開URLで荒らしが懸念される場合は
  [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) を前段に追加するとよい。
- **プライバシー**: フォームは個人情報を書かない前提の文言を表示している。連絡先欄は任意。
- 誠実性: このフォームは要望・不具合の受付窓口であり、実照度や帳票の保証とは無関係。
