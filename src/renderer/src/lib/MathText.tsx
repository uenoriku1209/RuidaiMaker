import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { repairLatex } from '../../../shared/latexFix'
import { KATEX_UNIT_MACROS } from '../../../shared/units'

const KATEX_OPTIONS = {
  throwOnError: false,
  strict: false,
  macros: {
    // 単位 (\SI{4}{\ohm} など siunitx 風の書き方)
    ...KATEX_UNIT_MACROS,
    '\\R': '\\mathbb{R}',
    '\\N': '\\mathbb{N}',
    '\\Z': '\\mathbb{Z}',
    '\\Q': '\\mathbb{Q}',
    '\\C': '\\mathbb{C}'
  }
}

/**
 * LaTeX 本文 (問題文・解答) を、KaTeX で表示できる Markdown に変換する。
 * 数式部分は保護し、それ以外の簡単な LaTeX 命令 (箇条書き・太字など) だけを置き換える。
 */
export function latexToMarkdown(src: string): string {
  const math: string[] = []
  const keep = (s: string): string => {
    math.push(s)
    return `\uE000${math.length - 1}\uE000`
  }
  let s = repairLatex(src.replace(/\r\n/g, '\n'))

  // --- 数式を保護 ---
  s = s.replace(
    /\\begin\{(equation|align|gather|multline|eqnarray)\*?\}([\s\S]*?)\\end\{\1\*?\}/g,
    (_, env: string, body: string) => {
      const inner =
        env === 'align' || env === 'eqnarray'
          ? `\\begin{aligned}${body}\\end{aligned}`
          : env === 'gather'
            ? `\\begin{gathered}${body}\\end{gathered}`
            : body
      return keep(`\n$$\n${inner.trim()}\n$$\n`)
    }
  )
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, b: string) => keep(`\n$$\n${b.trim()}\n$$\n`))
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, b: string) => keep(`\n$$\n${b.trim()}\n$$\n`))
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, b: string) => keep(`$${b}$`))
  s = s.replace(/(?<!\\)\$((?:\\\$|[^$])+?)(?<!\\)\$/g, (m) => keep(m.replace(/\n/g, ' ')))

  // --- 文章部分の LaTeX 命令 ---
  s = s
    .replace(/(?<!\\)%.*$/gm, '') // コメント
    .replace(/\\%/g, '%')
    .replace(/\\section\*?\{([^{}]*)\}/g, '\n### $1\n')
    .replace(/\\(?:subsection|paragraph)\*?\{([^{}]*)\}/g, '\n#### $1\n')
    .replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
    .replace(/\\(?:emph|textit)\{([^{}]*)\}/g, '*$1*')
    .replace(/\\texttt\{([^{}]*)\}/g, '`$1`')
    .replace(/\\(?:underline|text|mbox)\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:qquad|quad)\b\s*/g, ' ')
    .replace(/\\(?:noindent|par|medskip|bigskip|smallskip|newpage|clearpage)\b/g, '\n')
    .replace(/\\(?:newline|\\)\s*/g, '  \n')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/~/g, ' ')

  // 数式を元に戻す (箇条書きの字下げより前)
  s = s.replace(/\uE000(\d+)\uE000/g, (_, i: string) => math[Number(i)])

  // --- enumerate / itemize を Markdown のリストに ---
  const tokens = s.split(
    /(\\begin\{(?:enumerate|itemize)\}(?:\[[^\]]*\])?|\\end\{(?:enumerate|itemize)\}|\\item(?:\[[^\]]*\])?)/
  )
  const stack: ('enumerate' | 'itemize')[] = []
  let out = ''
  let indent = ''
  for (const t of tokens) {
    const begin = t.match(/^\\begin\{(enumerate|itemize)\}/)
    if (begin) {
      stack.push(begin[1] as 'enumerate' | 'itemize')
      out += '\n'
      continue
    }
    if (/^\\end\{(?:enumerate|itemize)\}$/.test(t)) {
      stack.pop()
      indent = '   '.repeat(Math.max(0, stack.length))
      out += '\n\n'
      continue
    }
    const item = t.match(/^\\item(?:\[([^\]]*)\])?$/)
    if (item && stack.length) {
      const depth = stack.length - 1
      const marker =
        item[1] !== undefined ? `- ${item[1]}` : stack[depth] === 'enumerate' ? '1.' : '-'
      out += `\n${'   '.repeat(depth)}${marker} `
      indent = '   '.repeat(depth + 1)
      continue
    }
    if (stack.length) {
      // リスト項目内の改行は字下げして、項目の続きとして扱う
      out += t.replace(/^\s+/, '').replace(/\n/g, `\n${indent}`)
    } else out += t
  }
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** チャットの返答 (Markdown) 用: \[ \] と \( \) だけを $ 記法にそろえる */
function normalizeMarkdownMath(src: string): string {
  return src
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, b: string) => `\n$$\n${b.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, b: string) => `$${b}$`)
}

interface Props {
  source: string
  /** latex: 問題文などの LaTeX 本文 / markdown: チャットの返答 */
  mode?: 'latex' | 'markdown'
  className?: string
}

export const MathText = memo(function MathText({ source, mode = 'latex', className }: Props) {
  const md = useMemo(
    () => (mode === 'latex' ? latexToMarkdown(source) : normalizeMarkdownMath(source)),
    [source, mode]
  )
  return (
    <div className={`math-text ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
      >
        {md}
      </ReactMarkdown>
    </div>
  )
})
