// メイン / プリロード / レンダラーで共有する型

export type Provider = 'gemini' | 'openai' | 'anthropic'

export const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)'
}

export interface ModelInfo {
  /** "gemini:gemini-2.5-pro" のように 提供元:モデルID */
  key: string
  provider: Provider
  id: string
  label: string
  /** Anthropic のみ: max_tokens の上限 */
  maxTokens?: number
}

export interface ProviderStatus {
  provider: Provider
  hasKey: boolean
  /** 保存されている API キーの末尾 4 文字 (表示用) */
  keyHint: string
  models: ModelInfo[]
  /** 最後にモデル一覧を取得したときのエラー */
  error?: string
}

/** 回路記号のスタイル: JIS (抵抗は長方形) / 米国式 (抵抗はジグザグ) */
export type CircuitStyle = 'jis' | 'us'

export interface AppSettings {
  libraryRoot: string
  circuitStyle: CircuitStyle
  generateModel: string
  chatModel: string
  promptTemplate: string
}

export interface SettingsView extends AppSettings {
  providers: ProviderStatus[]
  defaultPromptTemplate: string
  /** API キーを OS の暗号化機能で保存できているか */
  secureStorage: boolean
}

/** 参考資料 (画像・PDF)。data は base64 */
export interface Attachment {
  name: string
  mime: string
  data: string
}

export type FigureMode = 'auto' | 'prefer' | 'none'

export const ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf'
]

export interface GenerateRequest {
  /** 保存先フォルダ */
  dir: string
  model: string
  field: string
  topic: string
  expertise: string
  difficulty: number
  count: number
  reference: string
  notes: string
  /** 図を入れるか: 自動 / なるべく入れる / 入れない */
  figureMode: FigureMode
  /** 描画した図を AI に見せて1回改善させるか */
  figureReview: boolean
  attachments: Attachment[]
}

export interface ProblemItem {
  problem: string
  /** 図の TikZ / circuitikz コード (なければ空)。SVG は 図n.svg として保存 */
  figure?: string
  /** 図をコンパイルできなかった場合のエラー */
  figureError?: string
  /** ブラッシュアップ・編集前の図のコード (元に戻す用、新しい順ではなく古い順) */
  figureHistory?: string[]
  /** 正解に至る過程。画面には出さず、チャットでの説明に使う */
  solution: string
  /** 最終的な答えのみ (途中式なし) */
  answer: string
}

export interface ProblemSet {
  version: 1
  title: string
  createdAt: string
  model: string
  request: Omit<GenerateRequest, 'dir' | 'model' | 'attachments'> & {
    /** 参考資料フォルダに保存したファイル名 */
    references?: string[]
  }
  problems: ProblemItem[]
}

/** ライブラリ内の問題セット (フォルダ) */
export interface SetEntry {
  path: string
  name: string
  title: string
  createdAt: string
  count: number
  field: string
  difficulty: number
}

export interface FolderListing {
  folders: { name: string; path: string }[]
  sets: SetEntry[]
}

export interface ReferenceFile {
  name: string
  mime: string
  /** 画像のみ: 表示用の data URL */
  dataUrl?: string
  path: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  model?: string
  at: string
}

export interface Result<T> {
  ok: boolean
  value?: T
  error?: string
}
