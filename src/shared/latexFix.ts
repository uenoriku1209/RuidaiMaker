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

/* ---------------- JSON のエスケープで壊れた LaTeX の修復 ---------------- */

/**
 * AI が JSON の文字列でバックスラッシュを二重にし忘れると、
 * \b \f \n \r \t で始まる命令 (\begin, \frac, \neq, \rho, \theta, \times など) が
 * バックスペース・タブ・改行などの制御文字に化けてしまう。それを元の命令に戻す。
 */
const N_COMMANDS = [
  'eq',
  'eg',
  'abla',
  'u',
  'i',
  'ot',
  'otin',
  'e',
  'leq',
  'geq',
  'less',
  'gtr',
  'parallel',
  'mid',
  'subseteq',
  'supseteq',
  'subset',
  'supset',
  'sim',
  'cong',
  'exists',
  'vdash',
  'atural',
  'earrow',
  'warrow',
  'leftarrow',
  'rightarrow',
  'Leftarrow',
  'Rightarrow',
  'leftrightarrow',
  'ormalsize',
  'onumber',
  'ewline'
].sort((a, b) => b.length - a.length)
const N_COMMAND_RE = new RegExp(`\\n(${N_COMMANDS.join('|')})(?![A-Za-z])`, 'g')

export function repairJsonEscapes(src: string): string {
  if (!src) return src
  let s = src
    .replaceAll(String.fromCharCode(8), '\\b') // \begin, \beta, \bar, \boldsymbol ...
    .replaceAll(String.fromCharCode(12), '\\f') // \frac, \forall ...
    .replace(/\t(?=[A-Za-z])/g, '\\t') // \theta, \times, \text, \to, \tan ...
    .replace(/\r(?=[A-Za-z])/g, '\\r') // \rho, \right, \rangle ...
  // \n は本物の改行と区別できないので、数式の中の既知の命令 (\neq, \nu, \nabla ...) だけ戻す
  const fixN = (seg: string): string => seg.replace(N_COMMAND_RE, '\\n$1')
  s = s
    .replace(/\$\$[\s\S]+?\$\$/g, fixN)
    .replace(/\\\[[\s\S]+?\\\]/g, fixN)
    .replace(/(?<!\\)\$(?:\\\$|[^$])+?(?<!\\)\$/g, fixN)
  return s
}

/**
 * 対応する \end のない \begin{...} (例: 1.2\begin{\%}, 400\begin{W}) は、
 * 単位を書こうとして崩れたものとみなし、\,\mathrm{...} に置き換える。
 */
export function fixOrphanBegin(src: string): string {
  return src.replace(/\\begin\{([^{}]*)\}/g, (m, name: string) => {
    const n = name.trim()
    if (/^[a-zA-Z]+\*?$/.test(n) && src.includes(`\\end{${n}}`)) return m
    return `\\,\\mathrm{${n}}`
  })
}

/** AI の出力した LaTeX をまとめて修復する (制御文字 → 命令、壊れた \begin、囲み忘れの数式) */
export function repairLatex(src: string): string {
  return wrapBareMath(fixOrphanBegin(repairJsonEscapes(src)))
}
