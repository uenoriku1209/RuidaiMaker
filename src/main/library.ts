import { promises as fs, existsSync } from 'fs'
import { join, basename, relative, isAbsolute } from 'path'
import { problemsTex, answersTex } from './latex'
import type {
  CircuitStyle,
  ProblemItem,
  Attachment,
  ChatMessage,
  FolderListing,
  ProblemSet,
  ReferenceFile,
  SetEntry
} from '../shared/types'
import { repairLatex, repairJsonEscapes } from '../shared/latexFix'

export const SET_FILE = 'set.json'
export const PROBLEMS_TEX = '問題.tex'
export const ANSWERS_TEX = '解答.tex'
const CHAT_FILE = '.chat.json'
export const REF_DIR = '参考資料'
export const figureFile = (i: number): string => `図${i + 1}.svg`

function sanitize(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|\r\n]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || '無題'
  )
}

export function isSetDir(dir: string): boolean {
  return existsSync(join(dir, SET_FILE))
}

/** ライブラリ外へのアクセスを防ぐ */
export function assertInside(root: string, p: string): void {
  const rel = relative(root, p)
  if (rel === '') return
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('ライブラリの外にはアクセスできません')
}

export async function readSet(dir: string): Promise<ProblemSet> {
  return JSON.parse(await fs.readFile(join(dir, SET_FILE), 'utf8'))
}

/**
 * 問題セットを読み込み、$...$ で囲まれていない数式があれば補って保存し直す
 * (以前に作った問題セットの .tex もコンパイルできるようにするため)
 */
export async function readSetRepaired(
  dir: string,
  style: CircuitStyle = 'jis'
): Promise<{ set: ProblemSet; redrawFigures: number[] }> {
  const set = await readSet(dir)
  let changed = false
  const redrawFigures: number[] = []
  const problems = set.problems.map((p, i) => {
    // 図などのほかの項目はそのまま残す
    const fixed: ProblemItem = {
      ...p,
      problem: repairLatex(p.problem),
      solution: repairLatex(p.solution),
      answer: repairLatex(p.answer)
    }
    if (p.figure) {
      fixed.figure = repairJsonEscapes(p.figure)
      if (fixed.figure !== p.figure) redrawFigures.push(i)
    }
    if (
      fixed.problem !== p.problem ||
      fixed.solution !== p.solution ||
      fixed.answer !== p.answer ||
      fixed.figure !== p.figure
    )
      changed = true
    return fixed
  })
  if (!changed) return { set, redrawFigures }
  const repaired = { ...set, problems }
  await writeSetFiles(dir, repaired, style)
  return { set: repaired, redrawFigures }
}

function toEntry(dir: string, s: ProblemSet): SetEntry {
  return {
    path: dir,
    name: basename(dir),
    title: s.title,
    createdAt: s.createdAt,
    count: s.problems.length,
    field: s.request.field,
    difficulty: s.request.difficulty
  }
}

/** フォルダ直下のサブフォルダと問題セットを一覧する */
export async function listFolder(dir: string): Promise<FolderListing> {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const folders: FolderListing['folders'] = []
  const sets: SetEntry[] = []
  for (const d of dirents) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue
    const p = join(dir, d.name)
    if (isSetDir(p)) {
      try {
        sets.push(toEntry(p, await readSet(p)))
      } catch {
        /* 壊れた set.json は無視 */
      }
    } else folders.push({ name: d.name, path: p })
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }))
  sets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { folders, sets }
}

export async function createFolder(parent: string, name: string): Promise<string> {
  const p = join(parent, sanitize(name))
  if (existsSync(p)) throw new Error('同じ名前のフォルダがあります')
  await fs.mkdir(p)
  return p
}

/** 問題セットを保存する (set.json + 問題.tex + 解答.tex) */
export interface SetExtras {
  /** 問題番号 (0始まり) → SVG */
  figures?: Map<number, string>
  attachments?: Attachment[]
  circuitStyle?: CircuitStyle
}

export async function saveSet(
  dir: string,
  set: ProblemSet,
  extras: SetExtras = {}
): Promise<string> {
  const d = new Date(set.createdAt)
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const base = `${stamp}_${sanitize(set.title)}`
  let target = join(dir, base)
  let n = 2
  while (existsSync(target)) target = join(dir, `${base} (${n++})`)
  await fs.mkdir(target, { recursive: true })
  for (const [i, svg] of extras.figures ?? []) {
    await fs.writeFile(join(target, figureFile(i)), svg, 'utf8')
  }
  if (extras.attachments?.length) {
    await fs.mkdir(join(target, REF_DIR), { recursive: true })
    const used = new Set<string>()
    const names: string[] = []
    for (const a of extras.attachments) {
      let name = sanitize(a.name)
      while (used.has(name)) name = `_${name}`
      used.add(name)
      names.push(name)
      await fs.writeFile(join(target, REF_DIR, name), Buffer.from(a.data, 'base64'))
    }
    set = { ...set, request: { ...set.request, references: names } }
  }
  await writeSetFiles(target, set, extras.circuitStyle)
  return target
}

