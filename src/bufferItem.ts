'use strict'
import { BufferSyncItem, ColorInformation, CancellationTokenSource, DidChangeTextDocumentParams, Document, Mutex, OutputChannel, workspace, Range, CancellationToken, Disposable } from 'coc.nvim'
import { inspect } from 'util'
import type { WorkersManager } from './workers'
import { ColorItem, Settings } from './types'

export default class ColorBuffer implements BufferSyncItem {
  private tokenSource = new CancellationTokenSource()
  /**
   * typos for each line.
   */
  private colors: ReadonlyArray<ColorItem>[] | undefined
  private colorFiletyps: string[] = []
  private mutex = new Mutex()
  constructor(
    private doc: Document,
    private config: Settings,
    private output: OutputChannel,
    private manager: WorkersManager
  ) {
    let colorConfig = workspace.getConfiguration('colors', doc.uri)
    let colorFiletyps = this.colorFiletyps = colorConfig.get('filetypes', [])
    if (!this.config.colorsEnable) {
      this.warn(`Color highlight disabled by "highlight.colors.enable": false`)
    } else if (!colorFiletyps.includes('*') && !colorFiletyps.includes(this.doc.filetype)) {
      this.warn(`Color highlight of ${doc.uri} not enabeld by "colors.filetypes": ${JSON.stringify(colorFiletyps)}`)
    } else if (this.isDisabled) {
      this.warn(`Color highlight of ${doc.uri} ignored by "highlight.disableLanguages"`)
    }
    void this.getColors()
  }

  public async getColorInformation(token: CancellationToken): Promise<ColorInformation[] | undefined> {
    let colors: ColorInformation[] | undefined
    let timer
    let disposable: Disposable
    await new Promise<void>(resolve => {
      disposable = token.onCancellationRequested(() => {
        resolve()
      })
      timer = setTimeout(() => {
        resolve()
      }, 1000)
      let clean = () => {
        clearTimeout(timer)
        if (disposable) disposable.dispose()
      }
      this.mutex.acquire().then(release => {
        clean()
        release()
        if (this.colors) {
          colors = []
          for (let i = 0; i < this.colors.length; i++) {
            let arr = this.colors[i]
            for (let item of arr) {
              colors.push({
                color: item.color,
                range: Range.create(i, item.span[0], i, item.span[1])
              })
            }
          }
        }
        resolve()
      }, () => {
        clean()
        resolve()
      })
    })
    return colors
  }

  private cancel(): void {
    if (this.tokenSource) {
      this.tokenSource.cancel()
    }
    this.manager.cancel(this.doc.bufnr)
  }

  private get isDisabled(): boolean {
    if (!this.config.colorsEnable) return true
    if (this.config.disableLanguages.includes(this.doc.filetype)) return true
    let { colorFiletyps } = this
    if (!colorFiletyps.includes('*') && !colorFiletyps.includes(this.doc.filetype)) return true
    return false
  }

  public onChange(e: DidChangeTextDocumentParams): void {
    if (e.contentChanges.length == 0) return
    void this.getColors(e)
  }

  private checkColorsList(list: (ReadonlyArray<ColorItem>)[], start: number): void {
    let n = 0
    for (let arr of list) {
      n = n + arr.length
    }
    this.debug(`Parsed ${n} colors from buffer ${this.doc.bufnr} cost ${Date.now() - start}ms`)
  }

  private async getColors(e?: DidChangeTextDocumentParams): Promise<void> {
    let { doc } = this
    if (!doc.attached || this.isDisabled) return
    let { bufnr } = doc
    let textDocument = doc.textDocument
    await this.mutex.use(async () => {
      if (!doc.attached) return
      try {
        let st = Date.now()
        if (!this.colors) {
          let len = textDocument.lines.length
          let colorsList = await this.manager.parseLines(bufnr, textDocument.lines, { colorNamesEnable: this.config.colorNamesEnable })
          if (colorsList && colorsList.length == len) {
            this.colors = colorsList
            this.checkColorsList(colorsList, st)
          }
        } else if (e) {
          let { range, text } = e.contentChanges[0]
          let { start, end } = range
          let sl = start.line
          let el = end.line
          let del = el - sl
          let newLines = textDocument.lines.slice(sl, sl + text.split(/\n/).length)
          let colorsList = await this.manager.parseLines(bufnr, newLines, { colorNamesEnable: this.config.colorNamesEnable })
          if (colorsList && colorsList.length === newLines.length) {
            this.colors.splice(sl, del + 1, ...colorsList)
            this.checkColorsList(colorsList, st)
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Cancelled')) return
        this.error(`Error on getColors`, err)
      }
    })
  }

  public info(message: string, data?: any): void {
    this.logLevel('Info', message, data)
  }

  public debug(message: string, data?: any): void {
    if (this.config.trace !== 'verbose') return
    this.logLevel('Debug', message, data)
  }

  public warn(message: string, data?: any): void {
    this.logLevel('Warn', message, data)
  }

  public error(message: string, data?: any): void {
    this.logLevel('Error', message, data)
  }

  public logLevel(level: string, message: string, data?: any): void {
    if (this.config.trace === 'off' && level !== 'Error') return
    this.output.appendLine(
      `[${level} - ${now()}] ${message}`
    )
    if (data) this.output.appendLine(this.data2String(data))
  }

  private data2String(data: unknown): string {
    if (data instanceof Error) {
      if (typeof data.stack === 'string') {
        return data.stack
      }
      return (data as Error).message
    }
    if (typeof data === 'string' || typeof data === 'boolean') {
      return data.toString()
    }
    return inspect(data, { maxArrayLength: 5 })
  }

  public dispose() {
    this.cancel()
  }
}

export function now(): string {
  const now = new Date()
  return padLeft(now.getUTCHours() + '', 2, '0')
    + ':' + padLeft(now.getMinutes() + '', 2, '0')
    + ':' + padLeft(now.getUTCSeconds() + '', 2, '0') + '.' + now.getMilliseconds()
}

function padLeft(s: string, n: number, pad = ' ') {
  return pad.repeat(Math.max(0, n - s.length)) + s
}
