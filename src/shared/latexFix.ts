// AI が数式を $...$ で囲み忘れた場合に、自動で囲む (メイン・画面の両方で使用)

/** 文章用の命令 (これだけなら数式とはみなさない) */
const TEXT_COMMANDS = new Set([
  'textbf',
  'textit',
  'emph',
  'underline',
  'texttt',
  'text',
  'mbox',
  'section',
  'subsection',
  'paragraph',
  'item',
  'begin',
  'end',
  'quad',
  'qquad',
  'noindent',
  'par',
  'newline',
  'medskip',
  'bigskip',
  'smallskip',
  'newpage',
  'clearpage',
  'vspace',
  'hspace'
])

/** 日本語の文字 (かな・漢字・全角記号) */
const CJK = '\\u3000-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef'
/** 日本語・改行・保護済みの数式以外が続く部分 */
const RUN = new RegExp(`[^${CJK}\\uE100\\n]+`, 'g')

function hasMath(run: string): boolean {
  if (/[\^_]/.test(run.replace(/\\_/g, ''))) return true
  if (/\\begin\{(?:[pbvBV]?matrix|smallmatrix|cases|aligned|array|gathered)\}/.test(run))
    return true
  for (const m of run.matchAll(/\\([a-zA-Z]+)/g)) {
    if (!TEXT_COMMANDS.has(m[1])) return true
  }
  return false
}

/** 囲まれていない数式部分を $...$ で囲む */
function wrapRun(run: string): string {
  if (!hasMath(run)) return run
  // 箇条書きの命令は数式に含めない
  const parts = run.split(
    /(\\begin\{(?:enumerate|itemize)\}(?:\[[^\]]*\])?|\\end\{(?:enumerate|itemize)\}|\\item(?:\[[^\]]*\])?)/
  )
  if (parts.length > 1) return parts.map((p, i) => (i % 2 ? p : wrapRun(p))).join('')
  // 前後の空白・句読点・(1) のような番号は数式の外に出す
  const m = run.match(/^(\s*(?:\(\d+\)|（\d+）|\d+\.)?\s*)([\s\S]*?)(\s*[,.]?\s*)$/)
  if (!m || !m[2] || !hasMath(m[2])) return run
  return `${m[1]}$${m[2]}$${m[3]}`
}

/**
 * LaTeX 本文のうち、$...$ / \[...\] / \(...\) / 数式環境の外にある数式を $...$ で囲む。
 * 既に正しく囲まれている部分は変更しない。
 */
export function wrapBareMath(src: string): string {
  if (!src) return src
  const kept: string[] = []
  const keep = (s: string): string => {
    kept.push(s)
    return `${kept.length - 1}`
  }
  let s = src
  s = s.replace(
    /\\begin\{(equation|align|gather|multline|eqnarray|displaymath)\*?\}[\s\S]*?\\end\{\1\*?\}/g,
    keep
  )
  s = s.replace(/\$\$[\s\S]+?\$\$/g, keep)
  s = s.replace(/\\\[[\s\S]+?\\\]/g, keep)
  s = s.replace(/\\\([\s\S]+?\\\)/g, keep)
  s = s.replace(/(?<!\\)\$(?:\\\$|[^$])+?(?<!\\)\$/g, keep)
  s = s.replace(RUN, wrapRun)
  return s.replace(/(\d+)/g, (_, i: string) => kept[Number(i)])
}
