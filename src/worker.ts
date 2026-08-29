import { isMainThread, parentPort } from 'worker_threads'
import { CancellationTokenSource } from 'vscode-languageserver-protocol'
import { parseColors } from './matchers'

interface CancelData {
  kind: 'cancel'
  id: number
}

interface ParseData {
  id: number
  kind: 'parse'
  colorNamesEnable: boolean
  lines: ReadonlyArray<string>
}

type WorkerData = CancelData | ParseData

const tokenSources = new Map<number, CancellationTokenSource>()
if (!isMainThread) {
  parentPort.on('message', async (value: WorkerData) => {
    if (value.kind === 'cancel') {
      tokenSources.get(value.id)?.cancel()
    } else if (value.kind === 'parse') {
      const source = new CancellationTokenSource()
      tokenSources.set(value.id, source)
      try {
        let res = await parseColors(value.lines, value.colorNamesEnable, source.token)
        parentPort.postMessage({ id: value.id, kind: 'result', result: res })
      } catch (e) {
        let error = e instanceof Error ? e.message : String(e)
        let stack = e instanceof Error ? e.stack : undefined
        parentPort.postMessage({ id: value.id, kind: 'result', error, stack })
      } finally {
        if (tokenSources.get(value.id) === source) {
          tokenSources.delete(value.id)
        }
      }
    }
  })
}
