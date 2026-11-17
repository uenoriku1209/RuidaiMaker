import { useState } from 'react'
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  ExternalLink,
  FolderOpen,
  RotateCcw,
  Save,
  Loader2
} from 'lucide-react'
import {
  PROVIDER_LABEL,
  type Provider,
  type ProviderStatus,
  type SettingsView
} from '../../../shared/types'
import { ModelSelect } from '../components/ModelSelect'
import { errorMessage } from '../lib/format'
import { useToast } from '../lib/toast'

const KEY_INFO: Record<Provider, { url: string; note: string; placeholder: string }> = {
  gemini: {
    url: 'https://aistudio.google.com/apikey',
    note: 'Google AI Studio で無料で作成できます（無料枠には回数制限があり、入力内容が Google の製品改善に使われる場合があります）。',
    placeholder: 'AIza...'
  },
  openai: {
    url: 'https://platform.openai.com/api-keys',
    note: 'OpenAI の API は使った分だけ課金されます（ChatGPT の月額プランとは別）。',
    placeholder: 'sk-...'
  },
  anthropic: {
    url: 'https://console.anthropic.com/settings/keys',
    note: 'Claude の API は使った分だけ課金されます（Claude の月額プランとは別）。',
    placeholder: 'sk-ant-...'
  }
}

function ProviderCard({
  status,
  onChange
}: {
  status: ProviderStatus
  onChange: (s: SettingsView) => void
}): React.JSX.Element {
  const toast = useToast()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const info = KEY_INFO[status.provider]

  const run = async (fn: () => Promise<SettingsView>, ok?: string): Promise<void> => {
    setBusy(true)
    try {
      const s = await fn()
      onChange(s)
      const p = s.providers.find((x) => x.provider === status.provider)
      if (p?.error) toast('error', p.error)
      else if (ok) toast('success', ok)
    } catch (e) {
      toast('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`card provider-card ${status.provider === 'gemini' ? 'recommended' : ''}`}>
      <div className="provider-head">
        <h3>
          {PROVIDER_LABEL[status.provider]}
          {status.provider === 'gemini' && (
            <span className="pill accent">おすすめ・無料枠あり</span>
          )}
        </h3>
        {status.hasKey ? (
          status.error ? (
            <span className="status error">
              <AlertCircle size={15} /> 接続エラー
            </span>
          ) : (
            <span className="status ok">
              <CheckCircle2 size={15} /> 登録済み（…{status.keyHint}）・{status.models.length}{' '}
              モデル
            </span>
          )
        ) : (
          <span className="status muted">未登録</span>
        )}
      </div>
      <p className="muted small-text">
        {info.note}{' '}
        <a href={info.url} target="_blank" rel="noreferrer">
          キーを作成 <ExternalLink size={11} />
        </a>
      </p>
      {status.error && <div className="form-error">{status.error}</div>}
      <div className="key-row">
        <input
          className="input"
          type="password"
          value={key}
          placeholder={status.hasKey ? '新しいキーで置き換える場合は入力' : info.placeholder}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="btn btn-primary"
          disabled={!key.trim() || busy}
          onClick={() =>
            run(async () => {
              const s = await window.api.setApiKey(status.provider, key)
              setKey('')
              return s
            }, 'API キーを保存し、モデル一覧を取得しました')
          }
        >
          {busy ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />} 保存して接続
        </button>
        {status.hasKey && (
          <>
            <button
              className="btn-icon"
              title="モデル一覧を再取得"
              disabled={busy}
              onClick={() =>
                run(() => window.api.refreshModels(status.provider), 'モデル一覧を更新しました')
              }
            >
              <RefreshCw size={15} className={busy ? 'spin' : ''} />
            </button>
            <button
              className="btn-icon danger"
              title="API キーを削除"
              disabled={busy}
              onClick={() =>
                confirm('この API キーを削除しますか？') &&
                run(() => window.api.setApiKey(status.provider, ''), '削除しました')
              }
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function SettingsPage({
  settings,
  onChange
}: {
  settings: SettingsView
  onChange: (s: SettingsView) => void
}): React.JSX.Element {
  const toast = useToast()
  const [template, setTemplate] = useState(settings.promptTemplate)
  const dirty = template !== settings.promptTemplate

  const update = async (
    patch: Parameters<typeof window.api.updateSettings>[0],
    ok?: string
  ): Promise<void> => {
    try {
      onChange(await window.api.updateSettings(patch))
      if (ok) toast('success', ok)
    } catch (e) {
      toast('error', errorMessage(e))
    }
  }

  return (
    <div className="page scroll-page">
      <header className="page-header">
        <div>
          <h1>設定</h1>
          <p className="subtitle">AI の API キー、使うモデル、保存先、プロンプトを設定します</p>
        </div>
      </header>

      <section className="settings-section">
        <h2>AI の API キー</h2>
        <p className="muted small-text">
          キーは{' '}
          {settings.secureStorage
            ? 'OS の暗号化機能（Windows の DPAPI など）で暗号化して'
            : '暗号化せずに（この環境では OS の暗号化機能が使えません）'}
          このパソコンにだけ保存されます。登録したキーで使えるモデルが自動で一覧に表示されます。
        </p>
        <div className="provider-grid">
          {settings.providers.map((p) => (
            <ProviderCard key={p.provider} status={p} onChange={onChange} />
          ))}
        </div>
      </section>

      <section className="settings-section card padded">
        <h2>使うモデル</h2>
        <div className="field-row">
          <div className="field">
            <label>問題作成（既定）</label>
            <ModelSelect
              settings={settings}
              value={settings.generateModel}
              onChange={(v) => update({ generateModel: v })}
            />
          </div>
          <div className="field">
            <label>質問チャット（既定）</label>
            <ModelSelect
              settings={settings}
              value={settings.chatModel}
              onChange={(v) => update({ chatModel: v })}
            />
          </div>
        </div>
        <p className="muted small-text">
          問題作成には、数学に強い上位モデル（Gemini の Pro など）がおすすめです。
        </p>
      </section>

      <section className="settings-section card padded">
        <h2>ライブラリの保存先</h2>
        <div className="key-row">
          <div className="static-value grow" title={settings.libraryRoot}>
            <FolderOpen size={15} /> {settings.libraryRoot}
          </div>
          <button
            className="btn"
            onClick={async () => {
              const d = await window.api.pickFolder()
              if (d) update({ libraryRoot: d }, '保存先を変更しました')
            }}
          >
            変更…
          </button>
        </div>
      </section>

      <section className="settings-section card padded">
        <h2>問題作成のプロンプト</h2>
        <p className="muted small-text">
          {
            '{{field}} {{topic}} {{expertise}} {{difficulty}} {{level}} {{count}} {{reference}} {{notes}}'
          }{' '}
          は入力内容に置き換わります。
          「解いてから答えだけを解答に入れる」ための出力形式の指示は、このあとに自動で付け加えられます。
        </p>
        <textarea
          className="input mono"
          rows={16}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          spellCheck={false}
        />
        <div className="key-row end">
          <button
            className="btn"
            onClick={() => setTemplate(settings.defaultPromptTemplate)}
            disabled={template === settings.defaultPromptTemplate}
          >
            <RotateCcw size={15} /> 初期値に戻す
          </button>
          <button
            className="btn btn-primary"
            disabled={!dirty}
            onClick={() => update({ promptTemplate: template }, 'プロンプトを保存しました')}
          >
            <Save size={15} /> 保存
          </button>
        </div>
      </section>
    </div>
  )
}
