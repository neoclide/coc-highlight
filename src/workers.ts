'use strict'
import { Logger } from 'coc.nvim'
import { Worker } from 'worker_threads'
import os from 'os'
import { ColorItem, WorkerItem } from './types'

interface ParseColorOption {
  colorNamesEnable: boolean
}

const WORKER_COUNT = Math.min(4, os.cpus().length)

export class WorkersManager {
  private workers: WorkerItem[] = []
  private _disposed = false
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
      if (!this._disposed) {
        let idx = this.workers.findIndex(o => o === item)
        if (idx !== -1) this.workers.splice(idx, 1)
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
      worker.postMessage({ kind: 'parse', colorNamesEnable: opts.colorNamesEnable, lines })
      let fn = () => {
        exited = true
        resolve(undefined)
      }
      worker.once('exit', fn)
      worker.once('message', value => {
        worker.removeListener('exit', fn)
        if (value.kind === 'error') {
          this.logger.error(`Parse error ${value.error}`, value.stack)
          reject(new Error(value.error))
        } else if (value.kind === 'result') {
          resolve(value.colors)
        } else {
          this.logger.error(`Unknown message from worker`, value)
          resolve(undefined)
        }
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
