import assert from 'node:assert/strict'
import { it } from 'node:test'
import { json, openCssDocument, updateConfiguration, waitForColors } from './helpers.ts'

it('refreshes cached colors when the filetype is disabled', { timeout: 5000 }, async () => {
  const doc = await openCssDocument(['#fff'])
  assert.equal((await waitForColors(doc, items => items.length === 1, 'Initial CSS color was not available')).length, 1)

  await updateConfiguration('disableLanguages', ['css'])
  const colors = await waitForColors(doc, items => items.length === 0, 'CSS colors were not disabled')
  assert.deepEqual(json(colors), [])
})
