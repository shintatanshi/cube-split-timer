# Cube Split Timer 公開手順

この手順は、現在の未完成版をいったん GitHub + Supabase + Netlify で公開し、あとから完成版を `git push` して上書き公開するためのメモです。

現在のアプリは React + Vite + TypeScript で作られています。

- 開発サーバー: `npm run dev`
- 本番ビルド: `npm run build`
- Netlify publish directory: `dist`
- Supabase接続環境変数: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

参考:

- Vite env: https://vite.dev/guide/env-and-mode
- Netlify Vite: https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security

## 1. GitHubに入れるもの・入れないもの

GitHubに入れるもの:

- `src/`
- `public/`
- `supabase/migrations/`
- `docs/`
- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `tsconfig.json`
- `.gitignore`
- `.env.example`
- `.github/workflows/deploy.yml`
- `netlify.toml`
- `DEPLOY.md`

GitHubに入れないもの:

- `node_modules/`
- `dist/`
- `.netlify/`
- `.env`
- `.env.local`
- `.env.production`
- Supabase `service_role` key
- APIキー、パスワード、秘密情報を含むファイル

このプロジェクトの `.gitignore` では、上の入れてはいけないファイルを除外しています。

`.github/workflows/deploy.yml` はGitHub Pagesへ公開するものではなく、GitHub上で `npm run build` が通るかを確認するためのワークフローです。公開本番はNetlifyを使います。

## 2. 現在のgit状態について

この作業時点では、`cube-split-timer` の親フォルダ `New project` がgit管理のルートになっています。

確認コマンド:

```bash
git rev-parse --show-toplevel
```

このアプリだけをGitHubに置きたい場合は、次のどちらかにしてください。

おすすめ: `cube-split-timer` だけを独立リポジトリにする

```bash
cd "C:\Users\chinp\OneDrive\ドキュメント\New project\cube-split-timer"
git init
git add .
git status
git commit -m "Initial public deploy setup"
```

すでに親フォルダのgitを使う場合:

```bash
cd "C:\Users\chinp\OneDrive\ドキュメント\New project"
git status
git add cube-split-timer
git status
git commit -m "Add cube split timer app"
```

親フォルダには別プロジェクトらしきファイルもあるため、間違って全部 `git add .` しないでください。

## 3. GitHubリポジトリを作る

1. GitHubを開く
2. 右上の `+` から `New repository`
3. Repository name に例として `cube-split-timer`
4. Public / Private を選ぶ
5. `Create repository`
6. 画面に出るコマンドを確認する

独立リポジトリとして作った場合の例:

```bash
cd "C:\Users\chinp\OneDrive\ドキュメント\New project\cube-split-timer"
git remote add origin https://github.com/YOUR_NAME/cube-split-timer.git
git branch -M main
git push -u origin main
```

## 4. Supabaseプロジェクトを作る

1. https://supabase.com/ を開く
2. ログインする
3. `New project`
4. Organization を選ぶ
5. Project name を入力する
6. Database password を保存しておく
7. Region は近い場所を選ぶ
8. `Create new project`
9. 作成が終わるまで待つ

## 5. SupabaseのSQLを実行する

このプロジェクトには以下のSQLを用意しています。

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_feedback_reports.sql
supabase/migrations/003_admin_access.sql
supabase/migrations/004_backfill_auth_profiles.sql
```

Supabase画面で、上から順番に実行します。

1. Supabaseのプロジェクトを開く
2. 左メニューの `SQL Editor`
3. `New query`
4. `supabase/migrations/001_initial_schema.sql` の中身を全部コピー
5. SQL Editorに貼り付け
6. `Run`
7. もう一度 `New query`
8. `supabase/migrations/002_feedback_reports.sql` の中身を全部コピー
9. SQL Editorに貼り付け
10. `Run`
11. もう一度 `New query`
12. `supabase/migrations/003_admin_access.sql` の中身を全部コピー
13. SQL Editorに貼り付け
14. `Run`
15. もう一度 `New query`
16. `supabase/migrations/004_backfill_auth_profiles.sql` の中身を全部コピー
17. SQL Editorに貼り付け
18. `Run`

作成されるテーブル:

- `profiles`
- `solve_sessions`
- `feedback_reports`

有効になるもの:

- Row Level Security
- 自分のプロフィールだけ読める・更新できるポリシー
- 自分の記録だけ読める・追加できる・更新できるポリシー
- サイト利用者が意見箱へ匿名投稿できるポリシー
- 管理者だけが全ユーザーのメールアドレス、クラウド履歴、意見箱を読めるポリシー
- 管理者だけが他ユーザーへ管理者権限を付与・解除できるポリシー
- 新規ユーザー作成時に `profiles` を作るトリガー
- 既存のSupabase Authユーザーを `profiles` に補完するバックフィル

最初の管理者だけは、SupabaseのSQL Editorで手動設定します。

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL@example.com';
```

パスワードはSupabase Authから平文取得できません。管理者画面ではパスワード表示ではなく、
ユーザーへパスワード再設定メールを送信します。

意見箱の内容を見る場所:

1. Supabaseのプロジェクトを開く
2. 左メニューの `Table Editor`
3. `feedback_reports` を開く
4. `created_at` が新しい行を確認する

公開サイト側からは投稿だけでき、通常ユーザーが一覧を読むことはできません。

## 6. Supabase URL と anon key の確認場所

1. Supabaseプロジェクトを開く
2. 左下付近の `Project Settings`
3. `Data API` または `API`
4. `Project URL` をコピー
5. `anon public` key をコピー

