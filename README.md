# 類題メーカー

AI（Google Gemini / OpenAI / Anthropic Claude）を使って、数学や専門科目の類題と解答を LaTeX で作成し、フォルダで管理しながら、チャットで内容について質問できるデスクトップアプリです（Electron + React + TypeScript）。

## できること

| 機能 | 内容 |
|---|---|
| **API キー登録** | Gemini（無料枠あり・おすすめ）/ OpenAI / Anthropic のキーを登録すると、そのキーで使えるモデルが自動で一覧表示される。キーは OS の暗号化機能（Windows は DPAPI）で暗号化してこの PC にのみ保存 |
| **問題作成** | 分野・テーマ・自分の専門性・難易度（5段階）・問題数・元になる問題（任意）・追加の要望を入力 → 裏のプロンプトに埋め込んで AI に作成させる |
| **解答の作り方** | AI に「まず解法（solution）を最後まで書いて検算 → その最終的な答えだけを answer に書く」という順序で出力させる。**解答 LaTeX には最終的な答えのみ**を入れ、途中式は入れない |
| **保存** | 1回の作成 = 1つの問題セット（フォルダ）。`問題.tex` / `解答.tex`（lualatex でそのままコンパイル可）と `set.json`（解法メモを含む全データ）を保存 |
| **閲覧** | 数式を KaTeX で表示。解答は問題ごと / まとめて表示・非表示を切替。LaTeX のコピー、.tex を開く、ごみ箱へ移動 |
| **図の作成** | 電気回路図（circuitikz）、ベクトル図・幾何・力の図（TikZ）、関数のグラフ（pgfplots）を AI が TikZ コードで作成し、アプリ内で SVG に変換して表示（LaTeX のインストール不要）。描画に失敗した図は AI に1回だけ自動で修正を依頼。「必要なときだけ / なるべく入れる / 入れない」を選択可。`.tex` にも図がそのまま入る |
| **参考画像・資料** | 問題の写真・教科書のページ・手書きの図など（PNG / JPEG / WebP / GIF / PDF）を、選択・ドラッグ＆ドロップ・Ctrl+V の貼り付けで添付。大きな画像は自動で縮小して送信。添付した資料は問題セットの「参考資料」フォルダに保存 |
| **質問チャット** | 開いているフォルダ内の問題・解答・解法メモを AI に渡した状態で質問できる（「問1の解き方は？」「検算して」「類題をもう1問」など）。会話履歴はフォルダごとに保存 |
| **その他** | ライト / ダークモード、プロンプトの編集（設定画面） |

---

## セットアップ

必要なもの: **Node.js 22 以上**、Windows 10 / 11（.exe を作る場合）

```powershell
cd C:\path\to\ruidai-maker
npm install        # Electron 本体のダウンロードも行われます
npm run dev        # 開発モードで起動
npm run build:win  # dist\RuidaiMaker-1.0.0-setup.exe を作成
```

### Gemini の API キー（無料）を取得する

1. https://aistudio.google.com/apikey を開き、Google アカウントでログイン
2. 「API キーを作成」でキーを作成してコピー
3. アプリの「設定」→「Google Gemini」に貼り付けて「保存して接続」

無料枠には回数制限があり、入力内容が Google の製品改善に使われる場合があります。OpenAI・Anthropic の API は使った分だけ課金されます（ChatGPT / Claude の月額プランとは別です）。

---

## 保存されるファイル

ライブラリの場所は既定で `ドキュメント\類題ライブラリ`（設定で変更可）。

```
類題ライブラリ/
 └ 線形代数/                         ← 自分で作るフォルダ（分野ごとなど）
    ├ .chat.json                      ← このフォルダでのチャット履歴
    └ 20261116_固有値と対角化の演習/   ← 1回の作成 = 1セット
       ├ 問題.tex                     ← 図（TikZ）も含む
       ├ 解答.tex                     ← 最終的な答えのみ
       ├ 図1.svg, 図2.svg …          ← アプリ表示用の図
       ├ 参考資料/                    ← 作成時に添付した画像・PDF
       └ set.json                     ← 問題・解答・解法メモ（非表示）・作成条件
```

