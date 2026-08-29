import assert from 'node:assert/strict'
import { it } from 'node:test'
import { json, openCssDocument, updateConfiguration, waitForColors } from './helpers.ts'

it('refreshes cached colors when named colors are disabled', { timeout: 5000 }, async () => {
  const doc = await openCssDocument(['red #fff'])
  assert.equal((await waitForColors(doc, items => items.length === 2, 'Initial named colors were not available')).length, 2)

  await updateConfiguration('colorNames.enable', false)
  const colors = await waitForColors(doc, items => items.length === 1, 'Named colors were not disabled')
  assert.deepEqual(json(colors.map(item => [item.range.start.character, item.range.end.character])), [[4, 8]])
})
