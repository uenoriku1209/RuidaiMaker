import { ATTACHMENT_TYPES, type Attachment } from '../../../shared/types'

/** 画像の長辺の上限 (これより大きい画像は縮小して送る) */
const MAX_SIDE = 2000
/** これより大きい画像は再圧縮する (Claude の画像は 1 枚 5MB まで) */
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024

export interface PendingAttachment extends Attachment {
  /** 画像のプレビュー用 */
  previewUrl?: string
  size: number
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step)
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(bin)
}

function guessMime(file: File): string {
  if (file.type) return file.type === 'image/jpg' ? 'image/jpeg' : file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext === 'pdf'
    ? 'application/pdf'
    : ext === 'png'
      ? 'image/png'
      : ext === 'webp'
        ? 'image/webp'
        : ext === 'gif'
          ? 'image/gif'
          : 'image/jpeg'
}

/** 大きな画像を縮小・JPEG 化する (透過部分は白にする) */
async function shrinkImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const r = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * r)
  canvas.height = Math.round(bmp.height * r)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))),
      'image/jpeg',
      0.9
    )
  )
}

/** ファイル (選択・ドロップ・貼り付け) を送信用の形式にする */
export async function toAttachment(file: File): Promise<PendingAttachment> {
  let mime = guessMime(file)
  if (!ATTACHMENT_TYPES.includes(mime)) {
    throw new Error(`「${file.name}」は対応していない形式です（PNG / JPEG / WebP / GIF / PDF）`)
  }
  let blob: Blob = file
  let name = file.name || `貼り付け画像.${mime.split('/')[1]}`
  if (mime.startsWith('image/') && mime !== 'image/gif') {
    const bmp = await createImageBitmap(file)
    const big = Math.max(bmp.width, bmp.height) > MAX_SIDE || file.size > MAX_IMAGE_BYTES
    bmp.close()
    if (big) {
      blob = await shrinkImage(file)
      mime = 'image/jpeg'
      name = name.replace(/\.\w+$/, '') + '.jpg'
    }
  }
  if (blob.size > 15 * 1024 * 1024) throw new Error(`「${file.name}」は大きすぎます（15MB まで）`)
  const data = toBase64(await blob.arrayBuffer())
  return {
    name,
    mime,
    data,
    size: blob.size,
    previewUrl: mime.startsWith('image/') ? `data:${mime};base64,${data}` : undefined
  }
}
