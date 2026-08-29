'use strict'
import { BufferSyncItem, CancellationToken, ColorInformation, DidChangeTextDocumentParams, Disposable, Document, Mutex, OutputChannel, Range } from 'coc.nvim'
import { inspect } from 'util'
import type { WorkersManager } from './workers'
import { ColorItem, Settings } from './types'

export class ColorBuffer implements BufferSyncItem {
  /**
   * Colors for each line.
   */
  private colors: ReadonlyArray<ColorItem>[] | undefined
  private parsedVersion: number | undefined
  private requested = false
  private disposed = false
  private configVersion = 0
  private pending = new Set<string>()
  private mutex = new Mutex()
  constructor(
    private doc: Document,
    private config: Settings,
    private output: OutputChannel,
    private manager: WorkersManager
  ) {
    if (!this.config.colorsEnable) {
      this.warn(`Color highlight disabled by "highlight.colors.enable": false`)
    } else if (this.isDisabled) {
      this.warn(`Color highlight of ${doc.uri} ignored by "highlight.disableLanguages"`)
    }
  }

  public async getColorInformation(token: CancellationToken): Promise<ColorInformation[] | undefined> {
    if (this.disposed || this.isDisabled || token.isCancellationRequested) return
    this.requested = true
    let colors: ColorInformation[] | undefined
    let timer: NodeJS.Timeout | undefined
    let disposable: Disposable | undefined
    if (!this.colors || this.parsedVersion !== this.doc.textDocument.version) this.scheduleColors()
    await new Promise<void>(resolve => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        if (disposable) disposable.dispose()
        resolve()
      }
      timer = setTimeout(() => {
        finish()
      }, 1000)
      disposable = token.onCancellationRequested(() => {
        finish()
      })
      this.mutex.acquire().then(release => {
        release()
        if (!token.isCancellationRequested
          && !this.disposed
          && !this.isDisabled
          && this.colors
          && this.parsedVersion === this.doc.textDocument.version) {
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
        finish()
      }, () => {
        finish()
      })
    })
    return colors
  }

  private cancel(): void {
    this.manager.cancel(this.doc.bufnr)
  }

  private get isDisabled(): boolean {
    if (!this.config.colorsEnable) return true
    if (this.config.disableLanguages.includes(this.doc.filetype)) return true
    return false
  }

  public onConfigurationChange(): void {
    this.configVersion++
    this.resetColors()
    this.cancel()
    if (this.requested && !this.isDisabled) this.scheduleColors()
  }

  public onChange(e: DidChangeTextDocumentParams): void {
    if (!this.requested || this.disposed || e.contentChanges.length === 0) return
    this.scheduleColors(e)
  }

  private checkColorsList(list: (ReadonlyArray<ColorItem>)[], start: number): void {
    let n = 0
    for (let arr of list) {
      n = n + arr.length
    }
    this.debug(`Parsed ${n} colors from buffer ${this.doc.bufnr} cost ${Date.now() - start}ms`)
  }

  private scheduleColors(e?: DidChangeTextDocumentParams): void {
    let { doc } = this
    if (!doc.attached || this.isDisabled) return
    const textDocument = doc.textDocument
    const lines = textDocument.lines
    const version = textDocument.version
    const configVersion = this.configVersion
    const colorNamesEnable = this.config.colorNamesEnable
    const key = `${configVersion}:${version}`
    if (this.pending.has(key)) return
    this.pending.add(key)
    const changeEvent = e?.textDocument.version === version ? e : undefined
    void this.getColors(lines, version, configVersion, colorNamesEnable, changeEvent).finally(() => {
      this.pending.delete(key)
    })
  }

  private async getColors(
    lines: ReadonlyArray<string>,
    version: number,
    configVersion: number,
    colorNamesEnable: boolean,
    e?: DidChangeTextDocumentParams
  ): Promise<void> {
    let { doc } = this
    let { bufnr } = doc
    await this.mutex.use(async () => {
      if (!doc.attached || this.disposed || configVersion !== this.configVersion) return
      try {
        let st = Date.now()
        const change = e?.contentChanges.length === 1 ? e.contentChanges[0] : undefined
        const canIncrement = change?.range
          && this.colors
          && this.parsedVersion === version - 1
          && this.colors.length === e.originalLines.length
        if (canIncrement) {
          let { range, text } = change
          let { start, end } = range
          let sl = start.line
          let el = end.line
          let deleteCount = el - sl + 1
          let newLines = lines.slice(sl, sl + text.split(/\n/).length)
          const expectedLength = this.colors.length - deleteCount + newLines.length
          if (expectedLength === lines.length) {
            let colorsList = await this.manager.parseLines(bufnr, newLines, { colorNamesEnable })
            if (this.disposed || configVersion !== this.configVersion) return
            if (!colorsList || colorsList.length !== newLines.length) {
              this.resetColors()
              return
            }
            const next = this.colors.slice()
            next.splice(sl, deleteCount, ...colorsList)
            if (next.length !== lines.length) {
              this.resetColors()
              return
            }
            this.colors = next
            this.parsedVersion = version
            this.checkColorsList(colorsList, st)
            return
          }
        }
        let colorsList = await this.manager.parseLines(bufnr, lines, { colorNamesEnable })
        if (this.disposed || configVersion !== this.configVersion) return
        if (!colorsList || colorsList.length !== lines.length) {
          this.resetColors()
          return
        }
        this.colors = colorsList
        this.parsedVersion = version
        this.checkColorsList(colorsList, st)
      } catch (err) {
        this.resetColors()
        if (err instanceof Error && err.message.includes('Cancelled')) return
        this.error(`Error on getColors`, err)
      }
    })
  }

  private resetColors(): void {
    this.colors = undefined
    this.parsedVersion = undefined
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

  public dispose(): void {
    this.disposed = true
    this.configVersion++
    this.resetColors()
    this.cancel()
  }
}

export default ColorBuffer

export function now(): string {
  const now = new Date()
  return padLeft(now.getUTCHours() + '', 2, '0')
    + ':' + padLeft(now.getMinutes() + '', 2, '0')
    + ':' + padLeft(now.getUTCSeconds() + '', 2, '0') + '.' + now.getMilliseconds()
}

function padLeft(s: string, n: number, pad = ' ') {
  return pad.repeat(Math.max(0, n - s.length)) + s
}
