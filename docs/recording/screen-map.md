# Cube Split Timer Recording Screen Map

Base URL: `https://cube-split-timer.vercel.app/`

録画用URLでは必ず `recording=1` を付けます。既存のクエリがある場合は `&recording=1`、クエリがない場合は `?recording=1` を使います。

## 推奨Viewport

- Shorts本命: `1080x1920`, `deviceScaleFactor: 1`
- スマホ実機寄せ: `430x932`, `deviceScaleFactor: 2`
- Analyzer全画面の横向き風UIは別途調整が入っているため、通常の録画素材は非全画面の `recording=1` を優先します。

## 画面一覧

| 画面名 | 通常URL | 録画用URL | 目的 | 見せられる機能 | Playwrightで開くURL | 録画向き | 待つべき要素 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| タイマー | `/` | `/?recording=1` | 計測の入口 | タイマー、スクランブル、更新、解析導線 | `https://cube-split-timer.vercel.app/?recording=1` | ◎ | `[data-testid="recording-main-timer"]` |
| 履歴 | `/history` | `/history?recording=1` | 保存記録の一覧 | タイム、モード、スクランブル、スプリット | `https://cube-split-timer.vercel.app/history?recording=1` | ○ | `[data-testid="recording-history-page"]` |
| 記録分析 | `/analysis` | `/analysis?recording=1` | 成績の分析 | ao5、ao12、平均、ベスト、Phase Stats | `https://cube-split-timer.vercel.app/analysis?recording=1` | ◎ | `[data-testid="recording-analysis"]` |
| 練習統計 | `/practice` | `/practice?recording=1` | 練習モード別の統計 | Cross/F2L/F2L Pair統計 | `https://cube-split-timer.vercel.app/practice?recording=1` | ○ | `[data-testid="recording-practice"]` |
| Learnトップ | `/learn` | `/learn?recording=1` | 学習機能の入口 | F2L/OLL/PLL/回転記号/Practice導線 | `https://cube-split-timer.vercel.app/learn?recording=1` | ◎ | `[data-testid="recording-learn"]` |
| Learn F2L | `/learn/f2l` | `/learn/f2l?recording=1` | F2Lケース一覧 | F2Lケース画像、手順一覧 | `https://cube-split-timer.vercel.app/learn/f2l?recording=1` | ◎ | `[data-testid="recording-f2l-case-list"]` |
| Learn OLL | `/learn/oll` | `/learn/oll?recording=1` | OLLケース一覧 | OLLパターン、手順一覧 | `https://cube-split-timer.vercel.app/learn/oll?recording=1` | ○ | `[data-testid="recording-oll-case-list"]` |
| Learn PLL | `/learn/pll` | `/learn/pll?recording=1` | PLLケース一覧 | PLLパターン、手順一覧 | `https://cube-split-timer.vercel.app/learn/pll?recording=1` | ○ | `[data-testid="recording-pll-case-list"]` |
| Learn回転記号 | `/learn/notation` | `/learn/notation?recording=1` | 回転記号の説明 | 記号カード、3D単体再生 | `https://cube-split-timer.vercel.app/learn/notation?recording=1` | ◎ | `[data-testid="recording-notation-player"]` |
| Learnランダム練習 | `/learn/practice` | `/learn/practice?recording=1` | ランダム出題 | 問題、答え表示、次へ | `https://cube-split-timer.vercel.app/learn/practice?recording=1` | △ | `[data-testid="recording-learn-practice"]` |
| F2L追加候補 | `/learn/f2l-candidates` | `/learn/f2l-candidates?recording=1` | F2L候補の検証 | 候補リスト、3D確認 | `https://cube-split-timer.vercel.app/learn/f2l-candidates?recording=1` | △ | `[data-testid="recording-f2l-candidate-review"]` |
| Analyzerトップ | `/analyzer` | `/analyzer?recording=1` | 3D解析の入口 | 3Dキューブ、工程別best、再生操作 | `https://cube-split-timer.vercel.app/analyzer?recording=1` | ◎ | `[data-testid="recording-analyzer-player"]` |
| Analyzer入力 | `/analyzer/input` | `/analyzer/input?recording=1` | スクランブル/色入力 | 入力フォーム、色パレット | `https://cube-split-timer.vercel.app/analyzer/input?recording=1` | △ | `[data-testid="recording-analyzer-input"]` |
| Analyzer Cross | `/analyzer/cross` | `/analyzer/cross?recording=1` | Cross探索 | Cross候補、探索ボタン | `https://cube-split-timer.vercel.app/analyzer/cross?recording=1` | ○ | `[data-testid="recording-analyzer-cross"]` |
| Analyzer F2L | `/analyzer/f2l` | `/analyzer/f2l?recording=1` | F2L解析 | F2L best、次のF2L、ペア強調 | `https://cube-split-timer.vercel.app/analyzer/f2l?recording=1` | ◎ | `[data-testid="recording-f2l"]` |
| Analyzer OLL | `/analyzer/oll` | `/analyzer/oll?recording=1` | OLL判定 | OLL候補、Learn導線 | `https://cube-split-timer.vercel.app/analyzer/oll?recording=1` | ○ | `[data-testid="recording-oll-pll"]` |
| Analyzer PLL | `/analyzer/pll` | `/analyzer/pll?recording=1` | PLL判定 | PLL候補、Learn導線 | `https://cube-split-timer.vercel.app/analyzer/pll?recording=1` | ○ | `[data-testid="recording-pll"]` |
| その他/設定 | `/settings` | `/settings?recording=1` | 低頻度機能の入口 | テーマ、履歴、統計、練習、ヘルプ導線 | `https://cube-split-timer.vercel.app/settings?recording=1` | △ | `[data-testid="recording-more-page"]` |
| Help | `/help` | `/help?recording=1` | 使い方 | ヘルプトピック | `https://cube-split-timer.vercel.app/help?recording=1` | △ | `.help-hero` または text `Help` |
| Feedback | `/feedback` | `/feedback?recording=1` | 要望送信 | フィードバックフォーム | `https://cube-split-timer.vercel.app/feedback?recording=1` | △ | `[data-testid="recording-feedback"]` |
| Scramble Preview | `/scramble` | `/scramble?recording=1` | スクランブル確認 | 3Dプレビュー | `https://cube-split-timer.vercel.app/scramble?recording=1` | △ | `.scramble-preview-page` |

## 録画対象外にする画面

| 画面 | 理由 |
| --- | --- |
| `/login` | メール、Googleログイン、認証状態が映る可能性がある |
| `/friends`, `/friends/:id` | 個人名、フレンド情報が映る可能性がある |
| `/chat`, `/chat/:id` | メッセージや個人情報が映る可能性がある |
| `/admin` | 管理画面のため公開録画に不向き |
| `/reset-password` | 認証操作のため公開録画に不向き |

## URL付与ルール

安全な付与例:

- `/` -> `https://cube-split-timer.vercel.app/?recording=1`
- `/learn` -> `https://cube-split-timer.vercel.app/learn?recording=1`
- `/analyzer` -> `https://cube-split-timer.vercel.app/analyzer?recording=1`
- `/analyzer?scramble=R%20U%20R%27` -> `https://cube-split-timer.vercel.app/analyzer?scramble=R%20U%20R%27&recording=1`

録画自動化では、ハッシュ遷移よりURL直開きを優先してください。
