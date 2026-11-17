import { GoogleGenAI, Type, type Schema } from '@google/genai'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { RESULT_SCHEMA } from './prompt'
import type { Attachment, ChatMessage, ModelInfo, Provider } from '../shared/types'

/** 開発・テスト用: 環境変数で接続先を差し替えられる (通常は未設定) */
function baseUrl(p: Provider): string | undefined {
  return process.env[`RUIDAI_BASE_${p.toUpperCase()}`] || undefined
}

function gemini(apiKey: string): GoogleGenAI {
  const b = baseUrl('gemini')
  return new GoogleGenAI({ apiKey, ...(b ? { httpOptions: { baseUrl: b } } : {}) })
}
function openai(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: baseUrl('openai'), maxRetries: 1, timeout: 10 * 60 * 1000 })
}
function anthropic(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    baseURL: baseUrl('anthropic'),
    maxRetries: 1,
    timeout: 10 * 60 * 1000
  })
}

/* ---------------- 一時的なエラーの自動再試行 ---------------- */

/** サーバー側の一時的な混雑・障害 (時間をおけば直るエラー) か */
export function isTemporaryError(e: unknown): boolean {
  const err = e as { status?: number; message?: string }
  if ([500, 502, 503, 504, 529].includes(err?.status ?? 0)) return true
  return /UNAVAILABLE|overloaded|Service Unavailable|currently unavailable|"code":\s*5\d\d|INTERNAL|Bad Gateway|Gateway Timeout/i.test(
    err?.message ?? ''
  )
}

const RETRY_DELAYS_MS = [3000, 8000, 15000]

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new Error('aborted'))
    })
  })
}

/**
 * 一時的なエラー (503 など) のときだけ、間隔をあけて最大3回やり直す。
 * canRetry が false を返す場合 (チャットで返答の途中まで届いている等) はやり直さない。
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  canRetry: () => boolean = () => true
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (
        signal?.aborted ||
        attempt >= RETRY_DELAYS_MS.length ||
        !isTemporaryError(e) ||
        !canRetry()
      )
        throw e
      await sleep(RETRY_DELAYS_MS[attempt], signal)
    }
  }
}

/* ---------------- エラーをわかりやすく ---------------- */

const PROVIDER_NAME: Record<Provider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Claude'
}

export function friendlyError(e: unknown, provider: Provider): Error {
  const err = e as { status?: number; message?: string; name?: string }
  const status = err?.status
  const msg = err?.message ?? String(e)
  if (err?.name === 'AbortError' || /aborted/i.test(msg)) return new Error('中止しました')
  if (isTemporaryError(e)) {
    return new Error(
      `${PROVIDER_NAME[provider]} のサーバーが混み合っているか、一時的に停止しています（${status ?? '5xx'}）。` +
        '自動で数回やり直しましたが応答がありませんでした。少し時間をおいて再試行するか、' +
        (provider === 'gemini'
          ? '混みにくい Flash 系のモデルを選んでください'
          : '別のモデルを選んでください')
    )
  }
  if (
    status === 401 ||
    status === 403 ||
    /API key not valid|invalid.*api.?key|authentication/i.test(msg)
  ) {
    return new Error(
      'API キーが無効か、このモデルを使う権限がありません。設定画面でキーを確認してください'
    )
  }
  if (status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg)) {
    return new Error(
      provider === 'gemini'
        ? '利用回数の上限に達しました（無料枠の制限）。しばらく待つか、別のモデルを選んでください'
        : '利用回数または利用額の上限に達しました。しばらく待つか、請求設定を確認してください'
    )
  }
  if (status === 404 || /not found|does not exist/i.test(msg)) {
    return new Error(
      'このモデルは使えません（廃止された・権限がない可能性があります）。別のモデルを選んでください'
    )
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) {
    return new Error('AI のサーバーに接続できません。インターネット接続を確認してください')
  }
  return new Error(msg.length > 300 ? msg.slice(0, 300) + '…' : msg)
}

/* ---------------- モデル一覧 ---------------- */

const GEMINI_EXCLUDE =
  /embedding|image|tts|live|audio|aqa|veo|imagen|lyria|robotics|computer-use|learnlm|gemma/i
