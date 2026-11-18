// 図の描画 (TikZ → SVG) を別スレッドで行うワーカー。
// TeX エンジンは処理中にスレッドを占有し、コードによっては無限ループすることもあるため、
// メインプロセスから切り離して、時間切れのときはスレッドごと止められるようにしている。
import { parentPort } from 'worker_threads'

type Tex2Svg = (input: string, options?: Record<string, unknown>) => Promise<string>

let tex2svg: Tex2Svg | null = null
async function engine(): Promise<Tex2Svg> {
  if (!tex2svg) {
    const m = (await import('node-tikzjax')) as unknown as {
      default?: Tex2Svg | { default?: Tex2Svg }
    }
    const d = m.default as { default?: Tex2Svg } | Tex2Svg | undefined
    tex2svg = (typeof d === 'function' ? d : d?.default) ?? null
    if (!tex2svg) throw new Error('図の描画エンジンを読み込めませんでした')
  }
  return tex2svg
}

interface Job {
  id: number
  source: string
  options: Record<string, unknown>
}

parentPort?.on('message', async (job: Job) => {
  // TeX エンジンのログを横取りして、エラー内容を返す
  const logs: string[] = []
  const origLog = console.log
  const origErr = console.error
  const origWrite = process.stdout.write.bind(process.stdout)
  console.log = (...a: unknown[]) => void logs.push(a.join(' '))
  console.error = console.log
  process.stdout.write = ((chunk: unknown) => {
    logs.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    const run = await engine()
    const svg = await run(job.source, job.options)
    parentPort?.postMessage({ id: job.id, svg })
  } catch (e) {
    parentPort?.postMessage({
      id: job.id,
      log: logs.join(''),
      message: e instanceof Error ? e.message : String(e)
    })
  } finally {
    console.log = origLog
    console.error = origErr
    process.stdout.write = origWrite
  }
})
