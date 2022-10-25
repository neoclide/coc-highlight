import { isMainThread, parentPort } from 'worker_threads'
import { CancellationTokenSource } from 'vscode-languageserver-protocol'
import { parseColors } from './matchers'

interface CancelData {
  kind: 'cancel'
}

interface ExitData {
  kind: 'exit'
}

interface ParseData {
  id: number
  kind: 'parse'
  colorNamesEnable: boolean
  lines: ReadonlyArray<string>
}

type WorkerData = CancelData | ExitData | ParseData

let tokenSource: CancellationTokenSource
if (!isMainThread) {
  parentPort.on('message', async (value: WorkerData) => {
    if (value.kind === 'cancel') {
      if (tokenSource) tokenSource.cancel()
    } else if (value.kind === 'exit') {
      if (tokenSource) tokenSource.cancel()
      process.exit()
    } else if (value.kind === 'parse') {
      if (tokenSource) tokenSource.cancel()
      tokenSource = new CancellationTokenSource()
      try {
        let res = await parseColors(value.lines, value.colorNamesEnable, tokenSource.token)
        parentPort.postMessage({ id: value.id, kind: 'result', result: res })
      } catch (e) {
        parentPort.postMessage({ id: value.id, kind: 'result', error: e.message, stack: e.stack })
      }
    }
  })
}