const OPENAI_INCLUDE = /^(gpt-|o\d|chatgpt-)/i
const OPENAI_EXCLUDE =
  /audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation|codex|computer-use|dall-e|whisper/i

export async function listModels(provider: Provider, apiKey: string): Promise<ModelInfo[]> {
  const out: ModelInfo[] = []
  if (provider === 'gemini') {
    const pager = await gemini(apiKey).models.list({ config: { pageSize: 100 } })
    for await (const m of pager) {
      const id = (m.name ?? '').replace(/^models\//, '')
      if (!id.startsWith('gemini') || GEMINI_EXCLUDE.test(id)) continue
      if (m.supportedActions && !m.supportedActions.includes('generateContent')) continue
      out.push({ key: `gemini:${id}`, provider, id, label: m.displayName || id })
    }
  } else if (provider === 'openai') {
    for await (const m of openai(apiKey).models.list()) {
      if (!OPENAI_INCLUDE.test(m.id) || OPENAI_EXCLUDE.test(m.id)) continue
      out.push({ key: `openai:${m.id}`, provider, id: m.id, label: m.id })
    }
  } else {
    for await (const m of anthropic(apiKey).models.list({ limit: 100 })) {
      out.push({
        key: `anthropic:${m.id}`,
        provider,
        id: m.id,
        label: m.display_name || m.id,
        maxTokens: m.max_tokens ?? undefined
      })
    }
  }
  // 新しそうなものが上に来るよう、名前の降順で並べる
  return out.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }))
}

/* ---------------- 構造化出力 (問題作成) ---------------- */

const GEMINI_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    problems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          problem: { type: Type.STRING },
          figure: { type: Type.STRING },
          solution: { type: Type.STRING },
          answer: { type: Type.STRING }
        },
        required: ['problem', 'figure', 'solution', 'answer'],
        // 解いてから答えを書かせるため、出力順を固定する
        propertyOrdering: ['problem', 'figure', 'solution', 'answer']
      }
    }
  },
  required: ['title', 'problems'],
  propertyOrdering: ['title', 'problems']
}

/* ---------------- 添付資料 (画像・PDF) を各社の形式に ---------------- */

function geminiContents(
  prompt: string,
  files: Attachment[]
): string | { role: string; parts: object[] }[] {
  if (!files.length) return prompt
  return [
    {
      role: 'user',
      parts: [
        ...files.map((f) => ({ inlineData: { mimeType: f.mime, data: f.data } })),
        { text: prompt }
      ]
    }
  ]
}

function openaiInput(prompt: string, files: Attachment[]): OpenAI.Responses.ResponseInput | string {
  if (!files.length) return prompt
  return [
    {
      role: 'user',
      content: [
        ...files.map((f) =>
          f.mime === 'application/pdf'
            ? {
                type: 'input_file' as const,
                filename: f.name,
                file_data: `data:${f.mime};base64,${f.data}`
              }
            : {
                type: 'input_image' as const,
                detail: 'auto' as const,
                image_url: `data:${f.mime};base64,${f.data}`
              }
        ),
        { type: 'input_text' as const, text: prompt }
      ]
    }
  ]
}

function anthropicContent(
  prompt: string,
  files: Attachment[]
): string | Anthropic.ContentBlockParam[] {
  if (!files.length) return prompt
  return [
    ...files.map((f): Anthropic.ContentBlockParam =>
      f.mime === 'application/pdf'
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: f.data }
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: f.mime as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              data: f.data
            }
          }
    ),
    { type: 'text', text: prompt }
  ]
}

const ANTHROPIC_TOOL = 'save_problem_set'

