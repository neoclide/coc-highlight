import { CancellationToken, ExtensionContext, languages, Position, Range, TextDocument, window, workspace } from 'coc.nvim'
import Color from 'color'
import ColorBuffer from './bufferItem'
import { Settings } from './types'
import { WorkersManager } from './workers'

export async function activate(context: ExtensionContext): Promise<void> {
  let { subscriptions, logger } = context
  const workerFile = context.asAbsolutePath('./lib/worker.js')
  const workers = new WorkersManager(workerFile, logger)
  subscriptions.push(workers)

  function loadSettings(): Settings {
    const config = workspace.getConfiguration('highlight')
    return {
      trace: config.get<'off' | 'messages' | 'verbose'>('trace', 'messages'),
      highlightEnable: config.get('document.enable', true),
      colorsEnable: config.get('colors.enable', true),
      colorNamesEnable: config.get('colorNames.enable', true),
      disableLanguages: config.get('disableLanguages', []),
    }
  }
  const settings = loadSettings()

  const output = window.createOutputChannel('highlight')
  subscriptions.push(output)
  const bufferItems = workspace.registerBufferSync(doc => {
    return new ColorBuffer(doc, settings, output, workers)
  })
  subscriptions.push(bufferItems)
  subscriptions.push(workspace.onDidChangeConfiguration(e => {
    if (!e.affectsConfiguration('highlight')) return
    const conf = loadSettings()
    if (settings.colorsEnable !== conf.colorsEnable) {
      void window.showWarningMessage(`Reload window by :CocRestart required for change of highlight.colors.enable`)
    }
    if (settings.highlightEnable !== conf.highlightEnable) {
      void window.showWarningMessage(`Reload window by :CocRestart required for change of highlight.document.enable`)
    }
    const colorsChanged = settings.colorsEnable !== conf.colorsEnable
      || settings.colorNamesEnable !== conf.colorNamesEnable
      || settings.disableLanguages.length !== conf.disableLanguages.length
      || settings.disableLanguages.some((language, index) => language !== conf.disableLanguages[index])
    Object.assign(settings, conf)
    if (colorsChanged) {
      for (const item of bufferItems.items) item.onConfigurationChange()
    }
  }))

  function enableColors(): void {
    subscriptions.push(languages.registerDocumentColorProvider(['*'], {
      provideDocumentColors(document, token) {
        let item = bufferItems.getItem(document.uri)
        return item?.getColorInformation(token)
      },
      provideColorPresentations: color => {
        const value = new Color([color.red * 255, color.green * 255, color.blue * 255, color.alpha])
        const labels = [color.alpha === 1 ? value.hex() : value.hexa(), value.rgb().toString(), value.hsl().toString()]
        return labels.map(label => ({ label }))
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
        let doc = workspace.getDocument(textDocument.uri)
        if (!doc) return
        if (settings.disableLanguages.includes(doc.filetype)) return
        let range = doc.getWordRangeAtPosition(pos)
        if (!range) return
        let line = doc.getline(pos.line)
        let word = line.slice(range.start.character, range.end.character)
        let sl = Math.max(0, pos.line - 300)
        let el = Math.min(pos.line + 300, doc.lineCount)
        let res = await workspace.computeWordRanges(doc.uri, Range.create(sl, 0, el, 0), token)
        if (!res) return
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
