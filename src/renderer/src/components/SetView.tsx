import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Wand2,
  PencilLine,
  Undo2,
  Loader2,
  RefreshCw,
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
import type { ProblemItem, ProblemSet, ReferenceFile, SettingsView } from '../../../shared/types'
import { ModelSelect } from './ModelSelect'
import { MathText } from '../lib/MathText'
import { DIFFICULTY, errorMessage, formatDate, newId } from '../lib/format'
import { useToast } from '../lib/toast'

interface Props {
  path: string
  settings: SettingsView
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
interface FigureProps {
  dir: string
  index: number
  item: ProblemItem
  settings: SettingsView
  onChange: (item: ProblemItem) => void
}

/**
 * 問題の図。保存済みの SVG を表示し、ブラッシュアップ (AI が図を見て改善)・
 * TikZ コードの手直し・元に戻す ができる。
 */
function Figure({ dir, index, item, settings, onChange }: FigureProps): React.JSX.Element | null {
  const toast = useToast()
  const [svg, setSvg] = useState<string | null | undefined>(undefined)
  const [version, setVersion] = useState(0)
  const [mode, setMode] = useState<'view' | 'brushup' | 'edit' | 'code'>('view')
  const [instruction, setInstruction] = useState('')
  const [model, setModel] = useState(settings.generateModel)
  const [draft, setDraft] = useState(item.figure ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [editError, setEditError] = useState('')
  const [requestId, setRequestId] = useState('')

  useEffect(() => {
    let alive = true
    window.api
      .readFigure(dir, index)
      .then((v) => alive && setSvg(v))
      .catch(() => alive && setSvg(null))
    return () => {
      alive = false
    }
  }, [dir, index, version])

  if (!item.figure) return null

  const applied = (next: ProblemItem, message: string): void => {
    onChange(next)
    setDraft(next.figure ?? '')
    setVersion((v) => v + 1)
    toast('success', message)
  }

  const brushup = async (): Promise<void> => {
    const id = newId()
    setRequestId(id)
    setBusy('AI が図を確認して改善しています…')
    try {
      const r = await window.api.brushupFigure(dir, index, instruction, model, id)
      if (r.changed) {
        applied(r.item, '図をブラッシュアップしました（「元に戻す」で前の図に戻せます）')
        setMode('view')
        setInstruction('')
      } else
        toast(
          'info',
          'AI は改善点が見つからないと判断しました。要望を具体的に書くと改善しやすくなります'
        )
    } catch (e) {
      const msg = errorMessage(e)
      if (msg !== '中止しました') toast('error', msg)
    } finally {
      setBusy(null)
    }
  }

  const saveEdit = async (): Promise<void> => {
    setBusy('描画しています…')
    setEditError('')
    try {
      applied(await window.api.updateFigure(dir, index, draft), '図を描き直しました')
      setMode('view')
    } catch (e) {
      setEditError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const undo = async (): Promise<void> => {
    setBusy('前の図に戻しています…')
    try {
      applied(await window.api.undoFigure(dir, index), '前の図に戻しました')
    } catch (e) {
      toast('error', errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const toggle = (m: typeof mode): void => {
    setMode((cur) => (cur === m ? 'view' : m))
    if (m === 'edit') {
      setDraft(item.figure ?? '')
      setEditError('')
    }
  }
  const history = item.figureHistory?.length ?? 0

  return (
    <div className="figure-wrap">
      <div className="figure-stage">
        {svg === undefined ? (
          <div className="figure loading">図を読み込み中…</div>
        ) : svg ? (
          <div className="figure" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="figure-error">
            <AlertTriangle size={15} />
            <span>
              図を描画できませんでした。{item.figureError ?? ''}
              <br />
              「ブラッシュアップ」で AI に直してもらうか、「コードを編集」で手直しできます。
            </span>
          </div>
        )}
        {busy && (
          <div className="figure-busy">
            <Loader2 size={18} className="spin" /> {busy}
            {busy.startsWith('AI') && (
              <button className="btn small" onClick={() => window.api.cancel(requestId)}>
                中止
              </button>
            )}
          </div>
        )}
      </div>

      <div className="figure-tools">
        <button
          className={`chip ${mode === 'brushup' ? 'on' : ''}`}
          onClick={() => toggle('brushup')}
          disabled={!!busy}
        >
          <Wand2 size={13} /> ブラッシュアップ
        </button>
        <button
          className={`chip ${mode === 'edit' ? 'on' : ''}`}
          onClick={() => toggle('edit')}
          disabled={!!busy}
        >
          <PencilLine size={13} /> コードを編集
        </button>
        {history > 0 && (
          <button
            className="chip"
            onClick={undo}
            disabled={!!busy}
            title={`前の図に戻す（あと ${history} 回）`}
          >
            <Undo2 size={13} /> 元に戻す
          </button>
        )}
        <div className="spacer" />
        <button className="link-button" onClick={() => toggle('code')}>
          <ChevronDown size={13} className={mode === 'code' ? 'rot' : ''} /> TikZ コード
        </button>
        <CopyButton text={item.figure} title="図の TikZ コードをコピー" />
      </div>

      {mode === 'brushup' && (
        <div className="figure-panel">
          <p className="muted small-text">
            描画した図を画像にして AI
            に見せ、重なり・配置・ラベルの不一致などを点検して描き直させます。直してほしい点があれば書いてください（任意）。
          </p>
          <textarea
            className="input"
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例: R2 のラベルと電流の矢印が重なっているので離して ／ 全体をもう少し大きく ／ 角度 θ を書き足して"
          />
          <div className="key-row">
            <ModelSelect
              settings={settings}
              value={model}
              onChange={setModel}
              className="select"
              title="使うモデル（画像を読めるモデル）"
            />
            <div className="spacer" />
            <button className="btn btn-primary small" onClick={brushup} disabled={!!busy}>
              <Wand2 size={14} /> ブラッシュアップする
            </button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="figure-panel">
          <textarea
            className="input mono"
            rows={Math.min(18, Math.max(6, draft.split('\n').length + 1))}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
          />
          {editError && <div className="form-error">{editError}</div>}
          <div className="key-row end">
            <button className="btn small" onClick={() => setMode('view')} disabled={!!busy}>
              キャンセル
            </button>
            <button
              className="btn btn-primary small"
              onClick={saveEdit}
              disabled={!!busy || !draft.trim()}
            >
              <RefreshCw size={14} /> 描き直して保存
            </button>
          </div>
        </div>
      )}

      {mode === 'code' && <pre className="figure-code">{item.figure}</pre>}
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

export function SetView({ path, settings, onBack, onDeleted }: Props): React.JSX.Element {
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
            <Figure
              dir={path}
              index={i}
              item={p}
              settings={settings}
              onChange={(next) =>
                setSet((cur) =>
                  cur ? { ...cur, problems: cur.problems.map((x, j) => (j === i ? next : x)) } : cur
                )
              }
            />
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
