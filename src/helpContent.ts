export interface HelpTopic {
  id: string;
  title: string;
  intro: string;
  points: string[];
  note?: string;
}

export const TUTORIAL_STEPS = [
  "通常タイマーは画面またはSpaceを押し続け、緑になってから離すと開始します。",
  "計測中は画面タップまたはSpaceを押した瞬間に停止します。CFOP Splitでは同じ操作で各フェーズを記録します。",
  "ミスった記録は「保存しない」か履歴のDeleteでsoft deleteできます。平均には入りません。",
  "ホーム画面に追加すると、対応環境ではブラウザUIが減ったPWAとして使えます。",
];

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "overview",
    title: "このアプリでできること",
    intro: "Cube Split Timerは、3x3の練習をローカル保存中心で軽く続けられるタイマーです。",
    points: [
      "通常タイマー、CFOP Split、Cross Practice、F2L Practice、F2L Pair Splitを使えます。",
      "履歴、+2、DNF、soft delete、ao5 / ao12 / ao50 / ao100、フェーズ分析に対応しています。",
      "未ログインでもlocalStorageへ保存できます。ログイン中は停止後にアカウントへも保存します。",
      "タイマー中に通信や重い解析は行いません。",
      "Share機能で直前の記録、履歴、今日のまとめを共有できます。",
    ],
  },
  {
    id: "normal",
    title: "通常タイマーの使い方",
    intro: "Normalモードは、普通のスピードキューブ用タイマーです。",
    points: [
      "開始前は画面中央のタイマー、またはSpaceキーを押し続けます。赤から緑に変わったら離すと開始します。",
      "緑になる前に離した場合は開始しません。計測中はタップまたはSpace keydownで即停止します。",
      "Newボタンでスクランブルを更新できます。",
      "停止した記録は自動保存され、履歴と平均に反映されます。",
    ],
  },
  {
    id: "cfop",
    title: "CFOP Split Modeの使い方",
    intro: "CFOP Splitは、1回のソルブを工程ごとに分けて測るモードです。",
    points: [
      "CFOP Splitを選び、画面またはSpaceを押し続けて緑になったら離してスタートします。",
      "計測中は押した瞬間にCross、F2L、OLL、PLLを順番に記録して停止します。",
      "Cross / F2L / OLL / PLLの平均、最速、最遅をAnalysisで確認できます。",
      "苦手フェーズは、各フェーズ平均の中で一番遅い工程を表示しています。",
    ],
  },
  {
    id: "practice",
    title: "Cross / F2L Practiceの使い方",
    intro: "Practice系モードは、特定の工程だけを短く反復するためのモードです。",
    points: [
      "Cross Practiceは、スタート後にCrossが終わったタイミングで停止します。",
      "F2L Practiceは、F2Lだけを測りたい時に使います。",
      "F2L Pair Splitは、Pair 1からPair 4までを順番に記録します。",
      "各Practiceの平均、best、ao5、ao12、専用履歴をPractice欄で見られます。",
    ],
  },
  {
    id: "penalty-delete",
    title: "+2 / DNF / 保存しない / 削除",
    intro: "測定ミスやペナルティを、あとから扱えるようにしています。",
    points: [
      "+2は合計タイムに2秒を足して、平均やShareにも反映します。",
      "DNFはTotalをDNFとして扱います。aoではDNF数に応じてDNFになります。",
      "停止直後の「保存しない」は、その記録にdeletedAtを入れて非表示にします。",
      "履歴のDeleteも完全削除ではなくsoft deleteです。元に戻すボタンで復元できます。",
    ],
  },
  {
    id: "soft-delete",
    title: "soft deleteと平均の関係",
    intro: "削除済みの記録は残しつつ、普段の集計からは外します。",
    points: [
      "deletedAtが入った記録は通常履歴に表示しません。",
      "average、ao5、ao12、ao50、ao100、best、worst、グラフから除外します。",
      "CFOPフェーズ平均やPractice平均にも削除済み記録は入りません。",
      "管理者画面では、Supabaseに保存済みの削除済み記録も確認できます。",
    ],
  },
  {
    id: "share",
    title: "Share機能の使い方",
    intro: "記録を友達に送るためのテキスト共有機能です。",
    points: [
      "停止直後のShareで直前のソルブを共有できます。",
      "Historyの各記録にもShareボタンがあります。",
      "Analysisの「今日のまとめ共有」で、その日の記録数、平均、best、ao5、ao12を共有できます。",
      "Web Share APIに対応していない環境では、共有テキストをクリップボードにコピーします。",
    ],
  },
  {
    id: "pwa",
    title: "PWAとしてホーム画面に追加する方法",
    intro: "ホーム画面に追加すると、対応環境ではURLバーなどが減ったアプリ風の画面で開けます。",
    points: [
      "iPhoneではSafariで開き、共有ボタンから「ホーム画面に追加」を選びます。",
      "Android Chromeではメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。",
      "ホーム画面のアイコンから起動した時だけ、standalone表示としてブラウザ感が減ります。",
      "SafariやChromeの普通のタブ内では、Webページ側からURLバーを完全に消すことはできません。",
    ],
    note: "GeForce NOWのiOS版に近づけるため、standalone指定、iOSメタタグ、safe-area対応、オフラインキャッシュを入れています。ただしiOSの制約で、ホーム画面追加前のSafariタブを完全なアプリ表示にすることはできません。",
  },
  {
    id: "future-account",
    title: "ログインとSupabase同期について",
    intro: "Supabaseを設定した環境では、メール/パスワードまたはGoogleアカウントでログインできます。",
    points: [
      "未ログインでもタイマーと端末内履歴は今まで通り使えます。",
      "Googleログインを使うには、公開先のSupabaseプロジェクトでGoogle providerを有効にしておく必要があります。",
      "ログイン後のAccount画面から、既存のメール/パスワードアカウントにGoogleアカウントを後から連携できます。",
      "ログイン中に保存した記録は、localStorageへ保存したあとSupabaseのsolve_sessionsにも保存します。",
      "ログイン時には、この端末にある未削除のローカル履歴もアカウントへアップロードします。",
      "Account画面では、端末内履歴の書き出し、別端末からの読み込み、アカウントへの手動保存ができます。",
      "タイマー中は通信せず、停止後またはAccount画面の操作時だけ同期します。",
      "service_role keyはフロントエンドに置かない方針です。",
      "管理者は管理者画面でユーザーのメールアドレス、クラウド保存済み履歴、権限を確認できます。",
      "パスワードは管理者にも表示せず、必要な場合は再設定メールを送ります。",
    ],
  },
  {
    id: "future-social",
    title: "フレンドと週間ランキングについて",
    intro: "フレンド、プロフィール、週間ランキングは将来Phaseの機能です。",
    points: [
      "現在はログインと記録保存が中心で、フレンド画面やランキング画面はまだ追加していません。",
      "将来はフレンド内の週間best、ao5、ソルブ数、成長ランキングを作る予定です。",
      "ランキングは削除済み記録を除外し、必要な期間の記録だけ取得する設計にします。",
      "タイマー画面が重くならないように、ランキングは専用ページでだけ読み込む予定です。",
    ],
  },
  {
    id: "faq",
    title: "よくある質問",
    intro: "迷いやすいところをまとめています。",
    points: [
      "記録が消えたように見える時は、別ブラウザや別端末で開いていないか確認してください。端末内履歴はAccount画面から書き出し/読み込みできます。",
      "Spaceでページがスクロールしないよう、タイマー操作中はpreventDefaultしています。",
      "PWAは一度オンラインで開いてキャッシュされると、オフラインでも保存済み履歴を見られます。",
      "Helpボタンは各主要セクションにあります。計測中は誤操作防止のため表示しません。",
    ],
  },
];
