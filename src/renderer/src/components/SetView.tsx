import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileCode2,
  FolderSearch,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Paperclip,
  FileText,
  ChevronDown
} from 'lucide-react'
import type { ProblemItem, ProblemSet, ReferenceFile } from '../../../shared/types'
import { MathText } from '../lib/MathText'
import { DIFFICULTY, errorMessage, formatDate } from '../lib/format'
import { useToast } from '../lib/toast'

interface Props {
  path: string
  onBack: () => void
  onDeleted: () => void
}

function CopyButton({ text, title }: { text: string; title: string }): React.JSX.Element {
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn-icon small"
      title={title}
      onClick={() => {
        navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

/** 問題の図 (保存済みの SVG を表示。描画できなかった場合は TikZ コードを表示) */
function Figure({
  dir,
  index,
  item
}: {
  dir: string
  index: number
  item: ProblemItem
}): React.JSX.Element | null {
  const [svg, setSvg] = useState<string | null | undefined>(undefined)
  const [showCode, setShowCode] = useState(false)
  useEffect(() => {
    let alive = true
    setSvg(undefined)
    window.api
      .readFigure(dir, index)
      .then((v) => alive && setSvg(v))
      .catch(() => alive && setSvg(null))
    return () => {
      alive = false
    }
  }, [dir, index])
  if (!item.figure) return null
  if (svg === undefined) return <div className="figure loading">図を読み込み中…</div>
  return (
    <div className="figure-wrap">
      {svg ? (
        <div className="figure" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="figure-error">
          <AlertTriangle size={15} />
          <span>図を描画できませんでした。{item.figureError ?? ''}</span>
        </div>
      )}
      <div className="figure-tools">
        <button className="link-button" onClick={() => setShowCode((v) => !v)}>
          <ChevronDown size={13} className={showCode ? 'rot' : ''} /> TikZ コード
        </button>
        <CopyButton text={item.figure} title="図の TikZ コードをコピー" />
      </div>
      {showCode && <pre className="figure-code">{item.figure}</pre>}
    </div>
  )
}

/** 作成時に添付した参考資料 */
function References({ dir }: { dir: string }): React.JSX.Element | null {
  const [refs, setRefs] = useState<ReferenceFile[]>([])
  useEffect(() => {
    window.api
      .listReferences(dir)
      .then(setRefs)
      .catch(() => setRefs([]))
  }, [dir])
  if (refs.length === 0) return null
  return (
    <div className="refs">
      <span className="refs-label">
        <Paperclip size={14} /> 参考資料
      </span>
      {refs.map((r) => (
        <button
          key={r.name}
          className="ref-item"
          title={`${r.name}（クリックで開く）`}
          onClick={() => window.api.openPath(r.path)}
        >
          {r.dataUrl ? <img src={r.dataUrl} alt="" /> : <FileText size={20} />}
          <span>{r.name}</span>
        </button>
      ))}
    </div>
  )
}

export function SetView({ path, onBack, onDeleted }: Props): React.JSX.Element {
  const toast = useToast()
  const [set, setSet] = useState<ProblemSet | null>(null)
  const [error, setError] = useState('')
  const [shown, setShown] = useState<Set<number>>(new Set())

  useEffect(() => {
    let alive = true
    setSet(null)
    setShown(new Set())
    window.api
      .readSet(path)
      .then((s) => alive && setSet(s))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [path])

  if (error) return <div className="state error">{error}</div>
  if (!set) return <div className="state">読み込み中…</div>

  const allShown = shown.size === set.problems.length
  const toggle = (i: number): void =>
    setShown((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  const level = DIFFICULTY.find((d) => d.level === set.request.difficulty)

  const remove = async (): Promise<void> => {
    if (!confirm(`「${set.title}」をごみ箱に移動しますか？`)) return
    try {
      await window.api.trash(path)
      toast('success', 'ごみ箱に移動しました')
      onDeleted()
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  const openTex = (which: 'problems' | 'answers'): void => {
    window.api
      .openTex(path, which)
      .catch((e) => toast('error', `開けませんでした: ${errorMessage(e)}`))
  }

  return (
    <div className="set-view">
      <div className="set-head">
        <button className="btn-icon small" onClick={onBack} title="一覧に戻る">
          <ArrowLeft size={16} />
        </button>
        <div className="set-title">
          <h2>{set.title}</h2>
          <div className="set-meta">
            <span className="pill accent">{set.request.field}</span>
            {set.request.topic && <span className="pill">{set.request.topic}</span>}
            <span className="pill">
              難易度 {'●'.repeat(set.request.difficulty)}
              {'○'.repeat(5 - set.request.difficulty)} {level?.label}
            </span>
            <span className="muted">{set.problems.length} 問</span>
            <span className="muted">{formatDate(set.createdAt)}</span>
            <span className="muted">{set.model}</span>
          </div>
        </div>
      </div>

      <div className="set-actions">
        <button
          className="btn small"
          onClick={() => setShown(allShown ? new Set() : new Set(set.problems.map((_, i) => i)))}
        >
          {allShown ? <EyeOff size={14} /> : <Eye size={14} />}{' '}
          {allShown ? '解答をすべて隠す' : '解答をすべて表示'}
        </button>
        <div className="spacer" />
        <button
          className="btn small"
          onClick={() => openTex('problems')}
          title="問題.tex を既定のアプリで開く"
        >
          <FileCode2 size={14} /> 問題.tex
        </button>
        <button
          className="btn small"
          onClick={() => openTex('answers')}
          title="解答.tex を既定のアプリで開く"
        >
          <FileCode2 size={14} /> 解答.tex
        </button>
        <button
          className="btn-icon small"
          title="エクスプローラーで表示"
          onClick={() => window.api.reveal(path)}
        >
          <FolderSearch size={14} />
        </button>
        <button className="btn-icon small danger" title="ごみ箱に移動" onClick={remove}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="problems">
        <References dir={path} />
        {set.problems.map((p, i) => (
          <article key={i} className="problem-card">
            <div className="problem-head">
              <span className="problem-no">問{i + 1}</span>
              <div className="spacer" />
              <CopyButton text={p.problem} title="問題の LaTeX をコピー" />
            </div>
            <MathText source={p.problem} />
            <Figure dir={path} index={i} item={p} />
            <div className={`answer ${shown.has(i) ? 'open' : ''}`}>
              <button className="answer-toggle" onClick={() => toggle(i)}>
                {shown.has(i) ? <EyeOff size={14} /> : <Eye size={14} />}
                {shown.has(i) ? '解答を隠す' : '解答を表示'}
              </button>
              {shown.has(i) && (
                <div className="answer-body">
                  <MathText source={p.answer} />
                  <CopyButton text={p.answer} title="解答の LaTeX をコピー" />
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
