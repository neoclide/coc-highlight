import { isMainThread, parentPort } from 'worker_threads'
import { CancellationTokenSource } from 'vscode-languageserver-protocol'
import { parseColors } from './matchers'
import { onError } from './util'

interface CancelData {
  kind: 'cancel'
}

interface ExitData {
  kind: 'exit'
}

interface ParseData {
  kind: 'parse'
  colorNamesEnable: boolean
  lines: ReadonlyArray<string>
}

type WorkerData = CancelData | ExitData | ParseData

let tokenSource: CancellationTokenSource
if (!isMainThread) {
  parentPort.on('message', (value: WorkerData) => {
    if (value.kind === 'cancel') {
      if (tokenSource) tokenSource.cancel()
    } else if (value.kind === 'exit') {
      if (tokenSource) tokenSource.cancel()
      process.exit()
    } else if (value.kind === 'parse') {
      tokenSource = new CancellationTokenSource()
      parseColors(value.lines, value.colorNamesEnable, tokenSource.token).then(res => {
        parentPort.postMessage({ kind: 'result', colors: res })
      }, e => {
        onError(e)
      })
    }
  })
}
