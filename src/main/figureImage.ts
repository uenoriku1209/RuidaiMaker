// 図 (SVG) を PNG 画像にする。ブラッシュアップ時に AI に「描いた図の見た目」を見せるために使う。
import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, dirname, sep } from 'path'
import { pathToFileURL } from 'url'

/** node-tikzjax の数式フォント (fonts.css) の場所 */
function fontsCssUrl(): string {
  let pkg = dirname(require.resolve('node-tikzjax/package.json'))
  // ビルド版では asar の外 (app.asar.unpacked) に置いている
  pkg = pkg.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
  return pathToFileURL(join(pkg, 'css', 'fonts.css')).href
}

const WIDTH = 1000
const HEIGHT = 750

/** SVG を白背景の PNG にして、base64 で返す */
export async function svgToPngBase64(svg: string): Promise<string> {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontsCssUrl()}">
<style>
  html, body { margin: 0; background: #fff; overflow: hidden; }
  body { width: ${WIDTH}px; height: ${HEIGHT}px; display: flex; align-items: center; justify-content: center; }
  svg { width: ${WIDTH - 60}px; height: ${HEIGHT - 60}px; }
</style></head><body>${svg}</body></html>`
  const dir = await fs.mkdtemp(join(app.getPath('temp'), 'ruidai-fig-'))
  const file = join(dir, 'figure.html')
  await fs.writeFile(file, html, 'utf8')
  const win = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true }
  })
  try {
    await win.loadFile(file)
    // フォントの読み込みを待ってから撮る
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    await new Promise((r) => setTimeout(r, 200))
    const img = await win.webContents.capturePage()
    return img.toPNG().toString('base64')
  } finally {
    win.destroy()
    fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
