// TikZ / circuitikz / pgfplots のコードを、LaTeX をインストールせずに SVG に変換する
// (node-tikzjax: WebAssembly 版の TeX エンジン)

type Tex2Svg = (input: string, options?: Record<string, unknown>) => Promise<string>

let tex2svg: Tex2Svg | null = null
async function engine(): Promise<Tex2Svg> {
  if (!tex2svg) {
    const m = (await import('node-tikzjax')) as unknown as {
      default?: Tex2Svg | { default?: Tex2Svg }
    }
    const d = m.default as { default?: Tex2Svg } | Tex2Svg | undefined
    tex2svg = (typeof d === 'function' ? d : d?.default) ?? null
    if (!tex2svg) throw new Error('図の描画エンジンを読み込めませんでした')
  }
  return tex2svg
}

/** 図の中で使えるパッケージ・ライブラリ (.tex 出力でも同じものを読み込む) */
export const FIGURE_PACKAGES = { amsmath: '', amssymb: '', circuitikz: '', pgfplots: '' }
export const TIKZ_LIBRARIES =
  'arrows.meta,calc,angles,quotes,positioning,decorations.markings,patterns'

const CJK = /[぀-ヿ㐀-鿿＀-￯]/

/** AI が書いたコードから、図の環境部分だけを取り出す */
export function normalizeFigure(code: string): string {
  let s = (code ?? '').trim()
  if (!s) return ''
  s = s.replace(/^```(?:latex|tex)?\s*/i, '').replace(/```\s*$/, '')
  s = s
    .replace(/\\documentclass(\[[^\]]*\])?\{[^}]*\}/g, '')
    .replace(/\\usepackage(\[[^\]]*\])?\{[^}]*\}/g, '')
    .replace(/\\usetikzlibrary\{[^}]*\}/g, '')
    .replace(/\\pgfplotsset\{compat=[^}]*\}/g, '')
    .replace(/\\(begin|end)\{document\}/g, '')
    .replace(/\\begin\{(center|figure)\}(\[[^\]]*\])?|\\end\{(center|figure)\}|\\centering/g, '')
    .trim()
  if (!/\\begin\{(tikzpicture|circuitikz)\}/.test(s)) return ''
  return s
}

/** 同時に1つしか動かせないので、順番に処理する */
let queue: Promise<unknown> = Promise.resolve()

export interface FigureResult {
  svg?: string
  error?: string
}

/** TikZ コードを SVG に変換する (失敗時は TeX のエラーメッセージを返す) */
export function compileFigure(code: string): Promise<FigureResult> {
  const task = queue.then(() => compileNow(code))
  queue = task.catch(() => {})
  return task
}

async function compileNow(code: string): Promise<FigureResult> {
  if (CJK.test(code)) {
    return { error: '図の中に日本語が含まれています（図のラベルは英数字と数式のみ使えます）' }
  }
  const run = await engine()
  const source = `\\begin{document}\n${code}\n\\end{document}`

  // TeX エンジンのログを一時的に横取りして、エラー内容を取り出す
  const logs: string[] = []
  const origLog = console.log
  const origErr = console.error
  const origWrite = process.stdout.write.bind(process.stdout)
  console.log = (...a: unknown[]) => void logs.push(a.join(' '))
  console.error = console.log
  process.stdout.write = ((chunk: unknown) => {
    logs.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    const svg = await run(source, {
      showConsole: true,
      texPackages: FIGURE_PACKAGES,
      tikzLibraries: TIKZ_LIBRARIES,
      addToPreamble: '\\pgfplotsset{compat=1.16}'
    })
    return { svg: sanitizeSvg(svg) }
  } catch {
    const text = logs.join('')
    const i = text.indexOf('! ')
    const detail =
      i >= 0
        ? text
            .slice(i, i + 300)
            .replace(/\s+/g, ' ')
            .trim()
        : ''
    return { error: detail ? `TeX エラー: ${detail}` : '図をコンパイルできませんでした' }
  } finally {
    console.log = origLog
    console.error = origErr
    process.stdout.write = origWrite
  }
}

/** 念のため、SVG からスクリプトやイベント属性を取り除く */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
}
