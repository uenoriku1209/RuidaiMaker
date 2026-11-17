export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const p = (x: number): string => String(x).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

export function parentDir(p: string): string {
  const s = p.includes('\\') ? '\\' : '/'
  const parts = p.split(/[\\/]/)
  parts.pop()
  const r = parts.join(s)
  return r.endsWith(':') ? r + s : r || s
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const DIFFICULTY = [
  { level: 1, label: '基礎' },
  { level: 2, label: 'やや易' },
  { level: 3, label: '標準' },
  { level: 4, label: 'やや難' },
  { level: 5, label: '難関' }
]
