import { isMainThread, parentPort } from 'worker_threads'
const inWorker = !isMainThread

export const settings = {
  colorNamesEnable: true
}

export function waitImmediate(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(() => {
      resolve(undefined)
    })
  })
}

export function updateSettings(obj: { colorNamesEnable: boolean }): void {
  Object.assign(settings, obj)
}

export function onError(e: unknown): void {
  if (inWorker) {
    let error = e instanceof Error ? e.message : String(e)
    let stack = e instanceof Error ? e.stack : undefined
    parentPort.postMessage({ kind: 'error', error, stack })
  } else {
    console.error(e)
  }
}
