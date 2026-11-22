# Cube Split Timer Recording Selectors

この資料は Playwright で録画を安定させるためのセレクタ一覧です。`data-testid` があるものを優先し、ない場合だけテキストやclassを使ってください。

## 基本方針

1. URL直開きを優先する
2. `recording=1` を必ず付ける
3. `data-testid` を待機対象にする
4. クリックは必要最小限にする
5. ログイン、フレンド、チャット、Admin は開かない

## 追加済み data-testid

| セレクタ | 画面 | 用途 |
| --- | --- | --- |
| `[data-testid="recording-timer-page"]` | `/` | タイマー画面全体 |
| `[data-testid="recording-main-timer"]` | `/` | タイマー中心パネル |
| `[data-testid="recording-scramble"]` | `/` | スクランブルカード |
| `[data-testid="recording-scramble-text"]` | `/` | スクランブル文字列 |
| `[data-testid="recording-open-analyzer-primary"]` | `/` | タイマー上部の解析するボタン |
| `[data-testid="recording-open-analyzer-from-scramble"]` | `/` | スクランブルカード内の解析ボタン |
| `[data-testid="recording-timer-button"]` | `/` | タイマー開始/停止対象 |
| `[data-testid="recording-timer-stats"]` | `/` | タイマー下の簡易統計 |
| `[data-testid="recording-split-panel"]` | `/` | タイマー横の履歴/統計パネル |
| `[data-testid="recording-history"]` | `/`, `/history` | 履歴パネルまたは履歴一覧 |
| `[data-testid="recording-stats"]` | `/` | タイマー内Statsパネル |
| `[data-testid="recording-history-page"]` | `/history` | 履歴ページ全体 |
| `[data-testid="recording-analysis-page"]` | `/analysis` | 分析ページ全体 |
| `[data-testid="recording-analysis-quick-stats"]` | `/analysis` | ao5/ao12カード |
| `[data-testid="recording-analysis-summary"]` | `/analysis` | 主要統計カード |
| `[data-testid="recording-analysis"]` | `/analysis` | 分析本文 |
| `[data-testid="recording-practice-page"]` | `/practice` | 練習統計ページ全体 |
| `[data-testid="recording-practice"]` | `/practice` | 練習統計本文 |
| `[data-testid="recording-more-page"]` | `/settings` | その他/設定画面 |
| `[data-testid="recording-theme-settings"]` | `/settings` | テーマ設定 |
| `[data-testid="recording-feedback-page"]` | `/feedback` | Feedbackページ全体 |
| `[data-testid="recording-feedback"]` | `/feedback` | Feedbackフォーム |
| `[data-testid="recording-learn"]` | `/learn...` | Learnページ全体 |
| `[data-testid="recording-learn-tabs"]` | `/learn...` | Learnタブ |
| `[data-testid="recording-learn-hero"]` | `/learn` | Learnトップの説明 |
| `[data-testid="recording-learn-categories"]` | `/learn` | 学習カテゴリカード |
| `[data-testid="recording-f2l"]` | `/learn/f2l`, `/analyzer/f2l` | F2Lセクション。URLで区別する |
| `[data-testid="recording-f2l-case-list"]` | `/learn/f2l` | F2Lケース一覧 |
| `[data-testid="recording-oll"]` | `/learn/oll` | OLLセクション |
| `[data-testid="recording-oll-case-list"]` | `/learn/oll` | OLLケース一覧 |
| `[data-testid="recording-pll"]` | `/learn/pll`, `/analyzer/pll` | PLLセクション。URLで区別する |
| `[data-testid="recording-pll-case-list"]` | `/learn/pll` | PLLケース一覧 |
| `[data-testid="recording-learn-case-button"]` | `/learn/f2l`, `/learn/oll`, `/learn/pll` | ケース詳細を開くボタン |
| `[data-testid="recording-learn-detail"]` | `/learn/:category/:case` | Learn詳細ページ |
| `[data-testid="recording-learn-case"]` | `/learn/:category/:case` | Learn詳細カード |
| `[data-testid="recording-algorithm-player"]` | Learn詳細、Notation、F2L候補 | 3D手順プレイヤー |
| `[data-testid="recording-notation"]` | `/learn/notation` | 回転記号説明 |
| `[data-testid="recording-notation-player"]` | `/learn/notation` | 回転記号3Dプレイヤー領域 |
| `[data-testid="recording-learn-practice"]` | `/learn/practice` | Learnランダム練習 |
| `[data-testid="recording-f2l-candidates"]` | `/learn/f2l-candidates` | F2L候補概要 |
| `[data-testid="recording-f2l-candidate-review"]` | `/learn/f2l-candidates` | F2L候補レビュー本文 |
| `[data-testid="recording-analyzer"]` | `/analyzer...` | Analyzerページ全体 |
| `[data-testid="recording-analyzer-actions"]` | `/analyzer...` | Analyzer上部アクション |
| `[data-testid="recording-analyzer-input"]` | `/analyzer/input` | Analyzer入力領域 |
| `[data-testid="recording-analyzer-cross"]` | `/analyzer/cross` | Cross探索領域 |
| `[data-testid="recording-analyzer-player"]` | `/analyzer...` | 3D再生パネル |
| `[data-testid="recording-analyzer-player-actions"]` | `/analyzer...` | Speed/Size/F2L強調/全画面 |
| `[data-testid="recording-analyzer-canvas"]` | `/analyzer...` | 3D canvas枠 |
| `[data-testid="recording-analyzer-phase-panel"]` | `/analyzer...` | 工程別bestパネル |
| `[data-testid="recording-analyzer-phase-primary"]` | `/analyzer...` | 次のおすすめ工程を再生するボタン |
| `[data-testid="recording-analyzer-phase-cross"]` | `/analyzer...` | Cross工程ボタン |
| `[data-testid="recording-analyzer-phase-f2l"]` | `/analyzer...` | F2L工程ボタン |
| `[data-testid="recording-analyzer-phase-oll"]` | `/analyzer...` | OLL工程ボタン |
| `[data-testid="recording-analyzer-phase-pll"]` | `/analyzer...` | PLL工程ボタン |
| `[data-testid="recording-analyzer-previous-step"]` | `/analyzer...` | 前ステップ練習ボタン |
| `[data-testid="recording-analyzer-playback-controls"]` | `/analyzer...` | 再生/戻る/進む |
| `[data-testid="recording-oll-pll"]` | `/analyzer/oll` | Analyzer OLL候補 |

