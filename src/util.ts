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

export function onError(e: Error): void {
  if (inWorker) {
    parentPort.postMessage({ kind: 'error', error: e.message, stack: e.stack })
  } else {
    console.error(e)
  }
}
