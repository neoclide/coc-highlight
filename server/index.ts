import Color from 'color'
import { ColorInformation, ColorPresentation, ColorPresentationRequest, createConnection, DidChangeConfigurationParams, DidChangeTextDocumentNotification, DidChangeTextDocumentParams, DocumentColorRequest, DocumentHighlight, DocumentHighlightRequest, NotificationType, Position, Range, RequestType, TextDocuments, TextDocumentSyncKind } from 'vscode-languageserver'
import Document from './document'
import { Settings } from './types'

namespace FetchKeywordRequest {
  export const type = new RequestType<
    string,
    string,
    void,
    void>('highlight/iskeyword')
}

const documentMap: Map<string, Document> = new Map()
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
// tslint:disable-next-line:no-console
console.log = connection.console.log.bind(connection.console)
// tslint:disable-next-line:no-console
console.error = connection.console.error.bind(connection.console)

connection.console.info(`Highlight server running in node ${process.version}`)

let documents: TextDocuments = new TextDocuments()
// The documents manager listen for text document create, change
// and close on the connection
documents.listen(connection)

documents.onDidOpen(async event => {
  let { document } = event
  let { uri } = document
  // filter invalid scheme
  if (isDisabled(document.languageId)) return
  let iskeyword = await Promise.resolve(connection.sendRequest(FetchKeywordRequest.type, uri))
  let doc = new Document(document, iskeyword, settings)
  documentMap.set(uri, doc)
})

connection.onNotification(DidChangeTextDocumentNotification.type, (p: DidChangeTextDocumentParams) => {
  let { uri } = p.textDocument
  let doc = documentMap.get(uri)
  if (!doc) return
  doc.applyContentChanges(p.contentChanges, p.textDocument.version)
  doc.update()
})

documents.onDidClose(event => {
  let { uri } = event.document
  let doc = documentMap.get(uri)
  if (!doc) return
  doc.dispose()
  documentMap.delete(uri)
})

connection.onRequest(DocumentHighlightRequest.type, async ({ textDocument, position }): Promise<DocumentHighlight[]> => {
  let { uri } = textDocument
  if (!settings.highlightEnable) return []
  let doc = documentMap.get(uri)
  if (!doc) return []
  let symbols = await doc.documentSymbols
  let curr = symbols.find(o => positionInRange(position, o.range) == 0)
  if (!curr) return []
  let text = curr.text
  let ranges = symbols.filter(o => o.text == text).map(s => s.range)
  return ranges.map(r => {
    return { range: r }
  })
})

connection.onRequest(DocumentColorRequest.type, async ({ textDocument }): Promise<ColorInformation[]> => {
  if (!settings.colorsEnable) return []
  let { uri } = textDocument
  let doc = documentMap.get(uri)
  if (!doc) return []
  return await doc.colors
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
  let disableLanguages: string[] = settings.disableLanguages = highlight.disableLanguages
  for (let doc of documentMap.values()) {
    if (disableLanguages.indexOf(doc.languageId) !== -1) {
      doc.dispose()
      documentMap.delete(doc.uri)
    }
  }
})

connection.onInitialize(_params => {
  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Incremental
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
