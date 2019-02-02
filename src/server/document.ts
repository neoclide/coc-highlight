import { TextDocument, ColorInformation, TextDocumentContentChangeEvent, TextEdit } from 'vscode-languageserver-protocol'
import { Chars } from './chars'
import { DocumentSymbol } from './types'
import { parseDocumentColors } from './colors'
import debounce from 'debounce'
import { Settings } from './types'

export default class Document {
  public readonly uri: string
  public readonly languageId: string
  public readonly chars: Chars
  public update: (() => void) & { clear(): void }
  private _documentSymbols: DocumentSymbol[] = []
  private _colors: ColorInformation[] = []
  private _parsedVersion = 0

  public get version(): number {
    return this.document.version
  }

  constructor(private document: TextDocument, private iskeyword: string, private settings: Settings) {
    this.uri = document.uri
    this.languageId = document.languageId
    this.chars = new Chars(iskeyword)
    this.update = debounce(() => {
      this._update()
    }, 100)
    this._update()
  }

  public applyContentChanges(events: TextDocumentContentChangeEvent[], version: number): void {
    let { document } = this
    for (let ev of events) {
      let edit: TextEdit = {
        range: ev.range,
        newText: ev.text
      }
      let content = TextDocument.applyEdits(document, [edit])
      document = TextDocument.create(this.uri, this.languageId, version, content)
    }
    this.document = document
  }

  public get documentSymbols(): Promise<DocumentSymbol[]> {
    if (this.version == this._parsedVersion) return Promise.resolve(this._documentSymbols)
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(this._documentSymbols)
      }, 150)
    })
  }

  public get colors(): Promise<ColorInformation[]> {
    if (this.version == this._parsedVersion) return Promise.resolve(this._colors)
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(this._colors)
      }, 150)
    })
  }

  public dispose(): void {
    this.update.clear()
  }

  private _update(): void {
    let { version } = this
    this._documentSymbols = this.chars.matchSymbols(this.document)
    this._colors = parseDocumentColors(this.document, this._documentSymbols)
    this._parsedVersion = version
  }
}
