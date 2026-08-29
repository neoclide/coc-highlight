import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CancellationToken, languages } from 'coc.nvim'
import { json, openCssDocument, waitForColors } from './helpers.ts'

describe('coc.nvim integration', () => {
  it('updates document colors after a line edit', { timeout: 5000 }, async () => {
    const doc = await openCssDocument(['red', 'prefix #00ff00', 'blue'])
    let colors = await waitForColors(doc, items => items.length === 3, 'Initial document colors were not available')
    assert.deepEqual(json(colors.map(item => [item.range.start.line, item.range.start.character, item.range.end.character])), [
      [0, 0, 3],
      [1, 7, 14],
      [2, 0, 4]
    ])

    await doc.buffer.setLines(['#abcdef'], { start: 1, end: 2, strictIndexing: true })
    await doc.synchronize()
    colors = await waitForColors(doc, items => items.some(item => item.range.start.line === 1 && item.range.end.character === 7), 'Edited document colors were not available')
    assert.deepEqual(json(colors.map(item => [item.range.start.line, item.range.start.character, item.range.end.character])), [
      [0, 0, 3],
      [1, 0, 7],
      [2, 0, 4]
    ])
  })

  it('provides color presentations including alpha', { timeout: 5000 }, async () => {
    const doc = await openCssDocument(['rgba(255, 0, 0, .5)'])
    const colors = await waitForColors(doc, items => items.length === 1, 'RGBA color was not available')
    assert.equal(colors.length, 1)
    const presentations = await (languages as any).provideColorPresentations(colors[0], doc.textDocument, CancellationToken.None)
    assert.deepEqual(json(presentations.map((item: any) => item.label)), [
      '#FF000080',
      'rgba(255, 0, 0, 0.5)',
      'hsla(0, 100%, 50%, 0.5)'
    ])
  })
})