注意: `recording-f2l` と `recording-pll` は Learn と Analyzer の両方で使われる場合があります。録画自動化ではURLとセットで判定してください。

## クリック対象

| 操作 | 推奨セレクタ | メモ |
| --- | --- | --- |
| タイマー開始準備 | `[data-testid="recording-timer-button"]` | PlaywrightではクリックよりSpace長押しが安定 |
| タイマー開始/停止 | `keyboard.down("Space")` -> wait -> `keyboard.up("Space")` -> `keyboard.press("Space")` | 700ms以上押す |
| Learnケースを開く | `[data-testid="recording-learn-case-button"]` の最初 | F2L/OLL/PLL一覧で使える |
| Learn再生 | `[data-testid="recording-algorithm-player"] button` | ボタン文字やaria-labelに依存する場合がある |
| TimerからAnalyzerへ送る | `[data-testid="recording-open-analyzer-from-scramble"]` | スクランブルカード内の解析ボタン。URLに `scramble=` と `recording=1` が付く |
| 次のおすすめ工程を再生 | `[data-testid="recording-analyzer-phase-primary"]` | Cross/F2L/OLL/PLLのうち今進める工程を大きいボタンで再生 |
| Cross工程を再生 | `[data-testid="recording-analyzer-phase-cross"]` | 押せる場合にCross bestを3D再生 |
| F2L工程を再生 | `[data-testid="recording-analyzer-phase-f2l"]` | Cross後にF2L bestや次のF2Lを確認 |
| OLL工程を再生 | `[data-testid="recording-analyzer-phase-oll"]` | F2L後にOLL候補を確認 |
| PLL工程を再生 | `[data-testid="recording-analyzer-phase-pll"]` | OLL後にPLL候補を確認 |
| Analyzer再生 | `[data-testid="recording-analyzer-playback-controls"] button[aria-label="再生"]` | 完了後はaria-labelが変わることがある |
| Analyzer全画面 | `.analyzer-fullscreen-button` | iOS/PWAの横向き疑似UIが絡むので通常録画では非推奨 |
| F2L強調 | `.analyzer-f2l-highlight-toggle input` | `recording=1`でも表示される |

## 待機対象

| 画面 | waitFor selector | fallback text |
| --- | --- | --- |
| タイマー | `[data-testid="recording-main-timer"]` | `計測`, `スクランブル`, `0.000` |
| 履歴 | `[data-testid="recording-history-page"]` | `履歴`, `最新100件` |
| 分析 | `[data-testid="recording-analysis"]` | `記録分析`, `今日のまとめ`, `段階ごとの統計` |
| Learn | `[data-testid="recording-learn"]` | `学ぶ`, `F2L`, `OLL`, `PLL` |
| Learn F2L | `[data-testid="recording-f2l-case-list"]` | `F2L一覧`, `F2L` |
| Learn詳細 | `[data-testid="recording-algorithm-player"]` | `教材3D再生`, `手順` |
| Analyzer | `[data-testid="recording-analyzer-player"]` | `3D再生`, `F2L強調`, `工程別best` |
| Analyzer Canvas | `[data-testid="recording-analyzer-canvas"] canvas` | `3D cube preview` |
| Feedback | `[data-testid="recording-feedback"]` | `意見箱`, `ご意見` |

## URL直開き推奨画面

クリックで移動するより、以下はURL直開きが安定します。

- `https://cube-split-timer.vercel.app/?recording=1`
- `https://cube-split-timer.vercel.app/analysis?recording=1`
- `https://cube-split-timer.vercel.app/history?recording=1`
- `https://cube-split-timer.vercel.app/learn?recording=1`
- `https://cube-split-timer.vercel.app/learn/f2l?recording=1`
- `https://cube-split-timer.vercel.app/learn/notation?recording=1`
- `https://cube-split-timer.vercel.app/analyzer?recording=1`
- `https://cube-split-timer.vercel.app/analyzer/f2l?recording=1`

## 今後追加するとさらに良い data-testid

現在の録画には十分ですが、将来的に細かい自動操作をするなら以下を追加するとより安定します。

- `data-testid="recording-analyzer-play-button"`: Analyzerの再生ボタン単体
- `data-testid="recording-analyzer-next-f2l"`: 次のF2Lボタン
- `data-testid="recording-analyzer-previous-step"`: 前ステップボタン
- `data-testid="recording-learn-play-button"`: Learnの再生ボタン単体
- `data-testid="recording-more-history-link"`: その他から履歴へ行くボタン
- `data-testid="recording-more-analysis-link"`: その他から分析へ行くボタン

## 避けるセレクタ

- CSSの深い構造指定: `.foo > div:nth-child(2) > button`
- ランダムなテキストやタイム値
- ログインユーザー名
- Supabaseや環境設定に関わる表示
- フレンド/チャットの未読数

録画では「画面判定はdata-testid、演出はURL直開き」が最も安全です。