export async function writeSetFiles(
  target: string,
  set: ProblemSet,
  style: CircuitStyle = 'jis'
): Promise<void> {
  await fs.writeFile(join(target, SET_FILE), JSON.stringify(set, null, 2), 'utf8')
  await fs.writeFile(join(target, PROBLEMS_TEX), problemsTex(set, style), 'utf8')
  await fs.writeFile(join(target, ANSWERS_TEX), answersTex(set, style), 'utf8')
}

/* ---------- チャット用 ---------- */

const CONTEXT_LIMIT = 150_000 // 文字数の目安

/**
 * チャットに渡す問題集の内容を組み立てる。
 * 開いているフォルダが問題セットならそのセット、そうでなければ直下 (と1階層下) のセットすべて。
 */
export async function buildFolderContext(
  dir: string,
  focusSet?: string
): Promise<{ text: string; setCount: number }> {
  const setDirs: string[] = []
  if (isSetDir(dir)) setDirs.push(dir)
  else {
    const { folders, sets } = await listFolder(dir)
    setDirs.push(...sets.map((s) => s.path))
    for (const f of folders.slice(0, 30)) {
      try {
        setDirs.push(...(await listFolder(f.path)).sets.map((s) => s.path))
      } catch {
        /* noop */
      }
    }
  }
  // 開いているセットを先頭に
  if (focusSet) {
    const i = setDirs.indexOf(focusSet)
    if (i > 0) setDirs.unshift(...setDirs.splice(i, 1))
  }

  const parts: string[] = []
  let length = 0
  let used = 0
  for (const sd of setDirs) {
    let s: ProblemSet
    try {
      s = await readSet(sd)
    } catch {
      continue
    }
    const withSolution = length < CONTEXT_LIMIT * 0.6
    const body = s.problems
      .map(
        (p, i) =>
          `### 問${i + 1}\n【問題】\n${p.problem}` +
          (p.figure ? `\n【問題の図（TikZ コード）】\n${p.figure}` : '') +
          `\n【解答（最終的な答え）】\n${p.answer}` +
          (withSolution && p.solution
            ? `\n【解法メモ（作成時に AI が解いた過程。利用者には非表示）】\n${p.solution}`
            : '')
      )
      .join('\n\n')
    const block = `## 問題セット「${s.title}」（フォルダ: ${basename(sd)}、分野: ${s.request.field}、難易度 ${s.request.difficulty}/5）\n${body}`
    if (length + block.length > CONTEXT_LIMIT) break
    parts.push(block)
    length += block.length
    used++
  }
  return { text: parts.join('\n\n---\n\n'), setCount: used }
}

/** 図 (SVG) を保存する */
export async function writeFigure(dir: string, index: number, svg: string): Promise<void> {
  await fs.writeFile(join(dir, figureFile(index)), svg, 'utf8')
}

/** 保存済みの図 (SVG) を読む。無ければ null */
export async function readFigure(dir: string, index: number): Promise<string | null> {
  try {
    return await fs.readFile(join(dir, figureFile(index)), 'utf8')
  } catch {
    return null
  }
}

const REF_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf'
}

/** 問題セットの参考資料一覧 (画像は表示用の data URL 付き) */
export async function listReferences(dir: string): Promise<ReferenceFile[]> {
  const refDir = join(dir, REF_DIR)
  let names: string[]
  try {
    names = await fs.readdir(refDir)
  } catch {
    return []
  }
  const out: ReferenceFile[] = []
  for (const name of names.sort()) {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const mime = REF_MIME[ext] ?? 'application/octet-stream'
    const path = join(refDir, name)
    const file: ReferenceFile = { name, mime, path }
    if (mime.startsWith('image/')) {
      const st = await fs.stat(path)
      if (st.size < 8 * 1024 * 1024)
        file.dataUrl = `data:${mime};base64,${(await fs.readFile(path)).toString('base64')}`
    }
    out.push(file)
  }
  return out
}

export async function readChat(dir: string): Promise<ChatMessage[]> {
  try {
    return JSON.parse(await fs.readFile(join(dir, CHAT_FILE), 'utf8'))
  } catch {
    return []
  }
}

export async function writeChat(dir: string, messages: ChatMessage[]): Promise<void> {
  await fs.writeFile(join(dir, CHAT_FILE), JSON.stringify(messages.slice(-200), null, 2), 'utf8')
}
