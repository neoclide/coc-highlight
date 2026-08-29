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
  constructor(private file: string, private logger: Logger) { }

  private createWorker(): WorkerItem {
    let worker = new Worker(this.file)
    let item: WorkerItem = { busy: false, worker: worker }
    this.workers.push(item)
    // let ts = Date.now()
    // worker.on('online', () => {
    //   this.logger.debug(`Worker started after ${Date.now() - ts}ms`)
    // })
    worker.on('error', err => {
      this.logger.error(`Worker error ${err.message}`, err.stack)
      let id = item.requestId
      if (typeof id === 'number') {
        let cb = this.callbacks.get(id)
        if (cb) {
          this.callbacks.delete(id)
          cb(undefined, err)
        }
      }
    })
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
        if (cb) {
          let err = new Error(`Unknown message from worker`)
          cb(undefined, err)
        }
      }
    })
    worker.unref()
    return item
  }

  private getWorker(bufnr: number): WorkerItem {
    let item = this.workers.find(o => o.bufnr === bufnr && !o.busy)
    if (item) return item
    item = this.workers.find(o => !o.busy)
    if (item) return item
    item = this.createWorker()
    return item
  }

  public async parseLines(bufnr: number, lines: ReadonlyArray<string>, opts: ParseColorOption): Promise<(ReadonlyArray<ColorItem>)[] | undefined> {
    if (this._disposed) return undefined
    let item = this.getWorker(bufnr)
    item.bufnr = bufnr
    item.busy = true
    let { worker } = item
    worker.ref()
    let id = createUID()
    item.requestId = id
    try {
      return await new Promise((resolve, reject) => {
        let settled = false
        let callback: (res?: any, error?: Error) => void
        let cleanup = () => {
          worker.removeListener('exit', onExit)
          if (this.callbacks.get(id) === callback) this.callbacks.delete(id)
        }
        let settle = (result?: any, error?: Error) => {
          if (settled) return
          settled = true
          cleanup()
          if (error) reject(error)
          else resolve(result)
        }
        let onExit = () => settle(undefined)
        callback = settle
        worker.once('exit', onExit)
        this.callbacks.set(id, callback)
        try {
          worker.postMessage({ id, kind: 'parse', colorNamesEnable: opts.colorNamesEnable, lines })
        } catch (e) {
          let error = e instanceof Error ? e : new Error(String(e))
          settle(undefined, error)
        }
      }) as (ReadonlyArray<ColorItem>)[] | undefined
    } finally {
      if (item.requestId === id) {
        item.requestId = undefined
        item.busy = false
        if (this.workers.length > WORKER_COUNT) {
          let idx = this.workers.indexOf(item)
          if (idx !== -1) {
            this.workers.splice(idx, 1)
            void item.worker.terminate()
          }
        } else if (this.workers.includes(item)) {
          item.worker.unref()
        }
      }
    }
  }

  public cancel(bufnr: number): void {
    for (let item of this.workers) {
      if (item.bufnr === bufnr && typeof item.requestId === 'number') {
        try {
          item.worker.postMessage({ kind: 'cancel', id: item.requestId })
        } catch (e) {
          this.logger.error(`Worker cancel error`, e)
        }
      }
    }
  }

  public dispose(): void {
    this._disposed = true
    this.workers.forEach(item => {
      item.worker.terminate()
    })
    this.workers = []
    for (let cb of this.callbacks.values()) cb()
    this.callbacks.clear()
  }
}
