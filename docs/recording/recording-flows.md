# Cube Split Timer Recording Flows

目的: YouTube Shorts の30秒素材として、別プロジェクトのPlaywright録画システムが迷わず撮れるショット手順を定義します。

推奨共通設定:

- Viewport: `1080x1920`
- URLには必ず `recording=1`
- `waitUntil: "networkidle"` 後、さらに 800-1200ms 待つ
- ログイン、チャット、フレンド、Admin は開かない
- クリックよりURL直開きを優先する

## Shot 1: アプリ全体紹介

- 使用秒数: 0.0-2.0秒
- 録画時間: 4秒
- 目的: ルービックキューブ練習アプリだと一瞬で伝える
- 開くURL: `https://cube-split-timer.vercel.app/?recording=1`
- 待機する要素: `[data-testid="recording-main-timer"]`
- 操作:
  1. URLを開く
  2. `[data-testid="recording-main-timer"]` を待つ
  3. 1000ms待つ
- 保存ファイル名: `shot-01-main-timer.mp4`
- 失敗時の代替画面: `https://cube-split-timer.vercel.app/learn?recording=1`
- 代替待機要素: `[data-testid="recording-learn"]`

見せ方:

- スクランブルと大きなタイマーを中心に入れる
- 下ナビやヘッダーは映ってよい
- テキスト説明より画面の雰囲気を優先

## Shot 2: タイマー操作

- 使用秒数: 2.0-8.0秒
- 録画時間: 7秒
- 目的: 実際に計測アプリであることを見せる
- 開くURL: `https://cube-split-timer.vercel.app/?recording=1`
- 待機する要素: `[data-testid="recording-timer-button"]`
- 操作:
  1. URLを開く
  2. `[data-testid="recording-timer-button"]` を待つ
  3. 800ms待つ
  4. Spaceを長押し 700ms
  5. Spaceを離す
  6. 1800ms待つ
  7. Spaceを押して停止
  8. 800ms待つ
- 保存ファイル名: `shot-02-timer-run.mp4`
- 失敗時の代替画面: `https://cube-split-timer.vercel.app/?recording=1`
- 代替操作: タイマー操作なしで2秒静止

Playwright実装メモ:

- `page.keyboard.down("Space")`
- `page.waitForTimeout(700)`
- `page.keyboard.up("Space")`
- 停止は `page.keyboard.press("Space")`
- タップ操作よりキーボード操作の方が自動化で安定しやすい

## Shot 3: 記録・統計・履歴

- 使用秒数: 8.0-18.0秒
- 録画時間: 8秒
- 目的: 練習結果を分析できる雰囲気を出す
- 推奨画面: 記録分析
- 開くURL: `https://cube-split-timer.vercel.app/analysis?recording=1`
- 待機する要素: `[data-testid="recording-analysis"]`
- 操作:
  1. URLを開く
  2. `[data-testid="recording-analysis"]` を待つ
  3. 1200ms待つ
  4. 画面中央までゆっくりスクロール
  5. 1200ms待つ
- 保存ファイル名: `shot-03-analysis-stats.mp4`
- 失敗時の代替画面: `https://cube-split-timer.vercel.app/history?recording=1`
- 代替待機要素: `[data-testid="recording-history-page"]`

見せ方:

- ao5、ao12、Best、Phase Stats を一度に入れる
- 個人履歴ではなく `recording=1` のデモデータを使う

## Shot 4: 学習・F2L

- 使用秒数: 18.0-25.0秒
- 録画時間: 7秒
- 目的: タイマーだけでなく上達用アプリであることを見せる
- 推奨画面: Learn F2L
- 開くURL: `https://cube-split-timer.vercel.app/learn/f2l?recording=1`
- 待機する要素: `[data-testid="recording-f2l-case-list"]`
- 操作:
  1. URLを開く
  2. `[data-testid="recording-f2l-case-list"]` を待つ
  3. 800ms待つ
  4. `[data-testid="recording-learn-case-button"]` の最初の要素をクリック
  5. `[data-testid="recording-algorithm-player"]` を待つ
  6. 2500ms待つ
- 保存ファイル名: `shot-04-learn-f2l.mp4`
- 失敗時の代替画面: `https://cube-split-timer.vercel.app/learn/notation?recording=1`
- 代替待機要素: `[data-testid="recording-notation-player"]`

見せ方:

- ケース画像、手順、3D再生を映す
- 細かい手順文字を読ませるより「学べる」雰囲気を優先

## Shot 5: Analyzer 3D / F2L強調

