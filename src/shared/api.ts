import type {
  AppSettings,
  ChatMessage,
  FolderListing,
  GenerateRequest,
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
  reveal(path: string): Promise<void>
  openTex(dir: string, which: 'problems' | 'answers'): Promise<void>

  generate(req: GenerateRequest, requestId: string): Promise<string>
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
