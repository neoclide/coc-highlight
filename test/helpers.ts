import { CancellationToken, languages, window, workspace } from 'coc.nvim'
import type { Document } from 'coc.nvim'

let documentId = 0

export function json(value: unknown): any {
  return JSON.parse(JSON.stringify(value))
}

export async function openCssDocument(lines: string[]): Promise<Document> {
  const name = `coc-highlight-test-${process.pid}-${documentId++}.css`
  await workspace.nvim.command('set updatetime=10000')
  await workspace.nvim.command(`edit! ${name}`)
  const doc = await workspace.document
  const editorDeadline = Date.now() + 3000
  while (window.activeTextEditor?.bufnr !== doc.bufnr && Date.now() < editorDeadline) {
    await new Promise(resolve => setImmediate(resolve))
  }
  if (window.activeTextEditor?.bufnr !== doc.bufnr) throw new Error('Active editor was not synchronized')
  await workspace.nvim.command('setfiletype css')
  const deadline = Date.now() + 3000
  while (doc.filetype !== 'css' && Date.now() < deadline) {
    await new Promise(resolve => setImmediate(resolve))
  }
  if (doc.filetype !== 'css') throw new Error('CSS filetype was not synchronized')
  await doc.buffer.setLines(lines, { start: 0, end: -1, strictIndexing: false })
  await doc.synchronize()
  return doc
}

export async function documentColors(doc: Document): Promise<any[]> {
  return await (languages as any).provideDocumentColors(doc.textDocument, CancellationToken.None)
}

export async function waitForColors(doc: Document, check: (colors: any[]) => boolean, message: string): Promise<any[]> {
  const deadline = Date.now() + 3000
  let colors: any[] = []
  while (Date.now() < deadline) {
    colors = await documentColors(doc)
    if (check(colors)) return colors
    await new Promise(resolve => setImmediate(resolve))
  }
  throw new Error(message)
}

export async function updateConfiguration(key: string, value: unknown): Promise<void> {
  const config = workspace.getConfiguration('highlight')
  let disposable: { dispose(): void } | undefined
  const changed = new Promise<void>(resolve => {
    disposable = workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration(`highlight.${key}`)) return
      disposable?.dispose()
      resolve()
    })
  })
  try {
    await config.update(key, value, true)
    await changed
  } finally {
    disposable?.dispose()
  }
}