`.tex` は `ltjsarticle` を使っているので **lualatex** でコンパイルしてください。図を含む場合は `tikz`・`circuitikz`・`pgfplots` パッケージが必要です（TeX Live なら標準で入っています）。

---

## ソースの構成（`npm create @quick-start/electron` の react-ts テンプレートからの変更点）

```
src/shared/types.ts, api.ts     … 型定義
src/main/index.ts               … ウィンドウ
src/main/ipc.ts                 … 画面との通信、チャットのシステムプロンプト
src/main/prompt.ts              … 問題作成プロンプト（初期値）・出力形式の指示・JSON スキーマ・結果の検証
src/main/providers.ts           … Gemini / OpenAI / Anthropic の呼び出し（モデル一覧・構造化出力・チャットのストリーミング）
src/main/settings.ts            … 設定と API キーの暗号化保存
src/main/library.ts             … フォルダ・問題セットの保存と読み込み、チャット用の文脈作成
src/main/latex.ts               … .tex ファイルの生成
src/main/figures.ts             … TikZ → SVG 変換（node-tikzjax）
src/preload/index.ts            … 画面に公開する API
src/renderer/src/App.tsx        … 画面全体
src/renderer/src/pages/         … ライブラリ画面・設定画面
src/renderer/src/components/    … フォルダツリー、問題作成ダイアログ、問題セット表示、チャット、モデル選択
src/renderer/src/lib/MathText.tsx … LaTeX → KaTeX 表示（enumerate / itemize / \textbf なども変換）
```

追加したパッケージ:

```powershell
npm install @google/genai openai @anthropic-ai/sdk node-tikzjax
npm install -D react-markdown remark-gfm remark-math rehype-katex katex@^0.16.47 lucide-react
```

`package.json` の `postinstall` は `install-electron` のみにしています（`electron-builder install-app-deps` は不要）。

---

## 仕組みのメモ

- **途中式なしの解答**: 各 AI の「構造化出力」機能で `problem → solution → answer` の順に出力させます（Gemini は `propertyOrdering`、OpenAI は JSON Schema、Anthropic はツール呼び出し）。AI は先に solution で解いてから answer を書くので、答えだけを書かせるより正確になります。solution は画面に出さず、チャットでの説明に使います。
- **プロンプトの編集**: 設定画面で `{{field}}` などの差し込み位置を含めて編集できます。出力形式の指示（solution → answer の順、LaTeX のルール）は常に自動で付け加えられます。
- **チャットの範囲**: 開いているフォルダ直下とその1階層下の問題セットを渡します（約15万文字まで。多い場合は解法メモを省略）。問題セットを開いている場合は、そのセットを優先します。

## 注意

- AI が作る解答には誤りが含まれることがあります。重要な用途では、チャットの「検算して」や自分での確認を併用してください。
- 環境変数 `RUIDAI_BASE_GEMINI` / `RUIDAI_BASE_OPENAI` / `RUIDAI_BASE_ANTHROPIC` は開発・テスト用（接続先の差し替え）です。通常は設定不要です。

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 「利用回数の上限に達しました」 | Gemini 無料枠の制限です。時間をおくか、Flash 系など別のモデルを選んでください |
| 「サーバーが混み合っているか、一時的に停止しています（503）」 | Google などのサーバー側の一時的な混雑・障害です（キーや設定の問題ではありません）。アプリが自動で3回まで再試行します。それでも失敗する場合は、時間をおくか Flash 系のモデルを選んでください |
| 「API キーが無効か…」 | キーをコピーし直して再登録。OpenAI / Anthropic は支払い設定が必要です |
| 「このモデルは使えません」 | 無料枠で使えないモデル・廃止されたモデルです。別のモデルを選んでください |
| 図が「描画できませんでした」になる | 自動修正でも直らなかった図です。「TikZ コード」を開いてコピーし、チャットで「この図を直して」と頼むか、作り直してください |
| 図の中の文字が表示されない | 図の中では日本語が使えません（英数字と数式のみ）。プロンプトでもそう指示しています |
| 数式が赤く表示される | KaTeX が対応していない命令です。`問題.tex` を開いて修正するか、作り直してください |
| `.tex` が文字化け・コンパイルエラー | `lualatex` でコンパイルしてください（`platex` 系では動きません） |
