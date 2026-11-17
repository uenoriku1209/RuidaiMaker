import { useEffect, useRef, useState } from 'react'
import { Send, Square, Trash2, MessageCircle, Bot } from 'lucide-react'
import type { ChatMessage, SettingsView } from '../../../shared/types'
import { MathText } from '../lib/MathText'
import { ModelSelect, modelLabel } from './ModelSelect'
import { basename, errorMessage, newId } from '../lib/format'
import { useToast } from '../lib/toast'

interface Props {
  /** 開いているフォルダ (チャットの範囲) */
  dir: string
  /** 開いている問題セット */
  focusSet: string | null
  settings: SettingsView
  isRoot: boolean
}

const SUGGESTIONS = [
  '問1の解き方を途中式つきで教えて',
  '問1の解答が正しいか検算して',
  'このセットと同じ難易度の類題をもう1問作って',
  'このフォルダの問題で、つまずきやすいポイントは？'
]

export function ChatPanel({ dir, focusSet, settings, isRoot }: Props): React.JSX.Element {
  const toast = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState(settings.chatModel)
  const [streaming, setStreaming] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!model && settings.chatModel) setModel(settings.chatModel)
  }, [settings.chatModel, model])

  // フォルダが変わったら、そのフォルダの会話履歴を読み込む
  useEffect(() => {
    let alive = true
    setMessages([])
    window.api
      .loadChat(dir)
      .then((m) => alive && setMessages(m))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [dir])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  const send = async (text: string): Promise<void> => {
    const q = text.trim()
    if (!q || streaming) return
    if (!model) {
      toast('error', 'モデルを選択してください（設定画面で API キーを登録すると選べます）')
      return
    }
    const now = new Date().toISOString()
    const history: ChatMessage[] = [...messages, { role: 'user', content: q, at: now }]
    const reply: ChatMessage = {
      role: 'assistant',
      content: '',
      model: modelLabel(settings, model),
      at: now
    }
    setMessages([...history, reply])
    setInput('')

    const id = newId()
    setStreaming(id)
    let acc = ''
    const off = window.api.onChatDelta((rid, delta) => {
      if (rid !== id) return
      acc += delta
      setMessages((m) => [...m.slice(0, -1), { ...reply, content: acc }])
    })
    let final: ChatMessage[]
    try {
      const full = await window.api.sendChat(dir, focusSet, history, model, id)
      final = [...history, { ...reply, content: full || acc || '（返答が空でした）' }]
    } catch (e) {
      const errText = `⚠️ ${errorMessage(e)}`
      final = [...history, { ...reply, content: acc ? `${acc}\n\n${errText}` : errText }]
    }
    off()
    setMessages(final)
    setStreaming(null)
    window.api.saveChat(dir, final).catch(() => {})
  }

  const clear = (): void => {
    if (!confirm('このフォルダの会話履歴を消去しますか？')) return
    setMessages([])
    window.api.saveChat(dir, []).catch(() => {})
  }

  return (
    <section className="card chat-card">
      <div className="chat-head">
        <div className="chat-scope">
          <MessageCircle size={16} />
          <div>
            <div className="chat-title">質問チャット</div>
            <div className="chat-sub" title={dir}>
              範囲: {isRoot ? 'ライブラリ' : basename(dir)}
              {focusSet ? ` ／ ${basename(focusSet)}` : ''}
            </div>
          </div>
        </div>
        <button
          className="btn-icon small"
          onClick={clear}
          title="会話履歴を消去"
          disabled={!messages.length || !!streaming}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="chat-model">
        <ModelSelect
          settings={settings}
          value={model}
          onChange={setModel}
          className="select full"
          title="チャットに使うモデル"
        />
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <Bot size={30} strokeWidth={1.5} />
            <p>開いているフォルダの問題と解答について質問できます</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="tag" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === 'assistant' ? (
              m.content ? (
                <MathText source={m.content} mode="markdown" />
              ) : (
                <span className="typing">
                  <i />
                  <i />
                  <i />
                </span>
              )
            ) : (
              <div className="user-text">{m.content}</div>
            )}
            {m.role === 'assistant' && m.model && <div className="bubble-meta">{m.model}</div>}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="質問を入力（Enter で送信 / Shift+Enter で改行）"
          rows={2}
        />
        {streaming ? (
          <button
            className="btn-icon"
            title="生成を止める"
            onClick={() => window.api.cancel(streaming)}
          >
            <Square size={15} />
          </button>
        ) : (
          <button
            className="btn-icon primary"
            title="送信"
            onClick={() => send(input)}
            disabled={!input.trim()}
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </section>
  )
}