絶対に使わないもの:

- `service_role` key

`service_role` key は管理者用で、フロントエンドやGitHub、Netlifyの通常環境変数に入れないでください。

## 7. ローカルの .env.local を作る

`.env.example` を参考に、`.env.local` を作ります。

```bash
copy .env.example .env.local
```

`.env.local` の中身を自分のSupabase情報に変えます。

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

`.env.local` はGitHubに入れません。

## 8. ローカルでビルド確認する

GitHubやNetlifyへ行く前に、必ずローカルで確認します。

```bash
npm install
npm run build
```

成功すると `dist/` が作られます。

`dist/` はNetlifyが自動生成するため、GitHubには入れません。

## 9. Netlifyで公開する

1. https://www.netlify.com/ を開く
2. ログインする
3. `Add new site`
4. `Import an existing project`
5. GitHubを選ぶ
6. GitHubリポジトリを選ぶ
7. Build settings を確認する

Viteの場合:

```text
Build command: npm run build
Publish directory: dist
```

このプロジェクトには `netlify.toml` があるので、基本的には自動でこの設定が使われます。

## 10. Netlifyの環境変数を設定する

Netlifyのサイト設定で:

1. `Site configuration`
2. `Environment variables`
3. `Add a variable`
4. 以下を追加

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

値はSupabaseのProject URLとanon public keyです。

追加したら、再デプロイします。

## 11. GitHubへpushするとNetlifyが自動更新される流れ

1. ローカルでコードを変更する
2. `npm run build` で確認
3. gitに追加してcommit
4. GitHubへpush
5. Netlifyが自動でbuild
6. 公開サイトが上書きされる

例:

```bash
git status
git add .
git commit -m "Update analyzer features"
git push
```

未完成版を先に公開しても大丈夫です。
あとからF2L / OLL / PLLなどを完成させてpushすれば、Netlify上の公開版も上書きされます。

## 12. よくあるエラーと対処法

### 環境変数が読み込めない

原因:

- `.env.local` の名前が違う
- `VITE_` が付いていない
- dev serverを再起動していない

対処:

```bash
npm run dev
```

を止めて、もう一度起動してください。

### Supabaseに接続できない

原因:

- `VITE_SUPABASE_URL` が間違っている
- `VITE_SUPABASE_ANON_KEY` が間違っている
- Netlifyに環境変数を入れていない

対処:

- SupabaseのProject SettingsでURLとanon keyを再確認
- NetlifyのEnvironment variablesを確認
- 変更後にNetlifyで再デプロイ

### Netlifyでビルド失敗

原因:

- `npm run build` がローカルでも失敗している
- Nodeのバージョンが合わない
- 環境変数が不足している

対処:

```bash
npm install
npm run build
```

をローカルで実行し、先にエラーを直してください。
このプロジェクトでは `netlify.toml` で Node 20 を指定しています。

### RLSで保存できない

原因:

- ログインしていない
- SQL migrationを実行していない
- `user_id` がログイン中ユーザーのIDと違う

対処:

- Supabase Authでログインできているか確認
- `supabase/migrations/001_initial_schema.sql` を実行したか確認
- 保存時に `auth.getUser()` のユーザーIDを使っているか確認

### distが見つからない

原因:

- build commandが違う
- publish directoryが違う
- `npm run build` が失敗している

対処:

Netlify設定を以下にします。

```text
Build command: npm run build
Publish directory: dist
```

## 13. ログインUIと保存関数

現在はメール/パスワードのログイン画面、ログアウト、端末内履歴の書き出し/読み込み、
ログイン中の `solve_sessions` 保存、管理者画面、パスワード再設定画面を実装しています。

関連ファイル:

- `src/lib/supabase.ts`
- `src/lib/auth.ts`
- `src/lib/admin.ts`
- `src/lib/solveSessions.ts`
- `src/App.tsx`
- `src/admin/AdminPage.tsx`

主な関数:

- `signInWithEmail()`
- `signUpWithEmail()`
- `signOutCurrentUser()`
- `requestPasswordResetEmail()`
- `updateCurrentUserPassword()`
- `getAdminProfiles()`
- `updateProfileRole()`
- `getAdminSolveSessions()`
- `saveSolveSession()`
- `getMySolveSessions()`
- `softDeleteSolveSession()`

`softDeleteSolveSession()` は完全削除ではなく、`is_deleted = true` にします。

現時点のクラウド保存は、ログイン中に新しく保存した記録と、Account画面またはログイン時に
この端末の未削除ローカル履歴をアップロードする構成です。タイマー中はSupabase通信を行いません。

### Googleログインを有効にする

アプリ側にはGoogleログインボタンを実装していますが、公開先で使うにはSupabaseとGoogle Cloud側の設定が必要です。

1. Google Cloud ConsoleでOAuth clientを作成する
2. Authorized redirect URIsにSupabaseのcallback URLを追加する

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

3. Supabase Dashboardを開く
4. Authentication > Providers > Google を有効にする
5. Google CloudのClient IDとClient Secretを入力する
6. Authentication > URL Configuration のRedirect URLsに公開URLとローカルURLを追加する

```text
http://localhost:5173/login
https://YOUR_PUBLIC_DOMAIN/login
```

`YOUR_PUBLIC_DOMAIN` はVercelやNetlifyで実際に公開しているドメインに置き換えてください。
service_role keyやGoogle Client Secretはフロントエンド、`.env.local`、Vercelの公開環境変数には置かないでください。
