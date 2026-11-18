import type {
  AppSettings,
  ChatMessage,
  FolderListing,
  GenerateRequest,
  ProblemItem,
  ProblemSet,
  Provider,
  ReferenceFile,
  SettingsView
} from './types'

/** プリロードからレンダラーに公開する API */
export interface Api {
  getSettings(): Promise<SettingsView>
  updateSettings(patch: Partial<AppSettings>): Promise<SettingsView>
  setApiKey(provider: Provider, key: string): Promise<SettingsView>
  refreshModels(provider: Provider): Promise<SettingsView>
  pickFolder(): Promise<string | null>

  listFolder(dir: string): Promise<FolderListing>
  readSet(dir: string): Promise<ProblemSet>
  createFolder(parent: string, name: string): Promise<string>
  trash(path: string): Promise<void>
  updateSet(dir: string, set: ProblemSet): Promise<void>
  readFigure(dir: string, index: number): Promise<string | null>
  listReferences(dir: string): Promise<ReferenceFile[]>
  openPath(path: string): Promise<void>
  /** 描いた図を AI に見せて改善させる (instruction は改善の要望、空でもよい) */
  brushupFigure(
    dir: string,
    index: number,
    instruction: string,
    modelKey: string,
    requestId: string
  ): Promise<{ item: ProblemItem; changed: boolean }>
  /** 手で編集した TikZ コードで描き直す */
  updateFigure(dir: string, index: number, code: string): Promise<ProblemItem>
  /** ひとつ前の図に戻す */
  undoFigure(dir: string, index: number): Promise<ProblemItem>
  reveal(path: string): Promise<void>
  openTex(dir: string, which: 'problems' | 'answers'): Promise<void>

  /** 作成した問題セットのパス。途中で失敗して一部だけ保存した場合は warning 付き */
  generate(req: GenerateRequest, requestId: string): Promise<{ path: string; warning?: string }>
  cancel(requestId: string): Promise<void>
  onGenerateProgress(cb: (requestId: string, text: string) => void): () => void

  loadChat(dir: string): Promise<ChatMessage[]>
  saveChat(dir: string, messages: ChatMessage[]): Promise<void>
  sendChat(
    dir: string,
    focusSet: string | null,
    messages: ChatMessage[],
    modelKey: string,
    requestId: string
  ): Promise<string>
  onChatDelta(cb: (requestId: string, delta: string) => void): () => void

  setTheme(mode: 'light' | 'dark'): void
}
