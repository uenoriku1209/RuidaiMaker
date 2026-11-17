import type { FigureMode, GenerateRequest, ProblemItem } from '../shared/types'
import { wrapBareMath } from '../shared/latexFix'
import { normalizeFigure } from './figures'

export const DIFFICULTY_LABELS = ['', '基礎', 'やや易', '標準', 'やや難', '難関']

/**
 * 問題作成のプロンプト (設定画面で編集できる部分)。
 * {{...}} は入力内容に置き換えられる。
 */
export const DEFAULT_TEMPLATE = `あなたは試験の作成者です。以下の条件に合った問題を LaTeX を使用して作成してください。

# 条件
- 分野: {{field}}
- 出題範囲・テーマ: {{topic}}
- 解答者の専門性・レベル: {{expertise}}
- 難易度: {{difficulty}}（5段階中 {{level}}）
- 問題数: {{count}}
{{reference}}
{{notes}}

# 作成ルール
- 各問題は、それだけで解ける自己完結した問題にする（図が必要な場合は図も作成する）。
- 解答者のレベルと難易度に合わせ、試験として妥当な分量・設定にする。
- 答えが一意に定まるよう、条件・定義・求めるものを明確に書く。
- 既存の試験問題や教科書の問題をそのまま写さず、新しく作成する。
- 数式は LaTeX で書く。文中の数式は $...$、独立した数式は \\[ ... \\] を使う。`

/** 以前の初期値 (保存済みの設定がこれと同じなら新しい初期値に置き換える) */
export const LEGACY_TEMPLATES = [
  DEFAULT_TEMPLATE.replace('（図が必要な場合は図も作成する）。', '。図が必要な問題は作らない。')
]

/** 出力形式についての指示 (編集不可・常に付ける) */
const OUTPUT_RULES = `# 出力形式（厳守）
- 各問題について、まず solution に問題を最後まで解いた過程を書き、検算して答えを確定させてから、その最終的な答えだけを answer に書く。
- answer には途中式・説明・理由を一切含めず、最終的な答え（値・式・結論）だけを LaTeX で書く。小問がある場合は (1) ... (2) ... のように答えだけを並べる。
- problem / solution / answer はいずれも LaTeX の本文のみ（\\documentclass や \\begin{document} は書かない）。
- 数式・記号・変数は 1 文字であっても必ず $...$（独立した式は \\[ ... \\]）で囲む。answer が数式だけの場合も $...$ で囲む。
  良い例: $\\sqrt{2}\\left(\\cos\\frac{\\pi}{4} + i\\sin\\frac{\\pi}{4}\\right)$
  悪い例: \\sqrt{2}\\left(\\cos\\frac{\\pi}{4} + i\\sin\\frac{\\pi}{4}\\right)
- 使ってよい環境は enumerate / itemize / aligned / cases / pmatrix / bmatrix / vmatrix のみ。align や equation は使わず \\[ \\begin{aligned} ... \\end{aligned} \\] を使う。
- title には問題セット全体を表す短い日本語のタイトル（20文字以内）を書く。`

const FIGURE_RULES = `# 図（figure）のルール
- figure には問題文に添える図の TikZ コードを書く。図が不要な問題では figure を空文字列にする。
- \\begin{tikzpicture} ... \\end{tikzpicture} または \\begin{circuitikz} ... \\end{circuitikz} の環境だけを書く（\\documentclass・\\usepackage・\\begin{document} は書かない）。
- 使えるもの: TikZ（ライブラリ arrows.meta, calc, angles, quotes, positioning, decorations.markings, patterns）、circuitikz（電気回路図）、pgfplots（グラフ）、amsmath。それ以外のパッケージは使わない。
- 電気回路図は circuitikz、ベクトル図・幾何・力の図は TikZ、関数のグラフは pgfplots の axis 環境で描く。
- 図の中の文字は英数字と数式（$R_1$, $\\vec{F}$, $\\theta$ など）だけにし、日本語は使わない。
- 図は問題文と矛盾しないようにし、問題文で図の記号（$R_1$ など）を参照する。答えそのものを図に書き込まない。
- 大きさは横 8cm 程度までに収める。`

