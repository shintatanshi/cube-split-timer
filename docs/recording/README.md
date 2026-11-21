# Recording Manifest

Cube Split Timer の YouTube Shorts 自動録画用 manifest は2か所に置きます。

## ファイルの役割

- `docs/recording/recording-manifest.json`
  - 開発者向けの原本です。
  - 録画ショットの意図、URL、待機セレクタ、操作手順をコードレビューしやすい場所に置きます。

- `public/recording/recording-manifest.json`
  - YouTube automation 側が取得する公開用JSONです。
  - Vercelへデプロイすると、次のURLで取得できます。
  - `https://cube-split-timer.vercel.app/recording/recording-manifest.json`
  - `shots` は録画素材単位、`tutorialFlows` は「Timerの解析ボタンからAnalyzerで工程再生する」ような操作手順単位です。

## 安全ルール

- manifest に env、APIキー、認証情報、秘密情報を入れないでください。
- ログイン、フレンド、チャット、Admin など個人情報が映る画面は録画対象にしないでください。
- 公開して問題ない画面録画用情報だけを入れてください。
- `recording.url` と `fallback.url` は必ず `recording=1` 付きのURLにしてください。
- `tutorialFlows[].startUrl` や `openUrl` action も必ず `recording=1` 付きのURLにしてください。

## 更新手順

1. `docs/recording/recording-manifest.json` を更新します。
2. 同じ内容を `public/recording/recording-manifest.json` に反映します。
3. `npm run recording:manifest:check` を実行します。
4. `npm run build` を実行します。
5. 公開が必要な場合だけ Vercel へデプロイします。

## 検証コマンド

```bash
npm run recording:manifest:check
```

検証内容:

- `public/recording/recording-manifest.json` が存在する
- JSONとして正しい
- `shots` が空ではない
- 各shotの `recording.url` に `recording=1` が含まれている
- 各shotの `saveAs` が設定されている
- 各shotの必須項目が揃っている
