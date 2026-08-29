import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CancellationToken, Range } from 'coc.nvim'
import type { DidChangeTextDocumentParams, Document } from 'coc.nvim'
import { ColorBuffer } from '../src/bufferItem.ts'
import { parseColors } from '../src/matchers.ts'
import type { Settings } from '../src/types.ts'
import type { WorkersManager } from '../src/workers.ts'

const output = { appendLine: () => undefined }
const settings: Settings = {
  trace: 'off',
  highlightEnable: true,
  colorsEnable: true,
  colorNamesEnable: true,
  disableLanguages: []
}

function json(value: unknown): any {
  return JSON.parse(JSON.stringify(value))
}

async function waitFor(condition: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  throw new Error(message)
}

function createDocument(lines: string[], version = 1): Document {
  return {
    attached: true,
    bufnr: 99,
    filetype: 'css',
    uri: 'file:///coc-highlight-test.css',
    textDocument: { lines, version }
  } as unknown as Document
}

function changeEvent(originalLines: string[], version: number, text: string): DidChangeTextDocumentParams {
  return {
    bufnr: 99,
    original: originalLines[1],
    originalLines,
    textDocument: { uri: 'file:///coc-highlight-test.css', version },
    contentChanges: [{
      range: Range.create(1, 0, 1, originalLines[1].length),
      rangeLength: originalLines[1].length,
      text
    }]
  }
}

async function parsed(lines: ReadonlyArray<string>, colorNamesEnable = true) {
  return await parseColors(lines, colorNamesEnable, CancellationToken.None)
}

describe('incremental color cache', () => {
  it('queues edits made during the initial parse and only reparses the changed line', async () => {
    const oldLines = ['red', 'blue']
    const newLines = ['red', '#fff']
    const doc = createDocument(oldLines)
    const calls: string[][] = []
    let resolveInitial: (value: Awaited<ReturnType<typeof parsed>>) => void
    const initialResult = await parsed(oldLines)
    const manager = {
      cancel: () => undefined,
      parseLines: async (_bufnr: number, lines: ReadonlyArray<string>, opts: { colorNamesEnable: boolean }) => {
        calls.push(Array.from(lines))
        if (calls.length === 1) {
          return await new Promise<Awaited<ReturnType<typeof parsed>>>(resolve => {
            resolveInitial = resolve
          })
        }
        return await parsed(lines, opts.colorNamesEnable)
      }
    } as unknown as WorkersManager
    const buffer = new ColorBuffer(doc, { ...settings }, output as any, manager)

    const staleRequest = buffer.getColorInformation(CancellationToken.None)
    await waitFor(() => calls.length === 1, 'Initial color parse did not start')
    ;(doc as any).textDocument = { lines: newLines, version: 2 }
    buffer.onChange(changeEvent(oldLines, 2, '#fff'))
    resolveInitial(initialResult)

    assert.equal(await staleRequest, undefined)
    const colors = await buffer.getColorInformation(CancellationToken.None)
    assert.deepEqual(calls, [oldLines, ['#fff']])
    assert.deepEqual(json(colors?.map(item => [item.range.start.line, item.range.start.character, item.range.end.character])), [
      [0, 0, 3],
      [1, 0, 4]
    ])
    buffer.dispose()
  })

  it('falls back to a full parse for a multi-change event', async () => {
    const oldLines = ['red', 'blue']
    const newLines = ['green', '#fff']
    const doc = createDocument(oldLines)
    const calls: string[][] = []
    const manager = {
      cancel: () => undefined,
      parseLines: async (_bufnr: number, lines: ReadonlyArray<string>, opts: { colorNamesEnable: boolean }) => {
        calls.push(Array.from(lines))
        return await parsed(lines, opts.colorNamesEnable)
      }
    } as unknown as WorkersManager
    const buffer = new ColorBuffer(doc, { ...settings }, output as any, manager)

    await buffer.getColorInformation(CancellationToken.None)
    ;(doc as any).textDocument = { lines: newLines, version: 2 }
    buffer.onChange({
      ...changeEvent(oldLines, 2, 'green'),
      contentChanges: [
        { range: Range.create(0, 0, 0, 3), rangeLength: 3, text: 'green' },
        { range: Range.create(1, 0, 1, 4), rangeLength: 4, text: '#fff' }
      ]
    })

    await buffer.getColorInformation(CancellationToken.None)
    assert.deepEqual(calls, [oldLines, newLines])
    buffer.dispose()
  })

  it('falls back to the current snapshot when the change version is stale', async () => {
    const oldLines = ['red', 'blue']
    const newLines = ['green', '#fff']
    const doc = createDocument(oldLines)
    const calls: string[][] = []
    const manager = {
      cancel: () => undefined,
      parseLines: async (_bufnr: number, lines: ReadonlyArray<string>, opts: { colorNamesEnable: boolean }) => {
        calls.push(Array.from(lines))
        return await parsed(lines, opts.colorNamesEnable)
      }
    } as unknown as WorkersManager
    const buffer = new ColorBuffer(doc, { ...settings }, output as any, manager)

    await buffer.getColorInformation(CancellationToken.None)
    ;(doc as any).textDocument = { lines: newLines, version: 3 }
    buffer.onChange(changeEvent(oldLines, 2, '#fff'))

    await buffer.getColorInformation(CancellationToken.None)
    assert.deepEqual(calls, [oldLines, newLines])
    buffer.dispose()
  })

  it('shifts following line colors after a multiline replacement', async () => {
    const oldLines = ['red', 'blue', 'green']
    const newLines = ['red', '#fff', 'yellow', 'green']
    const doc = createDocument(oldLines)
    const calls: string[][] = []
    const manager = {
      cancel: () => undefined,
      parseLines: async (_bufnr: number, lines: ReadonlyArray<string>, opts: { colorNamesEnable: boolean }) => {
        calls.push(Array.from(lines))
        return await parsed(lines, opts.colorNamesEnable)
      }
    } as unknown as WorkersManager
    const buffer = new ColorBuffer(doc, { ...settings }, output as any, manager)

    await buffer.getColorInformation(CancellationToken.None)
    ;(doc as any).textDocument = { lines: newLines, version: 2 }
    buffer.onChange({
      ...changeEvent(oldLines, 2, '#fff\nyellow'),
      contentChanges: [{
        range: Range.create(1, 0, 1, oldLines[1].length),
        rangeLength: oldLines[1].length,
        text: '#fff\nyellow'
      }]
    })

    const colors = await buffer.getColorInformation(CancellationToken.None)
    assert.deepEqual(calls, [oldLines, ['#fff', 'yellow']])
    assert.deepEqual(json(colors?.map(item => [item.range.start.line, item.range.start.character, item.range.end.character])), [
      [0, 0, 3],
      [1, 0, 4],
      [2, 0, 6],
      [3, 0, 5]
    ])
    buffer.dispose()
  })
})
