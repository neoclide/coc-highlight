import { Range, ColorInformation, createConnection, DidChangeConfigurationParams, DocumentColorRequest, DocumentHighlight, DocumentHighlightRequest, NotificationType, Position, RequestType, TextDocument, TextDocuments, TextDocumentSyncKind, ColorPresentationRequest, ColorPresentation } from 'vscode-languageserver'
import Uri from 'vscode-uri'
import Color from 'color'
import { Chars } from './chars'
import { parseDocumentColors } from './colors'
import { DocumentSymbol, Settings } from './types'

namespace FetchKeywordRequest {
  export const type = new RequestType<
    string,
    string,
    void,
    void>('highlight/iskeyword')
}

const charsMap: Map<string, Chars> = new Map()
const documentSymbolsMap: Map<string, DocumentSymbol[]> = new Map()
const documentColorsMap: Map<string, ColorInformation[]> = new Map()

const settings: Settings = { highlightEnable: true, colorsEnable: true, disableLanguages: [] }
const exitCalled = new NotificationType<[number, string], void>(
  'highlight/exitCalled'
)

const nodeExit = process.exit
process.exit = ((code?: number): void => {
  let stack = new Error('stack')
  connection.sendNotification(exitCalled, [code ? code : 0, stack.stack])
  setTimeout(() => {
    nodeExit(code)
  }, 1000)
}) as any

process.on('uncaughtException', (error: any) => {
  let message: string
  if (error) {
    if (typeof error.stack === 'string') {
      message = error.stack
    } else if (typeof error.message === 'string') {
      message = error.message
    } else if (typeof error === 'string') {
      message = error
    }
    if (!message) {
      message = JSON.stringify(error, undefined, 4)
    }
  }
  // tslint:disable-next-line:no-console
  console.error('Uncaught exception recevied.')
  if (message) {
    // tslint:disable-next-line:no-console
    console.error(message)
  }
})

function trace(message: string, verbose?: string): void {
  connection.tracer.log(message, verbose)
}

let connection = createConnection()
connection.console.info(`Highlight server running in node ${process.version}`)

let documents: TextDocuments = new TextDocuments()
// The documents manager listen for text document create, change
// and close on the connection
documents.listen(connection)

async function parseDocument(document: TextDocument): Promise<void> {
  if (!settings.highlightEnable && !settings.colorsEnable) return
  if (isDisabled(document.languageId)) return
  let u = Uri.parse(document.uri)
  // filter invalid scheme
  if (['quickfix', 'term', 'nofile'].indexOf(u.scheme) != -1) return
  let { uri } = document
  let chars: Chars
  if (charsMap.has(uri)) {
    chars = charsMap.get(uri)
  } else {
    let iskeyword = await Promise.resolve(connection.sendRequest(FetchKeywordRequest.type, document.uri))
    chars = new Chars(iskeyword)
  }
  let symbols = chars.matchSymbols(document)
  documentSymbolsMap.set(uri, symbols)
  if (settings.colorsEnable) {
    documentColorsMap.set(uri, parseDocumentColors(document, symbols))
  }
}

documents.onDidOpen(event => {
  parseDocument(event.document).catch(e => {
    trace(e.stack)
  })
})

documents.onDidChangeContent(event => {
  parseDocument(event.document).catch(e => {
    trace(e.stack)
  })
})

documents.onDidClose(event => {
  let { uri } = event.document
  documentColorsMap.delete(uri)
  documentSymbolsMap.delete(uri)
})

connection.onRequest(DocumentHighlightRequest.type, ({ textDocument, position }): DocumentHighlight[] => {
  let { uri } = textDocument
  if (!settings.highlightEnable) return []
  let symbols = documentSymbolsMap.get(uri)
  if (!symbols) return []
  let curr = symbols.find(o => positionInRange(position, o.range) == 0)
  if (!curr) return []
  let text = curr.text
  let ranges = symbols.filter(o => o.text == text).map(s => s.range)
  return ranges.map(r => {
    return { range: r }
  })
})

connection.onRequest(DocumentColorRequest.type, ({ textDocument }): ColorInformation[] => {
  let { uri } = textDocument
  return settings.colorsEnable ? documentColorsMap.get(uri) : []
})

connection.onRequest(ColorPresentationRequest.type, (params): ColorPresentation[] => {
  let { color } = params
  let c = new Color([color.red * 255, color.green * 255, color.blue * 255, color.alpha])
  let lables: string[] = [c.hex(), c.rgb().toString(), c.hsl().toString()]
  return lables.map(s => {
    return { label: s }
  })
})

connection.onDidChangeConfiguration((change: DidChangeConfigurationParams): void => {
  let { highlight } = change.settings
  settings.highlightEnable = highlight.document.enable
  settings.colorsEnable = highlight.colors.enable
  settings.disableLanguages = highlight.disableLanguages
  if (!settings.highlightEnable) {
    documentSymbolsMap.clear()
  }
  if (!settings.colorsEnable) {
    documentColorsMap.clear()
  }
})

connection.onInitialize(_params => {
  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Full
      },
      documentHighlightProvider: true,
      colorProvider: true
    }
  }
})

connection.tracer.connection.listen()

function positionInRange(position: Position, range: Range): number {
  let { start, end } = range
  if (comparePosition(position, start) < 0) return -1
  if (comparePosition(position, end) > 0) return 1
  return 0
}

function comparePosition(position: Position, other: Position): number {
  if (position.line > other.line) return 1
  if (other.line == position.line && position.character > other.character) return 1
  if (other.line == position.line && position.character == other.character) return 0
  return -1
}

function isDisabled(languageId: string): boolean {
  return settings.disableLanguages.indexOf(languageId) !== -1
}
