'use strict'
import { Logger } from 'coc.nvim'
import { Worker } from 'worker_threads'
import os from 'os'
import { ColorItem, WorkerItem } from './types'

interface ParseColorOption {
  colorNamesEnable: boolean
}

const WORKER_COUNT = Math.min(4, os.cpus().length)

const createUID: () => number = (() => {
  let id = 0
  return () => {
    return id++
  }
})()

export class WorkersManager {
  private workers: WorkerItem[] = []
  private _disposed = false
  private callbacks: Map<number, (res?: any, error?: Error) => void> = new Map()
  constructor(private file: string, private logger: Logger) {
    for (let i = 0; i < WORKER_COUNT; i++) {
      this.createWorker()
    }
  }

  private createWorker(): WorkerItem {
    let worker = new Worker(this.file, { workerData: '' })
    let item = { busy: false, worker: worker }
    this.workers.push(item)
    worker.on('exit', () => {
      if (this._disposed) return
      let idx = this.workers.findIndex(o => o === item)
      if (idx !== -1) this.workers.splice(idx, 1)

    })
    worker.on('message', value => {
      let cb
      if (typeof value.id === 'number') {
        cb = this.callbacks.get(value.id)
        if (cb) this.callbacks.delete(value.id)
      }
      if (value.kind === 'error') {
        this.logger.error(`Worker error ${value.error}`, value.stack)
        if (cb) {
          let err = new Error(value.error)
          if (value.stack) err.stack = value.stack
          cb(undefined, err)
        }
      } else if (value.kind === 'result') {
        if (cb) {
          if (value.error) {
            let err = new Error(value.error)
            if (value.stack) err.stack = value.stack
            cb(undefined, err)
          } else {
            cb(value.result)
          }
        }
      } else {
        this.logger.error(`Unknown message from worker`, value)
      }
    })
    return item
  }

  private getWorker(bufnr: number): WorkerItem {
    let item = this.workers.find(o => o.bufnr === bufnr)
    if (item) return item
    item = this.workers.find(o => !o.busy)
    if (item) return item
    item = this.createWorker()
    return item
  }

  public async parseLines(bufnr: number, lines: ReadonlyArray<string>, opts: ParseColorOption): Promise<(ReadonlyArray<ColorItem>)[] | undefined> {
    let item = this.getWorker(bufnr)
    item.bufnr = bufnr
    item.busy = true
    let { worker } = item
    let exited = false
    let res = await new Promise((resolve, reject) => {
      let id = createUID()
      worker.postMessage({ id, kind: 'parse', colorNamesEnable: opts.colorNamesEnable, lines })
      let fn = () => {
        this.callbacks.delete(id)
        exited = true
        resolve(undefined)
      }
      worker.once('exit', fn)
      this.callbacks.set(id, (result, error) => {
        worker.removeListener('exit', fn)
        if (error) return reject(error)
        resolve(result)
      })
    })
    item.busy = false
    if (this.workers.length > WORKER_COUNT && !exited) {
      item.worker.postMessage({ kind: 'exit' })
    }
    return res as ReadonlyArray<ColorItem>[]
  }

  public cancel(bufnr: number): void {
    let item = this.workers.find(o => o.bufnr === bufnr)
    if (item) {
      item.worker.postMessage({ kind: 'cancel' })
      item.busy = false
    }
  }

  public dispose(): void {
    this._disposed = true
    this.workers.forEach(item => {
      item.worker.postMessage({ kind: 'exit' })
    })
    this.workers = []
  }
}
