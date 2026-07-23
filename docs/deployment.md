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

## 開発フロー（ブランチ運用）

1. **作業ブランチを `main` から切る**（例: `git checkout -b <作業内容がわかる名前> main`）。
   `staging` からは切らない — `staging` は「今テスト中のものを一時的に乗せる場所」であり、
   前回テスト中でまだ `main` に取り込んでいない別の変更が土台に混ざり込む可能性があるため。
   `main` は常に動作確認済みの安定した状態なので、そこを土台にするのが安全。
2. 作業ブランチで実装・コミットする。
3. `staging` にマージしてpushする → GitHub Actionsのデプロイ後、
   `https://staging.lighting-lab-46l.pages.dev/` に反映される（スマホ含め通常のURLとして確認可能）。
   実際のプレビューURLはCloudflare Pagesダッシュボードのデプロイ一覧でも確認できる。
4. 問題なければ作業ブランチを `main` にマージ/pushして本番に反映する。
5. 使い終わった作業ブランチは削除してよい。

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
