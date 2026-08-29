import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CancellationToken } from 'coc.nvim'
import { parseColors } from '../src/matchers.ts'

function json(value: unknown): any {
  return JSON.parse(JSON.stringify(value))
}

describe('color parser', () => {
  it('parses case-insensitive names, long lines, UTF-16 spans and Flutter colors', async () => {
    const long = `${' '.repeat(2050)}#123456`
    const result = await parseColors(['RED Blue', long, '😀 #abc', 'Color(0x14fcd93a)'], true, CancellationToken.None)

    assert.ok(result)
    assert.deepEqual(json(result[0].map(item => item.span)), [[0, 3], [4, 8]])
    assert.deepEqual(json(result[1].map(item => item.span)), [[2050, 2057]])
    assert.deepEqual(json(result[2].map(item => item.span)), [[3, 7]])
    assert.deepEqual(json(result[3].map(item => item.span)), [[8, 16]])
    assert.ok(Math.abs(result[3][0].color.alpha - 0x14 / 255) < 0.000001)
  })

  it('preserves one result array per line and respects cancellation and the name setting', async () => {
    const result = await parseColors(['red #fff', '', 'blue'], false, CancellationToken.None)
    assert.ok(result)
    assert.equal(result.length, 3)
    assert.deepEqual(json(result[0].map(item => item.span)), [[4, 8]])
    assert.deepEqual(json(result[1]), [])
    assert.deepEqual(json(result[2]), [])
    assert.equal(await parseColors(['red'], true, CancellationToken.Cancelled), undefined)
  })

  it('does not return partial results when cancelled between lines', async () => {
    let checks = 0
    const token = {
      get isCancellationRequested() {
        checks++
        return checks === 3
      }
    } as CancellationToken
    assert.equal(await parseColors(['red', 'blue'], true, token), undefined)
  })
})
