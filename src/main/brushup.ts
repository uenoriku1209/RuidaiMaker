// 図の自動修正 (コンパイルエラー) とブラッシュアップ (描いた図を AI に見せて改善させる)
import { compileFigure, normalizeFigure } from './figures'
import { svgToPngBase64 } from './figureImage'
import { generateText } from './providers'
import { FIGURE_GUIDE } from './prompt'
import type { CircuitStyle, ModelInfo } from '../shared/types'

const STYLE_TEXT: Record<CircuitStyle, string> = {
  jis: 'JIS（抵抗は長方形）',
  us: '米国式（抵抗はジグザグ）'
}

function repairPrompt(code: string, error: string): string {
  return `次の TikZ コードは、LaTeX でコンパイルするとエラーになります。エラーを修正したコードだけを出力してください。説明や \`\`\` は書かないでください。

# 守ること
${FIGURE_GUIDE}
- 図の内容（形・記号・値）は変えない。

# エラー
${error}

# コード
${code}`
}

function reviewPrompt(
  problem: string,
  code: string,
  instruction: string,
  style: CircuitStyle
): string {
  return `あなたは理工系の試験問題の図を仕上げる専門家です。添付画像は、下の TikZ コードを実際に描画した図です。
画像をよく見て、試験問題の図としての品質を点検し、改善した TikZ コードを出力してください。

# 点検すること
- 文字・数値・記号どうし、または文字と線・部品が重なっていないか、はみ出していないか
- 部品や点の間隔が詰まりすぎていないか、全体のバランス・大きさは適切か
- 問題文の記号・値と図のラベルが一致しているか、足りない記号はないか
- 回路が正しくつながっているか（開いた配線、不要な交差がないか）、矢印の向き・長さは正しいか
- 答え（求める値）が図に書かれていないか
${instruction.trim() ? `\n# ユーザーからの改善の要望（最優先）\n${instruction.trim()}\n` : ''}
# 書き方と品質の基準
${FIGURE_GUIDE}
- 回路記号は ${STYLE_TEXT[style]} で描画されます。

# 問題文
${problem}

# 現在の TikZ コード
${code}

# 出力
改善した TikZ コード（環境の部分だけ）を出力する。説明や \`\`\` は書かない。問題がなければ現在のコードをそのまま出力する。`
}

export interface FigureOutcome {
  code: string
  svg?: string
  error?: string
}

interface Ctx {
  model: ModelInfo
  apiKey: string
  style: CircuitStyle
  signal?: AbortSignal
  /** AI に修正を頼むときに呼ばれる (進み具合の表示用) */
  onRepair?: () => void
}

/** コンパイルし、失敗したら AI に1回だけ修正させる */
export async function compileWithRepair(code: string, ctx: Ctx): Promise<FigureOutcome> {
  const r = await compileFigure(code, ctx.style)
  if (r.svg) return { code, svg: r.svg }
  ctx.onRepair?.()
  try {
    const fixed = normalizeFigure(
      await generateText(ctx.model, ctx.apiKey, repairPrompt(code, r.error ?? ''), ctx.signal)
    )
    if (fixed) {
      const r2 = await compileFigure(fixed, ctx.style)
      if (r2.svg) return { code: fixed, svg: r2.svg }
    }
  } catch {
    /* 修正の依頼に失敗した場合は元のエラーを返す */
  }
  return { code, error: r.error }
}

/**
 * 描画済みの図を画像にして AI に見せ、改善したコードを受け取って描画し直す。
 * 改善後のコードが描画できなかった場合は例外 (呼び出し側で元の図を残す)。
 */
export async function brushupFigure(
  problem: string,
  code: string,
  svg: string,
  instruction: string,
  ctx: Ctx
): Promise<{ code: string; svg: string; changed: boolean }> {
  const png = await svgToPngBase64(svg)
  const text = await generateText(
    ctx.model,
    ctx.apiKey,
    reviewPrompt(problem, code, instruction, ctx.style),
    ctx.signal,
    [{ name: 'figure.png', mime: 'image/png', data: png }]
  )
  const improved = normalizeFigure(text)
  if (!improved) throw new Error('AI が図のコードを返しませんでした。もう一度お試しください')
  if (improved.replace(/\s+/g, '') === code.replace(/\s+/g, ''))
    return { code, svg, changed: false }
  const r = await compileWithRepair(improved, ctx)
  if (!r.svg)
    throw new Error(
      `改善した図を描画できませんでした（${r.error ?? '不明なエラー'}）。元の図はそのままです`
    )
  return { code: r.code, svg: r.svg, changed: true }
}
