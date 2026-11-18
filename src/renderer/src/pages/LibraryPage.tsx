import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Trash2,
  Sparkles,
  FolderPlus,
  FolderSearch,
  ChevronRight,
  Folder,
  FileStack,
  KeyRound,
  Loader2,
  X,
  RefreshCw
} from 'lucide-react'
import type { FolderListing, GenerateRequest, SettingsView } from '../../../shared/types'
import { FolderTree, isInside } from '../components/FolderTree'
import { GenerateModal } from '../components/GenerateModal'
import { SetView } from '../components/SetView'
import { ChatPanel } from '../components/ChatPanel'
import { DIFFICULTY, basename, errorMessage, formatDate, newId, parentDir } from '../lib/format'
import { useToast } from '../lib/toast'

interface Props {
  settings: SettingsView
  onOpenSettings: () => void
}

interface Job {
  id: string
  req: GenerateRequest
  startedAt: number
}

export function LibraryPage({ settings, onOpenSettings }: Props): React.JSX.Element {
  const toast = useToast()
  const root = settings.libraryRoot
  const [dir, setDir] = useState(() => {
    const saved = localStorage.getItem('currentDir')
    return saved && (saved === root || isInside(saved, root)) ? saved : root
  })
  const [openSet, setOpenSet] = useState<string | null>(null)
  const [listing, setListing] = useState<FolderListing>({ folders: [], sets: [] })
  const [refreshKey, setRefreshKey] = useState(0)
  const [showGenerate, setShowGenerate] = useState(false)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [stage, setStage] = useState('')
  const [stageAt, setStageAt] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const hasModels = settings.providers.some((p) => p.models.length > 0)

  useEffect(() => {
    if (dir !== root && !isInside(dir, root)) setDir(root)
  }, [root, dir])

  useEffect(() => {
    localStorage.setItem('currentDir', dir)
    let alive = true
    window.api
      .listFolder(dir)
      .then((l) => alive && setListing(l))
      .catch((e) => {
        if (!alive) return
        toast('error', errorMessage(e))
        setDir(root)
      })
    return () => {
      alive = false
    }
  }, [dir, refreshKey, root, toast])

  // 作成中の経過時間
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!job) return
    setElapsed(0)
    timer.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - job.startedAt) / 1000)),
      500
    )
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [job])

  const selectDir = (d: string): void => {
    setDir(d)
    setOpenSet(null)
  }

  const generate = async (req: GenerateRequest): Promise<void> => {
    setShowGenerate(false)
    const j: Job = { id: newId(), req, startedAt: Date.now() }
    setJob(j)
    setStage('問題を作成中…')
    setStageAt(Date.now())
    const off = window.api.onGenerateProgress((id, text) => {
      if (id !== j.id) return
      setStage(text)
      setStageAt(Date.now())
    })
    try {
      const { path, warning } = await window.api.generate(req, j.id)
      if (warning) toast('error', warning)
      else toast('success', '問題セットを作成しました')
      refresh()
      setDir(parentDir(path))
      setOpenSet(path)
    } catch (e) {
      const msg = errorMessage(e)
      if (msg !== '中止しました') toast('error', msg)
    } finally {
      off()
      setJob(null)
    }
  }

  /** フォルダをごみ箱へ移動 (中の問題セットごと) */
  const deleteFolder = async (target: string): Promise<void> => {
    if (target === root) return
    let detail = ''
    try {
      const l = await window.api.listFolder(target)
      const parts = [
        l.sets.length && `問題セット ${l.sets.length} 件`,
        l.folders.length && `フォルダ ${l.folders.length} 件`
      ].filter(Boolean)
      if (parts.length) detail = `\n中にある ${parts.join('・')} も一緒に移動します。`
    } catch {
      /* noop */
    }
    if (
      !confirm(
        `フォルダ「${basename(target)}」をごみ箱に移動しますか？${detail}\n（ごみ箱から元に戻せます）`
      )
    )
      return
    try {
      await window.api.trash(target)
      toast('success', `「${basename(target)}」をごみ箱に移動しました`)
      // 開いていたフォルダが削除されたら、ひとつ上へ
      if (dir === target || isInside(dir, target)) {
        setDir(parentDir(target))
        setOpenSet(null)
      }
      refresh()
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  const createFolder = async (): Promise<void> => {
    const name = newFolder?.trim()
    if (!name) return setNewFolder(null)
    try {
      const p = await window.api.createFolder(dir, name)
      setNewFolder(null)
      refresh()
      selectDir(p)
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  // パンくず
  const rel = dir.slice(root.length).split(/[\\/]/).filter(Boolean)
  const sep = root.includes('\\') ? '\\' : '/'
  const crumbs = [{ name: 'ライブラリ', path: root }]
  rel.reduce(
    (acc, r) => {
      const p = acc + sep + r
      crumbs.push({ name: r, path: p })
      return p
    },
    root.replace(/[\\/]+$/, '')
  )

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>ライブラリ</h1>
          <p className="subtitle">分野ごとのフォルダで問題と解答を管理し、チャットで質問できます</p>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={() => setNewFolder('')}>
            <FolderPlus size={17} /> 新しいフォルダ
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowGenerate(true)}
            disabled={!!job}
          >
            <Sparkles size={17} /> 問題を作成
          </button>
        </div>
      </header>

      {!hasModels && (
        <div className="banner">
          <KeyRound size={18} />
          <span>
            問題を作るには、まず設定画面で API キーを登録してください。Google Gemini
            のキーは無料で作成できます。
          </span>
          <button className="btn small btn-primary" onClick={onOpenSettings}>
            設定を開く
          </button>
        </div>
      )}

      {job && (
        <div className="banner progress-banner">
          <Loader2 size={18} className="spin" />
          <span>
            「{job.req.field}
            {job.req.topic ? `／${job.req.topic}` : ''}」{job.req.count} 問 — {stage}（この段階{' '}
            {Math.max(0, Math.floor((job.startedAt + elapsed * 1000 - stageAt) / 1000))} 秒／全体{' '}
            {elapsed} 秒）
            <span className="muted">
              （AI が解いて検算するため、10問あたり1〜3分ほどかかります）
            </span>
          </span>
          <button className="btn small" onClick={() => window.api.cancel(job.id)}>
            <X size={14} /> 中止
          </button>
        </div>
      )}

      <div className="library">
        <section className="card tree-card">
          <div className="card-title">フォルダ</div>
          <FolderTree root={root} current={dir} onSelect={selectDir} refreshKey={refreshKey} />
        </section>

        <section className="card main-card">
          {openSet ? (
            <SetView
              path={openSet}
              settings={settings}
              onBack={() => setOpenSet(null)}
              onDeleted={() => {
                setOpenSet(null)
                refresh()
              }}
            />
          ) : (
            <>
              <div className="list-head">
                <div className="crumbs">
                  {crumbs.map((c, i) => (
                    <span key={c.path} className="crumb-wrap">
                      {i > 0 && <ChevronRight size={13} className="crumb-sep" />}
                      <button className="crumb" onClick={() => selectDir(c.path)}>
                        {c.name}
                      </button>
                    </span>
                  ))}
                </div>
                <button className="btn-icon small" onClick={refresh} title="再読み込み">
                  <RefreshCw size={14} />
                </button>
                <button
                  className="btn-icon small"
                  onClick={() => window.api.reveal(dir)}
                  title="エクスプローラーで表示"
                >
                  <FolderSearch size={14} />
                </button>
                {dir !== root && (
                  <button
                    className="btn-icon small danger"
                    onClick={() => deleteFolder(dir)}
                    title="このフォルダを削除（ごみ箱へ）"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {newFolder !== null && (
                <div className="inline-form">
                  <FolderPlus size={16} />
                  <input
                    className="input"
                    autoFocus
                    value={newFolder}
                    placeholder="フォルダ名（例: 線形代数）"
                    onChange={(e) => setNewFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) createFolder()
                      if (e.key === 'Escape') setNewFolder(null)
                    }}
                  />
                  <button className="btn small btn-primary" onClick={createFolder}>
                    作成
                  </button>
                  <button className="btn small" onClick={() => setNewFolder(null)}>
                    キャンセル
                  </button>
                </div>
              )}

              <div className="set-grid">
                {listing.folders.map((f) => (
                  <div
                    key={f.path}
                    className="folder-card"
                    onClick={() => selectDir(f.path)}
                    role="button"
                  >
                    <Folder size={20} />
                    <span>{f.name}</span>
                    <button
                      className="card-delete"
                      title="このフォルダを削除（ごみ箱へ）"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteFolder(f.path)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {listing.sets.map((s) => (
                  <button key={s.path} className="set-card" onClick={() => setOpenSet(s.path)}>
                    <div className="set-card-icon">
                      <FileStack size={20} />
                    </div>
                    <div className="set-card-main">
                      <div className="set-card-title">{s.title}</div>
                      <div className="set-card-meta">
                        <span className="pill accent">{s.field}</span>
                        <span className="pill">
                          {DIFFICULTY.find((d) => d.level === s.difficulty)?.label}
                        </span>
                        <span>{s.count} 問</span>
                      </div>
                      <div className="set-card-date">{formatDate(s.createdAt)}</div>
                    </div>
                  </button>
                ))}
              </div>
              {listing.folders.length === 0 && listing.sets.length === 0 && (
                <div className="empty-state">
                  <FileStack size={40} strokeWidth={1.3} />
                  <p>
                    「{basename(dir) === basename(root) ? 'ライブラリ' : basename(dir)}
                    」にはまだ問題がありません
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowGenerate(true)}
                    disabled={!!job}
                  >
                    <Sparkles size={16} /> ここに問題を作成
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <ChatPanel dir={dir} focusSet={openSet} settings={settings} isRoot={dir === root} />
      </div>

      {showGenerate && (
        <GenerateModal
          dir={dir}
          settings={settings}
          onClose={() => setShowGenerate(false)}
          onSubmit={generate}
        />
      )}
    </div>
  )
}
