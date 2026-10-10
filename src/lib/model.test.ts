import { describe, expect, it } from 'vitest'
import { mergeState } from './model'

describe('mergeState', () => {
  it('falls back to defaults on junk', () => {
    expect(mergeState(null).params.infillPct).toBe(20)
    expect(mergeState('x').settings.currency).toBe('$')
  })
  it('keeps valid values and drops wrongly typed ones', () => {
    const s = mergeState({ params: { infillPct: 35, perimeters: 'many', layerHeight: NaN }, settings: { theme: 'dark', lang: 'fr', currency: '€' } })
    expect(s.params.infillPct).toBe(35)
    expect(s.params.perimeters).toBe(3)
    expect(s.params.layerHeight).toBe(0.2)
    expect(s.settings.theme).toBe('dark')
    expect(s.settings.lang).toBe('en')
    expect(s.settings.currency).toBe('€')
  })
})
