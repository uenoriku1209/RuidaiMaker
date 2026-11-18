import type { CircuitStyle, ProblemSet } from '../shared/types'
import { DIFFICULTY_LABELS } from './prompt'
import { TIKZ_LIBRARIES, CIRCUIT_OPTIONS } from './figures'
import { TEX_UNIT_PREAMBLE } from '../shared/units'

/** LuaLaTeX でそのままコンパイルできる文書にする */
function documentOf(
  set: ProblemSet,
  heading: string,
  items: string[],
  style: CircuitStyle
): string {
  const r = set.request
  const meta = [
    `% ${set.title} — ${heading}`,
    `% 分野: ${r.field} / テーマ: ${r.topic || '-'}`,
    `% 難易度: ${DIFFICULTY_LABELS[r.difficulty] ?? r.difficulty} (${r.difficulty}/5)`,
    `% 作成: ${set.createdAt} / モデル: ${set.model}`,
    '% コンパイル: lualatex で実行してください'
  ].join('\n')
  return `${meta}
\\documentclass[11pt]{ltjsarticle}
\\usepackage{amsmath,amssymb,mathtools,bm}
\\usepackage{tikz,pgfplots}
\\usepackage[${CIRCUIT_OPTIONS[style]}]{circuitikz}
\\usetikzlibrary{${TIKZ_LIBRARIES}}
\\pgfplotsset{compat=1.16}
\\usepackage{siunitx}
${TEX_UNIT_PREAMBLE}
\\usepackage[margin=25mm]{geometry}
\\begin{document}
\\section*{${set.title}（${heading}）}
\\begin{enumerate}
${items.map((t) => `  \\item ${t.replace(/\n/g, '\n  ')}\n`).join('\n')}\\end{enumerate}
\\end{document}
`
}

export function problemsTex(set: ProblemSet, style: CircuitStyle = 'jis'): string {
  return documentOf(
    set,
    '問題',
    set.problems.map((p) =>
      p.figure ? `${p.problem}\n\n\\begin{center}\n${p.figure}\n\\end{center}` : p.problem
    ),
    style
  )
}

export function answersTex(set: ProblemSet, style: CircuitStyle = 'jis'): string {
  return documentOf(
    set,
    '解答',
    set.problems.map((p) => p.answer),
    style
  )
}
