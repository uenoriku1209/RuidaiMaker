// TikZ / circuitikz / pgfplots のコードを、LaTeX をインストールせずに SVG に変換する
// (node-tikzjax: WebAssembly 版の TeX エンジン)
import { TEX_UNIT_PREAMBLE, unicodeSymbolsToTex } from '../shared/units'
import type { CircuitStyle } from '../shared/types'

import type { Worker } from 'worker_threads'
import createFigureWorker from './figureWorker?nodeWorker'

/** 1枚の図の描画にかけてよい時間 (初回はエンジンの読み込みも含む) */
const COMPILE_TIMEOUT_MS = 40_000

let worker: Worker | null = null
function getWorker(): Worker {
  if (!worker) {
    const w = createFigureWorker({})
    w.on('exit', () => {
      if (worker === w) worker = null
    })
    worker = w
  }
  return worker
}

/** 回路記号のスタイル → circuitikz のオプション (JIS: 抵抗は長方形、コイルは半円の連続) */
export const CIRCUIT_OPTIONS: Record<CircuitStyle, string> = {
  jis: 'europeanresistors,americaninductors',
  us: 'american'
}

/** 図の中で使えるパッケージ (.tex 出力でも同じものを読み込む) */
function figurePackages(style: CircuitStyle): Record<string, string> {
  return { amsmath: '', amssymb: '', circuitikz: CIRCUIT_OPTIONS[style] ?? '', pgfplots: '' }
}
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
  return protectEqualsInOptions(unicodeSymbolsToTex(s))
}

/**
 * circuitikz のラベル (例: to[R, l=$R_1 = 4\,\Omega$]) は、数式内の「=」で
 * オプションが分割されてエラーになるため、オプション [ ] 内の数式の「=」を \mathrel{=} に置き換える
 * (見た目は同じ)。
 */
export function protectEqualsInOptions(code: string): string {
  let out = ''
  let depth = 0 // [ ] の深さ
  let inMath = false
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (ch === '\\') {
      // \$ や \[ などの命令はそのまま
      out += ch + (code[i + 1] ?? '')
      i++
      continue
    }
    if (ch === '$') inMath = !inMath
    else if (!inMath && ch === '[') depth++
    else if (!inMath && ch === ']' && depth > 0) depth--
    if (ch === '=' && inMath && depth > 0) {
      out += '\\mathrel{=}'
      continue
    }
    out += ch
  }
  return out
}

/** 同時に1つしか動かせないので、順番に処理する */
let queue: Promise<unknown> = Promise.resolve()

export interface FigureResult {
  svg?: string
  error?: string
}

/** TikZ コードを SVG に変換する (失敗時は TeX のエラーメッセージを返す) */
export function compileFigure(code: string, style: CircuitStyle = 'jis'): Promise<FigureResult> {
  const task = queue.then(() => compileNow(code, style))
  queue = task.catch(() => {})
  return task
}

let jobId = 0

/** TeX のログから「! エラー内容」と「l.行番号 該当箇所」だけを取り出す */
function texError(log: string): string {
  const i = log.indexOf('! ')
  let detail = i >= 0 ? log.slice(i, i + 400) : ''
  const cut = detail.search(/\?\s*Type <return>/)
  if (cut > 0) detail = detail.slice(0, cut)
  detail = detail.replace(/\s+/g, ' ').trim()
  return detail ? `TeX エラー: ${detail}` : '図をコンパイルできませんでした'
}

async function compileNow(code: string, style: CircuitStyle): Promise<FigureResult> {
  if (CJK.test(code)) {
    return { error: '図の中に日本語が含まれています（図のラベルは英数字と数式のみ使えます）' }
  }
  const w = getWorker()
  const id = ++jobId
  const source = `\\begin{document}\n${code}\n\\end{document}`
  const options = {
    showConsole: true,
    texPackages: figurePackages(style),
    tikzLibraries: TIKZ_LIBRARIES,
    addToPreamble: `\\pgfplotsset{compat=1.16}\n${TEX_UNIT_PREAMBLE}`
  }
  return new Promise<FigureResult>((resolve) => {
    const finish = (r: FigureResult): void => {
      clearTimeout(timer)
      w.off('message', onMessage)
      w.off('exit', onExit)
      resolve(r)
    }
    const onMessage = (m: { id: number; svg?: string; log?: string }): void => {
      if (m.id !== id) return
      finish(m.svg ? { svg: sanitizeSvg(m.svg) } : { error: texError(m.log ?? '') })
    }
    const onExit = (): void => finish({ error: '図の描画エンジンが停止しました' })
    // 時間切れ: TeX が無限ループしている可能性があるので、スレッドごと止める
    const timer = setTimeout(() => {
      w.off('exit', onExit)
      w.terminate().catch(() => {})
      if (worker === w) worker = null
      finish({
        error: `図の描画が ${COMPILE_TIMEOUT_MS / 1000} 秒以内に終わりませんでした（TikZ のコードが無限ループしているか、処理が重すぎる可能性があります）`
      })
    }, COMPILE_TIMEOUT_MS)
    w.on('message', onMessage)
    w.on('exit', onExit)
    w.postMessage({ id, source, options })
  })
}

/** 念のため、SVG からスクリプトやイベント属性を取り除く */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
}