- 使用秒数: 25.0-30.0秒
- 録画時間: 6秒
- 目的: 3D解析とF2L練習支援の価値を見せる
- 推奨画面: Analyzer
- 開くURL: `https://cube-split-timer.vercel.app/analyzer?recording=1`
- 待機する要素: `[data-testid="recording-analyzer-player"]`
- 操作:
  1. URLを開く
  2. `[data-testid="recording-analyzer-player"]` を待つ
  3. `[data-testid="recording-analyzer-canvas"]` を待つ
  4. 1000ms待つ
  5. `[data-testid="recording-analyzer-playback-controls"] button[aria-label="再生"]` をクリックできる場合はクリック
  6. 3000ms待つ
- 保存ファイル名: `shot-05-analyzer-3d.mp4`
- 失敗時の代替画面: `https://cube-split-timer.vercel.app/analyzer/f2l?recording=1`
- 代替待機要素: `[data-testid="recording-f2l"]`

見せ方:

- 3Dキューブを大きく映す
- 工程別bestとF2L強調トグルが見えると、ただのタイマーではないことが伝わる

## Optional Shot: 回転記号学習

- 使いどころ: 初心者向けのShortsにしたいとき
- 開くURL: `https://cube-split-timer.vercel.app/learn/notation?recording=1`
- 待機する要素: `[data-testid="recording-notation-player"]`
- 操作: 何も押さず3Dプレイヤーを見せる、または `R` や `U` のカードをクリック
- 保存ファイル名: `shot-optional-notation.mp4`

## Optional Shot: その他ページ

- 使いどころ: 機能が整理されていることを見せたいとき
- 開くURL: `https://cube-split-timer.vercel.app/settings?recording=1`
- 待機する要素: `[data-testid="recording-more-page"]`
- 操作: 1000ms待つ
- 保存ファイル名: `shot-optional-more.mp4`

## Tutorial Flow: TimerのスクランブルからAnalyzerで工程再生

この流れは `recording-manifest.json` の `tutorialFlows[0]` に機械読み取り用JSONとしても入れています。

- 目的: タイマーで表示されたスクランブルを、スクランブルカード内の「解析」ボタンからAnalyzerへ送り、その後Cross/F2L/OLL/PLL工程を3D再生する方法を見せる
- 推奨録画時間: 12-14秒
- 開始URL: `https://cube-split-timer.vercel.app/?recording=1`
- 最初に待つ要素: `[data-testid="recording-main-timer"]`
- 重要なクリック対象:
  - TimerからAnalyzerへ: `[data-testid="recording-open-analyzer-from-scramble"]`
  - Analyzerの次のおすすめ工程: `[data-testid="recording-analyzer-phase-primary"]`
  - Cross工程: `[data-testid="recording-analyzer-phase-cross"]`
  - F2L工程: `[data-testid="recording-analyzer-phase-f2l"]`
  - OLL工程: `[data-testid="recording-analyzer-phase-oll"]`
  - PLL工程: `[data-testid="recording-analyzer-phase-pll"]`
  - 再生操作: `[data-testid="recording-analyzer-playback-controls"]`

推奨手順:

1. `https://cube-split-timer.vercel.app/?recording=1` を開く。
2. `[data-testid="recording-scramble-text"]` の文字列を読む。これがTimer側のスクランブル。
3. `[data-testid="recording-open-analyzer-from-scramble"]` をクリックする。
4. URLが `/analyzer?...&recording=1&scramble=...` になったことを確認する。
5. `[data-testid="recording-analyzer-player"]` と `[data-testid="recording-analyzer-canvas"]` を待つ。
6. `[data-testid="recording-analyzer-phase-primary"]` を押す。これが「今できる次のおすすめ工程」。
7. Crossを見せたい場合は `[data-testid="recording-analyzer-phase-cross"]` を押す。
8. F2Lを見せたい場合は `[data-testid="recording-analyzer-phase-f2l"]` を押す。
9. OLL/PLLは状態が準備できた後に `[data-testid="recording-analyzer-phase-oll"]` / `[data-testid="recording-analyzer-phase-pll"]` を押す。
10. `[data-testid="recording-analyzer-playback-controls"] button[aria-label="再生"]` で再生し、1-2秒待って3D回転を見せる。

ナレーション例:

- 「スクランブルの解析を押すと、そのままAnalyzerに送れます。」
- 「崩れた状態を3Dで確認して、CrossやF2Lを工程ごとに再生できます。」
- 「F2L強調を使うと、今入れるペアだけを見ながら練習できます。」

失敗時の代替:

- URL: `https://cube-split-timer.vercel.app/analyzer?recording=1`
- 待機: `[data-testid="recording-analyzer-player"]`
- 見せる内容: Analyzerの3Dキューブと工程別bestパネル

## 失敗時の共通代替

どのショットでも失敗した場合は以下を使います。

- URL: `https://cube-split-timer.vercel.app/?recording=1`
- 待機: `[data-testid="recording-main-timer"]`
- 保存: `fallback-main-timer.mp4`

理由: タイマー画面は最も軽く、録画モードの固定データだけで見栄えが成立します。
