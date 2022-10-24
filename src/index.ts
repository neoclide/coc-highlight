import { CancellationToken, ExtensionContext, languages, Position, Range, TextDocument, window, workspace } from 'coc.nvim'
import ColorBuffer from './bufferItem'
import { Settings } from './types'
import { WorkersManager } from './workers'

export async function activate(context: ExtensionContext): Promise<void> {
  let { subscriptions, logger } = context
  const workerFile = context.asAbsolutePath('./lib/worker.js')
  const workers = new WorkersManager(workerFile, logger)
  subscriptions.push(workers)

  let settings: Settings | undefined
  function getSettings(): void {
    const config = workspace.getConfiguration('highlight')
    let conf = {
      trace: config.get<'off' | 'messages' | 'verbose'>('trace', 'messages'),
      highlightEnable: config.get('document.enable', true),
      colorsEnable: config.get('colors.enable', true),
      colorNamesEnable: config.get('colorNames.enable', true),
      disableLanguages: config.get('disableLanguages', []),
    }
    if (settings) {
      if (settings.colorsEnable != conf.colorsEnable) {
        void window.showWarningMessage(`Reload window by :CocRestart required for change of highlight.colors.enable`)
      }
      Object.assign(settings, conf)
    } else {
      settings = conf
    }
  }
  getSettings()
  subscriptions.push(workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('highlight')) {
      getSettings()
    }
  }))

  const output = window.createOutputChannel('highlight')
  subscriptions.push(output)
  let bufferItems = workspace.registerBufferSync(doc => {
    return new ColorBuffer(doc, settings, output, workers)
  })
  subscriptions.push(bufferItems)

  function enableColors(): void {
    subscriptions.push(languages.registerDocumentColorProvider(['*'], {
      provideDocumentColors(document, token) {
        let item = bufferItems.getItem(document.uri)
        return item.getColorInformation(token)
      },
      provideColorPresentations: () => {
        return null
      }
    }))
  }

  function enableDocumentHighlight(): void {
    if (typeof workspace.computeWordRanges !== 'function') {
      output.appendLine(`workspace.computeWordRanges is not a function, please update coc.nvim.`)
      return
    }
    subscriptions.push(languages.registerDocumentHighlightProvider(['*'], {
      provideDocumentHighlights: async (textDocument: TextDocument, pos: Position, token: CancellationToken) => {
        if (settings.disableLanguages.includes(textDocument.languageId)) return
        let doc = workspace.getDocument(textDocument.uri)
        if (!doc) return
        let range = doc.getWordRangeAtPosition(pos)
        if (!range) return
        let line = doc.getline(pos.line)
        let word = line.slice(range.start.character, range.end.character)
        let sl = Math.max(0, pos.line - 300)
        let el = Math.min(pos.line + 300, doc.lineCount)
        let res = await workspace.computeWordRanges(doc.uri, Range.create(sl, 0, el, 0), token)
        let ranges = res[word]
        if (Array.isArray(ranges)) return ranges.map(r => {
          return { range: r }
        })
      }
    }))
  }

  if (settings.colorsEnable) {
    enableColors()
  }
  if (settings.highlightEnable) {
    enableDocumentHighlight()
  }
}
