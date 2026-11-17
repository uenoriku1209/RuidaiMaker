import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { basename } from 'path'
import { buildPrompt, parseResult } from './prompt'
import { generateStructured, generateText, listModels, streamChat } from './providers'
import { compileFigure, normalizeFigure } from './figures'
import {
  getApiKey,
  getSettings,
  findModel,
  setApiKey,
  setModels,
  settingsView,
  updateSettings
} from './settings'
import {
  assertInside,
  buildFolderContext,
  createFolder,
  listFolder,
  readChat,
  readSetRepaired,
  readFigure,
  listReferences,
  saveSet,
  writeChat,
  writeSetFiles,
  PROBLEMS_TEX,
  ANSWERS_TEX
} from './library'
import { join } from 'path'
import { ATTACHMENT_TYPES } from '../shared/types'
import type {
  AppSettings,
  Attachment,
  ChatMessage,
  GenerateRequest,
  ModelInfo,
  ProblemSet,
  Provider,
  Result
} from '../shared/types'

function handle<A extends unknown[], T>(
  channel: string,
  fn: (e: Electron.IpcMainInvokeEvent, ...args: A) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (e, ...args): Promise<Result<T>> => {
    try {
      return { ok: true, value: await fn(e, ...(args as A)) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

async function inLibrary(p: string): Promise<string> {
  assertInside((await getSettings()).libraryRoot, p)
  return p
}

async function modelWithKey(key: string): Promise<{ model: ModelInfo; apiKey: string }> {
  const model = await findModel(key)
  if (!model) throw new Error('モデルが選択されていません。設定画面で API キーを登録してください')
  const apiKey = await getApiKey(model.provider)
  if (!apiKey) throw new Error(`${model.provider} の API キーが登録されていません`)
  return { model, apiKey }
}

/** 実行中のリクエスト (中止用) */
const running = new Map<string, AbortController>()

function chatSystemPrompt(folderName: string, setCount: number, context: string): string {
  return `あなたは数学・理工学・専門科目に詳しい個別指導の先生です。
ユーザーは問題集アプリでフォルダ「${folderName}」を開いており、その中の問題セット（${setCount} セット）について質問します。
以下の問題・解答・解法メモを参照して、日本語でわかりやすく答えてください。

- 「問n」のように番号で聞かれたら、開いている問題セット（一番上のセット）の問題として扱う。
- 解法メモは作成時に AI が解いた過程です。誤りが含まれる可能性があるので、説明するときは自分でも検算し、誤りを見つけたら正直に指摘する。
- ユーザーが答えだけ知りたい場合はヒントや答えにとどめ、解き方を求められたら途中式も示す。
- 数式は Markdown 形式で、文中は $...$、独立した式は $$...$$ で書く。
- 類題を求められたら、同じ形式（問題文と答え）で提示する。

# フォルダ内の問題集
${context || '（このフォルダには問題セットがありません）'}`
}

/** 添付資料の確認 (形式・サイズ) */
const MAX_FILE = 15 * 1024 * 1024
const MAX_TOTAL = 18 * 1024 * 1024
function validateAttachments(files: Attachment[]): Attachment[] {
  let total = 0
  for (const f of files) {
    if (!ATTACHMENT_TYPES.includes(f.mime))
      throw new Error(`対応していない形式です: ${f.name}（PNG / JPEG / WebP / GIF / PDF）`)
    const size = Math.floor((f.data.length * 3) / 4)
    if (size > MAX_FILE) throw new Error(`ファイルが大きすぎます: ${f.name}（1ファイル 15MB まで）`)
    total += size
  }
  if (total > MAX_TOTAL) throw new Error('参考資料の合計サイズが大きすぎます（合計 18MB まで）')
  return files
}

function figureRepairPrompt(code: string, error: string): string {
  return `次の TikZ コードは、LaTeX でコンパイルするとエラーになります。エラーを修正したコードだけを出力してください。説明や \`\`\` は書かないでください。

# 制約
- \\begin{tikzpicture}...\\end{tikzpicture} または \\begin{circuitikz}...\\end{circuitikz} の環境だけを書く
- 使えるのは TikZ（arrows.meta, calc, angles, quotes, positioning, decorations.markings, patterns）、circuitikz、pgfplots、amsmath のみ
- 図の中の文字は英数字と数式だけ（日本語は使わない）
- 図の内容（形・記号・値）は変えない

# エラー
${error}

# コード
${code}`
}

export function registerIpc(): void {
  /* ---------- 設定 ---------- */
  handle('settings:get', () => settingsView())
  handle('settings:update', async (_e, patch: Partial<AppSettings>) => {
    await updateSettings(patch)
    return settingsView()
  })
  handle('settings:setKey', async (_e, provider: Provider, key: string) => {
    await setApiKey(provider, key)
    if (key.trim()) {
      try {
        const models = await listModels(provider, key.trim())
        if (models.length === 0) throw new Error('使えるモデルが見つかりませんでした')
        await setModels(provider, models)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await setModels(provider, [], msg)
      }
    } else await setModels(provider, [])
    return settingsView()
  })
  handle('settings:refreshModels', async (_e, provider: Provider) => {
    const key = await getApiKey(provider)
    if (!key) throw new Error('API キーが登録されていません')
    try {
      await setModels(provider, await listModels(provider, key))
    } catch (err) {
      await setModels(provider, [], err instanceof Error ? err.message : String(err))
    }
    return settingsView()
  })
  handle('dialog:pickFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'ライブラリの保存先フォルダを選択',
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  /* ---------- ライブラリ ---------- */
  handle('library:list', async (_e, dir: string) => listFolder(await inLibrary(dir)))
  handle('library:readSet', async (_e, dir: string) => readSetRepaired(await inLibrary(dir)))
  handle('library:createFolder', async (_e, parent: string, name: string) =>
    createFolder(await inLibrary(parent), name)
  )
  handle('library:trash', async (_e, p: string) => {
    const root = (await getSettings()).libraryRoot
    await inLibrary(p)
    if (p === root) throw new Error('ライブラリのルートは削除できません')
    await shell.trashItem(p)
  })
  handle('library:updateSet', async (_e, dir: string, set: ProblemSet) => {
    await writeSetFiles(await inLibrary(dir), set)
  })
  handle('library:readFigure', async (_e, dir: string, index: number) =>
    readFigure(await inLibrary(dir), index)
  )
  handle('library:references', async (_e, dir: string) => listReferences(await inLibrary(dir)))
  handle('shell:openPath', async (_e, p: string) => {
    await inLibrary(p)
    const err = await shell.openPath(p)
    if (err) throw new Error(err)
  })
  handle('shell:reveal', (_e, p: string) => shell.showItemInFolder(p))
  handle('shell:openTex', async (_e, dir: string, which: 'problems' | 'answers') => {
    const err = await shell.openPath(
      join(await inLibrary(dir), which === 'problems' ? PROBLEMS_TEX : ANSWERS_TEX)
    )
    if (err) throw new Error(err)
  })

  /* ---------- 問題作成 ---------- */
  handle('generate:run', async (e, req: GenerateRequest, requestId: string) => {
    await inLibrary(req.dir)
    const files = validateAttachments(req.attachments ?? [])
    const { model, apiKey } = await modelWithKey(req.model)
    const settings = await getSettings()
    const prompt = buildPrompt(settings.promptTemplate, { ...req, attachments: files })
    const progress = (text: string): void => {
      if (!e.sender.isDestroyed()) e.sender.send('generate:progress', requestId, text)
    }
    const ctrl = new AbortController()
    running.set(requestId, ctrl)
    try {
      progress(
        files.length ? `参考資料 ${files.length} 件を読み込んで問題を作成中…` : '問題を作成中…'
      )
      const raw = await generateStructured(model, apiKey, prompt, files, ctrl.signal)
      const result = parseResult(raw)

      // 図をコンパイル (失敗したら AI に1回だけ修正を依頼する)
      const figures = new Map<number, string>()
      const withFigure = result.problems.filter((p) => p.figure).length
      let done = 0
      for (const [i, p] of result.problems.entries()) {
        if (!p.figure) continue
        if (ctrl.signal.aborted) throw new Error('中止しました')
        done++
        progress(`図を描画中（${done}/${withFigure}）…`)
        let r = await compileFigure(p.figure)
        if (r.error) {
          progress(`図を修正中（${done}/${withFigure}）…`)
          try {
            const fixed = normalizeFigure(
              await generateText(model, apiKey, figureRepairPrompt(p.figure, r.error), ctrl.signal)
            )
            if (fixed) {
              const r2 = await compileFigure(fixed)
              if (r2.svg) {
                p.figure = fixed
                r = r2
              }
            }
          } catch {
            /* 修正に失敗しても、問題自体は保存する */
          }
        }
        if (r.svg) figures.set(i, r.svg)
        else p.figureError = r.error
      }

      progress('保存中…')
      const { dir: _dir, model: _model, attachments: _att, ...request } = req
      void _dir
      void _model
      void _att
      const set: ProblemSet = {
        version: 1,
        title: result.title,
        createdAt: new Date().toISOString(),
        model: `${model.label} (${model.provider})`,
        request,
        problems: result.problems
      }
      return await saveSet(req.dir, set, { figures, attachments: files })
    } finally {
      running.delete(requestId)
    }
  })
  handle('request:cancel', (_e, requestId: string) => {
    running.get(requestId)?.abort()
  })

  /* ---------- チャット ---------- */
  handle('chat:load', async (_e, dir: string) => readChat(await inLibrary(dir)))
  handle('chat:save', async (_e, dir: string, messages: ChatMessage[]) =>
    writeChat(await inLibrary(dir), messages)
  )
  handle(
    'chat:send',
    async (
      e,
      dir: string,
      focusSet: string | null,
      messages: ChatMessage[],
      modelKey: string,
      requestId: string
    ) => {
      await inLibrary(dir)
      const { model, apiKey } = await modelWithKey(modelKey)
      const ctx = await buildFolderContext(dir, focusSet ?? undefined)
      const system = chatSystemPrompt(basename(dir), ctx.setCount, ctx.text)
      const ctrl = new AbortController()
      running.set(requestId, ctrl)
      try {
        return await streamChat(
          model,
          apiKey,
          system,
          messages,
          (delta) => {
            if (!e.sender.isDestroyed()) e.sender.send('chat:delta', requestId, delta)
          },
          ctrl.signal
        )
      } finally {
        running.delete(requestId)
      }
    }
  )
}