/** 1回分の問題作成 (再試行は generateStructured が行う) */
async function structuredOnce(
  model: ModelInfo,
  apiKey: string,
  prompt: string,
  files: Attachment[],
  signal?: AbortSignal
): Promise<unknown> {
  {
    if (model.provider === 'gemini') {
      const res = await gemini(apiKey).models.generateContent({
        model: model.id,
        contents: geminiContents(prompt, files),
        config: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_SCHEMA,
          abortSignal: signal
        }
      })
      return res.text ?? ''
    }

    if (model.provider === 'openai') {
      const res = await openai(apiKey).responses.create(
        {
          model: model.id,
          input: openaiInput(prompt, files),
          text: {
            format: {
              type: 'json_schema',
              name: 'problem_set',
              strict: true,
              schema: RESULT_SCHEMA as unknown as Record<string, unknown>
            }
          }
        },
        { signal }
      )
      return res.output_text
    }

    // Anthropic: ツール呼び出しの形で JSON を受け取る (どのモデルでも使える方法)
    const client = anthropic(apiKey)
    const request = (maxTokens: number): Promise<Anthropic.Message> =>
      client.messages.create(
        {
          model: model.id,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: anthropicContent(prompt, files) }],
          tools: [
            {
              name: ANTHROPIC_TOOL,
              description: '作成した問題セットを保存する',
              input_schema: RESULT_SCHEMA as unknown as Anthropic.Tool.InputSchema
            }
          ],
          tool_choice: { type: 'tool', name: ANTHROPIC_TOOL }
        },
        { signal }
      )
    const res = await request(Math.min(16000, model.maxTokens ?? 16000))
    const block = res.content.find((c) => c.type === 'tool_use')
    if (!block || block.type !== 'tool_use')
      throw new Error('AI の出力に問題が含まれていませんでした')
    if (res.stop_reason === 'max_tokens') {
      throw new Error('出力が長すぎて途中で切れました。問題数を減らして再度お試しください')
    }
    return block.input
  }
}

/** 指定モデルで問題を作り、JSON (未検証) を返す。一時的なエラーは自動で再試行する */
export async function generateStructured(
  model: ModelInfo,
  apiKey: string,
  prompt: string,
  files: Attachment[],
  signal?: AbortSignal
): Promise<unknown> {
  try {
    return await withRetry(() => structuredOnce(model, apiKey, prompt, files, signal), signal)
  } catch (e) {
    throw friendlyError(e, model.provider)
  }
}

/* ---------------- テキスト生成 (図の修正などの短い依頼) ---------------- */

export async function generateText(
  model: ModelInfo,
  apiKey: string,
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  try {
    return await withRetry(async () => {
      if (model.provider === 'gemini') {
        const res = await gemini(apiKey).models.generateContent({
          model: model.id,
          contents: prompt,
          config: { abortSignal: signal }
        })
        return res.text ?? ''
      }
      if (model.provider === 'openai') {
        const res = await openai(apiKey).responses.create(
          { model: model.id, input: prompt },
          { signal }
        )
        return res.output_text
      }
      const res = await anthropic(apiKey).messages.create(
        {
          model: model.id,
          max_tokens: Math.min(8000, model.maxTokens ?? 8000),
          messages: [{ role: 'user', content: prompt }]
        },
        { signal }
      )
      return res.content.map((c) => (c.type === 'text' ? c.text : '')).join('')
    }, signal)
  } catch (e) {
    throw friendlyError(e, model.provider)
  }
}

/* ---------------- チャット (ストリーミング) ---------------- */

export async function streamChat(
  model: ModelInfo,
  apiKey: string,
  system: string,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  let full = ''
  const push = (t: string | undefined): void => {
    if (!t) return
    full += t
    onDelta(t)
  }
  try {
    await withRetry(
      async () => {
        if (model.provider === 'gemini') {
          const stream = await gemini(apiKey).models.generateContentStream({
            model: model.id,
            contents: messages.map((m) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            config: { systemInstruction: system, abortSignal: signal }
          })
          for await (const chunk of stream) push(chunk.text)
        } else if (model.provider === 'openai') {
          const stream = await openai(apiKey).responses.create(
            {
              model: model.id,
              instructions: system,
              input: messages.map((m) => ({ role: m.role, content: m.content })),
              stream: true
            },
            { signal }
          )
          for await (const ev of stream) {
            if (ev.type === 'response.output_text.delta') push(ev.delta)
          }
        } else {
          const stream = await anthropic(apiKey).messages.create(
            {
              model: model.id,
              max_tokens: Math.min(8000, model.maxTokens ?? 8000),
              system,
              messages: messages.map((m) => ({ role: m.role, content: m.content })),
              stream: true
            },
            { signal }
          )
          for await (const ev of stream) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta')
              push(ev.delta.text)
          }
        }
      },
      signal,
      () => full === ''
    )
  } catch (e) {
    if (signal?.aborted) return full
    throw friendlyError(e, model.provider)
  }
  return full
}
