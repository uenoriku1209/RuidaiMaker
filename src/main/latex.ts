import type { ProblemSet } from '../shared/types'
import { DIFFICULTY_LABELS } from './prompt'
import { TIKZ_LIBRARIES } from './figures'

/** LuaLaTeX でそのままコンパイルできる文書にする */
function documentOf(set: ProblemSet, heading: string, items: string[]): string {
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
\\usepackage{tikz,circuitikz,pgfplots}
\\usetikzlibrary{${TIKZ_LIBRARIES}}
\\pgfplotsset{compat=1.16}
\\usepackage[margin=25mm]{geometry}
\\begin{document}
\\section*{${set.title}（${heading}）}
\\begin{enumerate}
${items.map((t) => `  \\item ${t.replace(/\n/g, '\n  ')}\n`).join('\n')}\\end{enumerate}
\\end{document}
`
}

export function problemsTex(set: ProblemSet): string {
  return documentOf(
    set,
    '問題',
    set.problems.map((p) =>
      p.figure ? `${p.problem}\n\n\\begin{center}\n${p.figure}\n\\end{center}` : p.problem
    )
  )
}

export function answersTex(set: ProblemSet): string {
  return documentOf(
    set,
    '解答',
    set.problems.map((p) => p.answer)
  )
}
