import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { WorkersManager } from '../src/workers.ts'

const logger = { error: () => undefined }

describe('worker manager', () => {
  it('creates workers lazily and does not recreate them after disposal', async () => {
    const manager = new WorkersManager(path.resolve('lib/worker.js'), logger as any)
    assert.equal((manager as any).workers.length, 0)
    try {
      const result = await manager.parseLines(1, ['#fff'], { colorNamesEnable: true })
      assert.equal(result?.length, 1)
      assert.equal((manager as any).workers.length, 1)
    } finally {
      manager.dispose()
    }
    assert.equal(await manager.parseLines(1, ['#fff'], { colorNamesEnable: true }), undefined)
    assert.equal((manager as any).workers.length, 0)
  })

  it('does not let a cancelled request cancel another buffer', { timeout: 5000 }, async () => {
    const manager = new WorkersManager(path.resolve('lib/worker.js'), logger as any)
    const lines = Array.from({ length: 20000 }, () => 'red #ffffff rgb(1, 2, 3) hsl(1, 2%, 3%)')
    try {
      const first = manager.parseLines(101, lines, { colorNamesEnable: true })
      await new Promise(resolve => setImmediate(resolve))
      manager.cancel(101)
      const second = manager.parseLines(102, lines, { colorNamesEnable: true })
      assert.equal(await first, undefined)
      const third = manager.parseLines(103, ['#fff'], { colorNamesEnable: true })
      const [secondResult, thirdResult] = await Promise.all([second, third])
      assert.equal(secondResult?.length, lines.length)
      assert.equal(thirdResult?.length, 1)
    } finally {
      manager.dispose()
    }
  })
})
