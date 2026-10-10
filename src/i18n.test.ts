import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { UK, tr } from './i18n'
import { LINE_LABEL } from './summary'

describe('i18n', () => {
  it('interpolates placeholders', () => {
    expect(tr('en', 'Could not read {0}: {1}', 'a.stl', 'bad')).toBe('Could not read a.stl: bad')
    expect(tr('uk', 'Unsupported file: {0}', 'a.zip')).toBe('Непідтримуваний файл: a.zip')
  })
  it('falls back to English for unknown strings', () => {
    expect(tr('uk', 'no such string')).toBe('no such string')
  })
  it('has a Ukrainian string for every t() call and label in the sources', () => {
    const files = ['src/App.tsx', 'src/summary.ts'].map((f) => readFileSync(f, 'utf8')).join('\n')
    const keys = new Set<string>()
    for (const m of files.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1])
    for (const m of files.matchAll(/num\('\w+', '([^']*)'/g)) keys.add(m[1])
    for (const m of files.matchAll(/label: '([^']*)' \}/g)) keys.add(m[1])
    for (const v of Object.values(LINE_LABEL)) keys.add(v)
    expect(keys.size).toBeGreaterThan(60)
    const missing = [...keys].filter((k) => !(k in UK))
    expect(missing).toEqual([])
  })
  it('keeps placeholders consistent', () => {
    for (const [en, uk] of Object.entries(UK)) {
      const ph = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort().join()
      expect(ph(uk), en).toBe(ph(en))
    }
  })
})
