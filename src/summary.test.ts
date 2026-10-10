import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, estimateFromModel, quote } from './lib/estimate'
import { meshStats, sampleMesh } from './lib/mesh'
import { tr } from './i18n'
import { money, summaryText } from './summary'

describe('summaryText', () => {
  const mesh = sampleMesh('cube')
  const stats = meshStats(mesh)
  const est = estimateFromModel(mesh, stats, DEFAULT_PARAMS, 'fdm')
  const q = quote(est, DEFAULT_PARAMS)
  const input = { title: 'Cube', customer: 'Ann', fileName: 'cube.stl', materialName: 'PLA', stats, scalePct: 100, quantity: 1, est, q, currency: '$' }
  it('contains the total and the model size', () => {
    const s = summaryText(input, (x, ...a) => tr('en', x, ...a))
    expect(s).toContain(`Total: ${money(q.total, '$')}`)
    expect(s).toContain('20.0 x 20.0 x 20.0 mm')
    expect(s).toContain('Customer: Ann')
    expect(s).not.toContain('Per unit')
  })
  it('translates to Ukrainian', () => {
    expect(summaryText(input, (x, ...a) => tr('uk', x, ...a))).toContain('Разом')
  })
})
