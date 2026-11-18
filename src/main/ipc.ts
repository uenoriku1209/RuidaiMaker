import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { basename } from 'path'
import { buildPrompt, parseResult, problemDigest, type GenerateResult } from './prompt'
import { generateStructured, listModels, streamChat } from './providers'
import { compileFigure, normalizeFigure } from './figures'
import { brushupFigure, compileWithRepair } from './brushup'
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
  readSet,
  readSetRepaired,
  readFigure,
  writeFigure,
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
  ProblemItem,
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

/** 1回の作成で作れる問題数の上限と、1回の AI 呼び出しで作る問題数 */
const MAX_PROBLEMS = 50
const BATCH_SIZE = 10

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
  handle('library:readSet', async (_e, dir: string) => {
    const settings = await getSettings()
    const { set, redrawFigures } = await readSetRepaired(
      await inLibrary(dir),
      settings.circuitStyle
    )
    // 修復でコードが変わった図は描き直す
    for (const i of redrawFigures) {
      const code = set.problems[i].figure
      if (!code) continue
      const r = await compileFigure(code, settings.circuitStyle ?? 'jis')
      if (r.svg) {
        await writeFigure(dir, i, r.svg)
        set.problems[i].figureError = undefined
      }
    }
    return set
  })
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
    await writeSetFiles(await inLibrary(dir), set, (await getSettings()).circuitStyle)
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

  /* ---------- 図の操作 (ブラッシュアップ・手で編集・元に戻す) ---------- */

  /** 図を置き換えて保存する (前のコードは履歴に残す) */
  const replaceFigure = async (
    dir: string,
    set: ProblemSet,
    index: number,
    code: string,
    svg: string
  ): Promise<ProblemItem> => {
    const item = set.problems[index]
    const history = [...(item.figureHistory ?? []), ...(item.figure ? [item.figure] : [])].slice(
      -10
    )
    const next: ProblemItem = {
      ...item,
      figure: code,
      figureError: undefined,
      figureHistory: history
    }
    set.problems[index] = next
    await writeFigure(dir, index, svg)
    await writeSetFiles(dir, set, (await getSettings()).circuitStyle)
    return next
  }

  handle(
    'figure:brushup',
    async (
      _e,
      dir: string,
      index: number,
      instruction: string,
      modelKey: string,
      requestId: string
    ) => {
      await inLibrary(dir)
      const settings = await getSettings()
      const { model, apiKey } = await modelWithKey(modelKey || settings.generateModel)
      const set = await readSet(dir)
      const item = set.problems[index]
      if (!item?.figure) throw new Error('この問題には図がありません')
      const ctrl = new AbortController()
      running.set(requestId, ctrl)
      try {
        const ctx = { model, apiKey, style: settings.circuitStyle ?? 'jis', signal: ctrl.signal }
        // まだ描画できていない図は、先に描画 (修正) してからブラッシュアップする
        let code = item.figure
        let svg = await readFigure(dir, index)
        if (!svg) {
          const r = await compileWithRepair(code, ctx)
          if (!r.svg) throw new Error(`図を描画できませんでした（${r.error ?? '不明なエラー'}）`)
          code = r.code
          svg = r.svg
        }
        const b = await brushupFigure(item.problem, code, svg, instruction, ctx)
        if (!b.changed && code === item.figure) return { item, changed: false }
        return { item: await replaceFigure(dir, set, index, b.code, b.svg), changed: true }
      } finally {
        running.delete(requestId)
      }
    }
  )

  handle('figure:update', async (_e, dir: string, index: number, code: string) => {
    await inLibrary(dir)
    const settings = await getSettings()
    const normalized = normalizeFigure(code)
    if (!normalized)
      throw new Error('\\begin{tikzpicture} または \\begin{circuitikz} の環境を書いてください')
    const r = await compileFigure(normalized, settings.circuitStyle ?? 'jis')
    if (!r.svg) throw new Error(r.error ?? '図を描画できませんでした')
    const set = await readSet(dir)
    if (!set.problems[index]) throw new Error('問題が見つかりません')
    return replaceFigure(dir, set, index, normalized, r.svg)
  })

  handle('figure:undo', async (_e, dir: string, index: number) => {
    await inLibrary(dir)
    const settings = await getSettings()
    const set = await readSet(dir)
    const item = set.problems[index]
    const prev = item?.figureHistory?.at(-1)
    if (!prev) throw new Error('元に戻せる図がありません')
    const r = await compileFigure(prev, settings.circuitStyle ?? 'jis')
    if (!r.svg) throw new Error(r.error ?? '図を描画できませんでした')
    const next: ProblemItem = {
      ...item,
      figure: prev,
      figureError: undefined,
      figureHistory: item.figureHistory!.slice(0, -1)
    }
    set.problems[index] = next
    await writeFigure(dir, index, r.svg)
    await writeSetFiles(dir, set, settings.circuitStyle)
    return next
  })

  /* ---------- 問題作成 ---------- */
  handle('generate:run', async (e, req: GenerateRequest, requestId: string) => {
    await inLibrary(req.dir)
    const files = validateAttachments(req.attachments ?? [])
    const { model, apiKey } = await modelWithKey(req.model)
    const settings = await getSettings()
    const progress = (text: string): void => {
      if (!e.sender.isDestroyed()) e.sender.send('generate:progress', requestId, text)
    }
    const ctrl = new AbortController()
    running.set(requestId, ctrl)
    try {
      // 11問以上は10問ずつに分けて作成する (1回の出力が長すぎると途中で切れるため)
      const total = Math.max(1, Math.min(MAX_PROBLEMS, Math.floor(req.count)))
      const batches = Math.ceil(total / BATCH_SIZE)
      const problems: GenerateResult['problems'] = []
      let title = ''
      let warning: string | undefined
      for (let b = 0; b < batches; b++) {
        if (ctrl.signal.aborted) throw new Error('中止しました')
        const from = b * BATCH_SIZE + 1
        const to = Math.min(total, from + BATCH_SIZE - 1)
        const range = batches > 1 ? `（${from}〜${to} 問目／全 ${total} 問）` : ''
        progress(
          files.length && b === 0
            ? `参考資料 ${files.length} 件を読み込んで問題を作成中${range}…`
            : `問題を作成中${range}…`
        )
        const prompt = buildPrompt(
          settings.promptTemplate,
          { ...req, count: to - from + 1, attachments: files },
          {
            index: b,
            total: batches,
            from,
            to,
            totalCount: total,
            previous: problems.map((p) => problemDigest(p.problem))
          }
        )
        try {
          const raw = await generateStructured(model, apiKey, prompt, files, ctrl.signal)
          const r = parseResult(raw)
          if (!title) title = r.title
          problems.push(...r.problems.slice(0, to - from + 1))
        } catch (err) {
          // 途中まで作れていれば、そこまでを保存する
          if (problems.length === 0 || ctrl.signal.aborted) throw err
          warning = `${problems.length} 問まで作成した時点でエラーになったため、そこまでを保存しました（${err instanceof Error ? err.message : String(err)}）`
          break
        }
      }
      const result: GenerateResult = { title, problems }

      // 図を描画 (失敗したら AI に1回修正させる) → 必要なら描いた図を AI に見せて1回改善
      const style = settings.circuitStyle ?? 'jis'
      const ctx = { model, apiKey, style, signal: ctrl.signal }
      const figures = new Map<number, string>()
      const withFigure = result.problems.filter((p) => p.figure).length
      let done = 0
      for (const [i, p] of result.problems.entries()) {
        if (!p.figure) continue
        if (ctrl.signal.aborted) throw new Error('中止しました')
        done++
        progress(`図を描画中（${done}/${withFigure}）…`)
        const r = await compileWithRepair(p.figure, {
          ...ctx,
          onRepair: () =>
            progress(`図を修正中（${done}/${withFigure}・描画できなかったため AI に修正を依頼）…`)
        })
        p.figure = r.code
        if (!r.svg) {
          p.figureError = r.error
          continue
        }
        let svg = r.svg
        if (req.figureReview) {
          progress(`図をブラッシュアップ中（${done}/${withFigure}）…`)
          try {
            const b = await brushupFigure(p.problem, p.figure, svg, '', ctx)
            if (b.changed) {
              p.figureHistory = [p.figure]
              p.figure = b.code
              svg = b.svg
            }
          } catch {
            /* ブラッシュアップに失敗しても、元の図を使う */
          }
        }
        figures.set(i, svg)
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
      const path = await saveSet(req.dir, set, { figures, attachments: files, circuitStyle: style })
      return { path, warning }
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