const FIGURE_MODE_TEXT: Record<FigureMode, string> = {
  auto: '- 回路・ベクトル・幾何・グラフなど、図があると問題が明確になる場合だけ図を作成する。',
  prefer: '- できるだけ各問題に図を作成する（図が意味をなさない問題は除く）。',
  none: '- 図は作成しない。figure はすべて空文字列にする。図がなくても解ける問題にする。'
}

export function buildPrompt(template: string, r: GenerateRequest): string {
  const level = Math.max(1, Math.min(5, Math.round(r.difficulty)))
  const reference = r.reference.trim()
    ? `\n# 元になる問題（この問題の類題を作成する。数値や設定を変え、同じ考え方で解ける問題にする）\n${r.reference.trim()}\n`
    : ''
  const notes = r.notes.trim() ? `\n# 追加の要望\n${r.notes.trim()}\n` : ''
  const filled = template
    .replaceAll('{{field}}', r.field.trim() || '（指定なし）')
    .replaceAll('{{topic}}', r.topic.trim() || '（分野全般）')
    .replaceAll('{{expertise}}', r.expertise.trim() || '（指定なし）')
    .replaceAll('{{difficulty}}', DIFFICULTY_LABELS[level])
    .replaceAll('{{level}}', String(level))
    .replaceAll('{{count}}', String(r.count))
    .replaceAll('{{reference}}', reference)
    .replaceAll('{{notes}}', notes)
  const attachments = r.attachments?.length
    ? `\n# 添付の参考資料\n添付した ${r.attachments.length} 件の資料（画像・PDF）の内容を踏まえて作成する。資料に問題が含まれる場合は、その類題（数値や設定を変え、同じ考え方で解ける問題）を作成する。資料の問題をそのまま写さない。\n`
    : ''
  const figure =
    r.figureMode === 'none'
      ? `# 図（figure）のルール\n${FIGURE_MODE_TEXT.none}`
      : `${FIGURE_RULES}\n${FIGURE_MODE_TEXT[r.figureMode ?? 'auto']}`
  return `${filled.trim()}\n${attachments}\n${OUTPUT_RULES}\n\n${figure}`
}

/** 出力の JSON スキーマ。solution → answer の順で書かせる */
export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '問題セットの短いタイトル' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          problem: { type: 'string', description: '問題文 (LaTeX)' },
          figure: {
            type: 'string',
            description: '問題に添える図の TikZ / circuitikz コード。不要なら空文字列'
          },
          solution: {
            type: 'string',
            description: '最後まで解いた過程と検算 (LaTeX)。利用者には表示しない'
          },
          answer: { type: 'string', description: '最終的な答えのみ (LaTeX)。途中式なし' }
        },
        required: ['problem', 'figure', 'solution', 'answer'],
        additionalProperties: false
      }
    }
  },
  required: ['title', 'problems'],
  additionalProperties: false
} as const

export interface GenerateResult {
  title: string
  problems: ProblemItem[]
}

/** モデルの出力 (JSON 文字列) を検証して取り出す */
export function parseResult(raw: unknown): GenerateResult {
  let data = raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    // ```json ... ``` で囲まれている場合にも対応
    const body = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start < 0 || end < 0)
      throw new Error('AI の出力を読み取れませんでした（JSON がありません）')
    try {
      data = JSON.parse(body.slice(start, end + 1))
    } catch {
      throw new Error(
        'AI の出力を読み取れませんでした（JSON の形式が不正です）。もう一度お試しください'
      )
    }
  }
  const d = data as { title?: unknown; problems?: unknown }
  if (!d || !Array.isArray(d.problems) || d.problems.length === 0) {
    throw new Error('AI の出力に問題が含まれていませんでした。もう一度お試しください')
  }
  const problems = d.problems.map((p: Record<string, unknown>) => ({
    problem: wrapBareMath(String(p?.problem ?? '').trim()),
    figure: normalizeFigure(String(p?.figure ?? '')),
    solution: wrapBareMath(String(p?.solution ?? '').trim()),
    answer: wrapBareMath(String(p?.answer ?? '').trim())
  }))
  if (problems.some((p) => !p.problem || !p.answer)) {
    throw new Error('問題文または解答が空のものがありました。もう一度お試しください')
  }
  return { title: String(d.title ?? '').trim() || '問題セット', problems }
}
