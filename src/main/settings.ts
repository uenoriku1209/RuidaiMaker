import { app, safeStorage } from 'electron'
import { promises as fs, mkdirSync } from 'fs'
import { join } from 'path'
import { DEFAULT_TEMPLATE, LEGACY_TEMPLATES } from './prompt'
import type { AppSettings, ModelInfo, Provider, SettingsView } from '../shared/types'

const PROVIDERS: Provider[] = ['gemini', 'openai', 'anthropic']

interface Stored extends AppSettings {
  keys: Partial<Record<Provider, string>>
  models: Partial<Record<Provider, ModelInfo[]>>
  errors: Partial<Record<Provider, string>>
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

function defaults(): Stored {
  return {
    libraryRoot: join(app.getPath('documents'), '類題ライブラリ'),
    generateModel: '',
    chatModel: '',
    promptTemplate: DEFAULT_TEMPLATE,
    keys: {},
    models: {},
    errors: {}
  }
}

let cache: Stored | null = null

async function load(): Promise<Stored> {
  if (cache) return cache
  try {
    cache = { ...defaults(), ...JSON.parse(await fs.readFile(file(), 'utf8')) }
    // 以前の初期値のまま使っている場合は、新しい初期値に更新する
    if (LEGACY_TEMPLATES.includes(cache!.promptTemplate)) cache!.promptTemplate = DEFAULT_TEMPLATE
  } catch {
    cache = defaults()
  }
  mkdirSync(cache!.libraryRoot, { recursive: true })
  return cache!
}

async function save(): Promise<void> {
  if (!cache) return
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(cache, null, 2), 'utf8')
}

/* ---------- API キー (OS の暗号化機能で保存) ---------- */

function encrypt(key: string): string {
  if (safeStorage.isEncryptionAvailable())
    return 'enc:' + safeStorage.encryptString(key).toString('base64')
  return 'plain:' + Buffer.from(key, 'utf8').toString('base64')
}

function decrypt(stored: string): string {
  if (stored.startsWith('enc:'))
    return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
  if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8')
  return ''
}

export async function getApiKey(p: Provider): Promise<string> {
  const s = await load()
  const v = s.keys[p]
  if (!v) return ''
  try {
    return decrypt(v)
  } catch {
    return ''
  }
}

export async function setApiKey(p: Provider, key: string): Promise<void> {
  const s = await load()
  if (key.trim()) s.keys[p] = encrypt(key.trim())
  else {
    delete s.keys[p]
    delete s.models[p]
    delete s.errors[p]
  }
  await save()
}

export async function setModels(p: Provider, models: ModelInfo[], error?: string): Promise<void> {
  const s = await load()
  if (error) s.errors[p] = error
  else {
    s.models[p] = models
    delete s.errors[p]
  }
  // 選択中のモデルが無くなっていたら選び直す
  const all = PROVIDERS.flatMap((x) => s.models[x] ?? [])
  const pick = (cur: string): string => (all.some((m) => m.key === cur) ? cur : preferredModel(all))
  s.generateModel = pick(s.generateModel)
  s.chatModel = pick(s.chatModel)
  await save()
}

/** 初期値として選ぶモデル: Gemini の Pro → Flash → その他 */
function preferredModel(all: ModelInfo[]): string {
  const stable = (m: ModelInfo): boolean => !/preview|exp|latest/i.test(m.id)
  return (
    all.find((m) => m.provider === 'gemini' && /pro/.test(m.id) && stable(m))?.key ??
    all.find(
      (m) => m.provider === 'gemini' && /flash/.test(m.id) && !/lite/.test(m.id) && stable(m)
    )?.key ??
    all.find((m) => m.provider === 'gemini')?.key ??
    all[0]?.key ??
    ''
  )
}

export async function findModel(key: string): Promise<ModelInfo | undefined> {
  const s = await load()
  return PROVIDERS.flatMap((p) => s.models[p] ?? []).find((m) => m.key === key)
}

export async function getSettings(): Promise<Stored> {
  return load()
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const s = await load()
  Object.assign(s, patch)
  if (patch.libraryRoot) mkdirSync(patch.libraryRoot, { recursive: true })
  await save()
}

export async function settingsView(): Promise<SettingsView> {
  const s = await load()
  const providers = await Promise.all(
    PROVIDERS.map(async (p) => {
      const key = await getApiKey(p)
      return {
        provider: p,
        hasKey: !!key,
        keyHint: key ? key.slice(-4) : '',
        models: s.models[p] ?? [],
        error: s.errors[p]
      }
    })
  )
  return {
    libraryRoot: s.libraryRoot,
    generateModel: s.generateModel,
    chatModel: s.chatModel,
    promptTemplate: s.promptTemplate,
    defaultPromptTemplate: DEFAULT_TEMPLATE,
    providers,
    secureStorage: safeStorage.isEncryptionAvailable()
  }
}
