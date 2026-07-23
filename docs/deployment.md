# デプロイ環境（本番 / テスト）

Cloudflare Pages 1プロジェクト（`lighting-lab`）を、pushするブランチでProduction / Previewに分ける。

| ブランチ | Cloudflare Pages上の扱い | URL |
|---|---|---|
| `main` | Production | `https://lighting-lab-46l.pages.dev/`（本番・共有用） |
| `staging` | Preview | `https://staging.lighting-lab-46l.pages.dev/`（テスト用。スマホ含め通常のHTTPS URLとして開ける） |

`.github/workflows/deploy-cloudflare-pages.yml` が `push先ブランチ名` をそのまま
`wrangler pages deploy --branch=<ブランチ名>` に渡す。Cloudflare Pages側で
Production Branchが`main`に設定されているため、`main`以外へのpushは自動的に
Previewデプロイ（別URL・別インスタンス）になる。

## 使い方

1. 動作確認したい変更を `staging` ブランチにpush（またはそこへマージ）する。
2. GitHub Actionsのデプロイが終わると `https://staging.lighting-lab-46l.pages.dev/` に反映される。
   実際のプレビューURLはCloudflare Pagesダッシュボードのデプロイ一覧でも確認できる。
3. 問題なければ `main` にマージ/pushして本番に反映する。

## 環境ごとに分けたい設定

- **フィードバックFunctionの秘密**（`GITHUB_TOKEN` / `GITHUB_REPO`）は元々Cloudflare Pagesの
  Production/Previewで別々に設定できる（[feedback-setup.md](feedback-setup.md)参照）。
  テスト環境からのフィードバックを本番と別の宛先にしたい場合はPreview側の値を変更する。
- `VITE_APP_URL`（[marketing-plan.md](marketing-plan.md)参照）は未設定なら
  `window.location.origin`にフォールバックするため、staging/本番どちらでも
  ビルド環境変数を追加しなくてもそれぞれ正しいURLが表示される。

## 注意

- `staging`は共有の検証用ブランチ。個人の作業ブランチとは別に、動作確認したいものを
  乗せてpushする運用を想定。
- Cloudflare Pagesの無料枠・デプロイ数上限は本番と共通のプロジェクトを使うため合算される。
