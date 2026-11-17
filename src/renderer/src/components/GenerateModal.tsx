import { useEffect, useRef, useState } from 'react'
import { X, Sparkles, ImagePlus, FileText, Shapes } from 'lucide-react'
import type { FigureMode, GenerateRequest, SettingsView } from '../../../shared/types'
import { toAttachment, type PendingAttachment } from '../lib/attachments'
import { ModelSelect } from './ModelSelect'
import { DIFFICULTY, basename, errorMessage } from '../lib/format'

const FIELD_SUGGESTIONS = [
  '数学（微分積分）',
  '数学（線形代数）',
  '数学（確率・統計）',
  '数学（高校数学）',
  '物理（力学）',
  '物理（電磁気学）',
  '物理（熱力学）',
  '化学',
  '情報科学（アルゴリズム）',
  '電気回路',
  '材料力学',
  'ミクロ経済学',
  'マクロ経済学',
  '簿記・会計'
]

interface Props {
  dir: string
  settings: SettingsView
  onClose: () => void
  onSubmit: (req: GenerateRequest) => void
}

/** 前回の入力を覚えておく */
const MEMO_KEY = 'generate-form'
function loadMemo(): Partial<GenerateRequest> {
  try {
    return JSON.parse(localStorage.getItem(MEMO_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function GenerateModal({ dir, settings, onClose, onSubmit }: Props): React.JSX.Element {
  const memo = loadMemo()
  const [field, setField] = useState(memo.field ?? '')
  const [topic, setTopic] = useState(memo.topic ?? '')
  const [expertise, setExpertise] = useState(memo.expertise ?? '')
  const [difficulty, setDifficulty] = useState(memo.difficulty ?? 3)
  const [count, setCount] = useState(memo.count ?? 3)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState(memo.notes ?? '')
  const [model, setModel] = useState(settings.generateModel)
  const [figureMode, setFigureMode] = useState<FigureMode>(memo.figureMode ?? 'auto')
  const [files, setFiles] = useState<PendingAttachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = async (list: FileList | File[]): Promise<void> => {
    setError('')
    for (const f of Array.from(list)) {
      try {
        const a = await toAttachment(f)
        setFiles((cur) => [...cur, a])
      } catch (e) {
        setError(errorMessage(e))
      }
    }
  }

  // Ctrl+V でスクリーンショットなどを貼り付け
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const items = Array.from(e.clipboardData?.files ?? [])
      if (items.length) {
        e.preventDefault()
        addFiles(items)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (): void => {
    if (!field.trim()) return setError('分野を入力してください')
    if (!model)
      return setError('モデルを選択してください（設定画面で API キーを登録すると選べます）')
    const total = files.reduce((n, f) => n + f.size, 0)
    if (total > 18 * 1024 * 1024)
      return setError('参考資料の合計サイズが大きすぎます（合計 18MB まで）')
    const req: GenerateRequest = {
      dir,
      model,
      field,
      topic,
      expertise,
      difficulty,
      count,
      reference,
      notes,
      figureMode,
      attachments: files.map(({ name, mime, data }) => ({ name, mime, data }))
    }
    try {
      localStorage.setItem(
        MEMO_KEY,
        JSON.stringify({ field, topic, expertise, difficulty, count, notes, figureMode })
      )
    } catch {
      /* noop */
    }
    onSubmit(req)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-head">
          <h2>問題を作成</h2>
          <button className="btn-icon small" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field-row">
            <div className="field">
              <label>分野 *</label>
              <input
                className="input"
                list="field-suggestions"
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder="例: 数学（線形代数）"
                autoFocus
              />
              <datalist id="field-suggestions">
                {FIELD_SUGGESTIONS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label>テーマ・出題範囲</label>
              <input
                className="input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例: 固有値と対角化"
              />
            </div>
          </div>

          <div className="field">
            <label>あなたの専門性・レベル</label>
            <input
              className="input"
              value={expertise}
              onChange={(e) => setExpertise(e.target.value)}
              placeholder="例: 工学部2年。線形代数の講義は受講済み"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>難易度</label>
              <div className="segmented">
                {DIFFICULTY.map((d) => (
                  <button
                    key={d.level}
                    className={difficulty === d.level ? 'active' : ''}
                    onClick={() => setDifficulty(d.level)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field narrow">
              <label>問題数</label>
              <input
                className="input"
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              />
            </div>
          </div>

          <div className="field">
            <label>元になる問題（任意・類題を作りたいとき）</label>
            <textarea
              className="input"
              rows={4}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={
                '例: 行列 $A = \\begin{pmatrix} 1 & 2 \\\\ 2 & 1 \\end{pmatrix}$ の固有値を求めよ。'
              }
            />
          </div>

          <div className="field">
            <label>参考画像・資料（任意）</label>
            <div
              className={`dropzone ${dragging ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                addFiles(e.dataTransfer.files)
              }}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus size={20} />
              <span>
                クリックして選択 / ドラッグ＆ドロップ / <kbd>Ctrl</kbd>+<kbd>V</kbd> で貼り付け
                <small>
                  PNG・JPEG・WebP・GIF・PDF（問題の写真、教科書のページ、手書きの図など）
                </small>
              </span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            {files.length > 0 && (
              <div className="attach-list">
                {files.map((f, i) => (
                  <div key={i} className="attach-item" title={f.name}>
                    {f.previewUrl ? <img src={f.previewUrl} alt="" /> : <FileText size={22} />}
                    <span>{f.name}</span>
                    <button
                      onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}
                      title="取り除く"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label>
              <Shapes size={13} /> 図（電気回路図・ベクトル図・グラフなど）
            </label>
            <div className="segmented">
              {(
                [
                  ['auto', '必要なときだけ'],
                  ['prefer', 'なるべく入れる'],
                  ['none', '入れない']
                ] as [FigureMode, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={figureMode === id ? 'active' : ''}
                  onClick={() => setFigureMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>追加の要望（任意）</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例: 計算量は試験時間10分程度で解ける分量に"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>使うモデル</label>
              <ModelSelect settings={settings} value={model} onChange={setModel} />
            </div>
            <div className="field">
              <label>保存先</label>
              <div className="static-value" title={dir}>
                {basename(dir)}
              </div>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-foot">
          <span className="muted small-text">
            AI が裏で最後まで解き、最終的な答えだけを解答に入れます
          </span>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={submit}>
            <Sparkles size={16} /> 作成する
          </button>
        </div>
      </div>
    </div>
  )
}
