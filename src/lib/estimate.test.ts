import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, estimateFromGcode, estimateFromModel, formatDuration, quote, type Params } from './estimate'
import { meshStats, sampleMesh } from './mesh'

const cube = sampleMesh('cube')
const cs = meshStats(cube)

describe('estimateFromModel', () => {
  it('20 mm PLA cube at 20% infill, 3 walls, 4 top/bottom layers', () => {
    const e = estimateFromModel(cube, cs, DEFAULT_PARAMS, 'fdm')
    // shell = 4*400*1.35 + 2*400*0.8 = 2800; infill = (8000-2800)*0.2 = 1040
    expect(e.shellVolume).toBeCloseTo(2800, 6)
    expect(e.infillVolume).toBeCloseTo(1040, 6)
    expect(e.partGrams).toBeCloseTo((3840 / 1000) * 1.24, 6)
    expect(e.gramsWithWaste).toBeCloseTo(e.partGrams * 1.05, 9)
    expect(e.layers).toBe(100)
    // flow = 60*0.45*0.2 = 5.4 mm3/s (below the 12 limit)
    expect(e.flowLimited).toBe(false)
    expect(e.hoursPerPart * 3600).toBeCloseTo(3840 / 5.4 + 250 + 300, 6)
  })
  it('100% infill is solid, thick walls clamp to the volume', () => {
    const solid = estimateFromModel(cube, cs, { ...DEFAULT_PARAMS, infillPct: 100 }, 'fdm')
    expect(solid.shellVolume + solid.infillVolume).toBeCloseTo(8000, 6)
    const thick = estimateFromModel(cube, cs, { ...DEFAULT_PARAMS, perimeters: 40 }, 'fdm')
    expect(thick.shellVolume).toBeCloseTo(8000, 6)
    expect(thick.infillVolume).toBe(0)
  })
  it('scale 200% gives 8x the volume and 2x the layers', () => {
    const e = estimateFromModel(cube, cs, { ...DEFAULT_PARAMS, scalePct: 200, infillPct: 100 }, 'fdm')
    expect(e.modelVolume).toBeCloseTo(64000, 4)
    expect(e.layers).toBe(200)
    expect(e.shellVolume + e.infillVolume).toBeCloseTo(64000, 3)
  })
  it('caps the flow rate', () => {
    const e = estimateFromModel(cube, cs, { ...DEFAULT_PARAMS, printSpeed: 300 }, 'fdm')
    expect(e.flowLimited).toBe(true)
  })
  it('resin: solid volume, time by layers', () => {
    const e = estimateFromModel(cube, cs, { ...DEFAULT_PARAMS, layerHeight: 0.05 }, 'resin')
    expect(e.partGrams).toBeCloseTo(8 * 1.24, 6)
    expect(e.hoursPerPart * 3600).toBeCloseTo(400 * 9 + 300, 6)
  })
  it('quantity multiplies batch hours', () => {
    const one = estimateFromModel(cube, cs, DEFAULT_PARAMS, 'fdm')
    const five = estimateFromModel(cube, cs, { ...DEFAULT_PARAMS, quantity: 5 }, 'fdm')
    expect(five.hours).toBeCloseTo(one.hours * 5, 9)
  })
})

describe('estimateFromGcode', () => {
  it('takes time and filament from G-code', () => {
    const base = estimateFromModel(cube, cs, DEFAULT_PARAMS, 'fdm')
    const e = estimateFromGcode(base, { seconds: 7200, timeSource: 'comment', filamentMm: 1000, filamentG: null, layers: 80 }, DEFAULT_PARAMS)
    expect(e.hoursPerPart).toBe(2)
    expect(e.partGrams).toBeCloseTo((Math.PI * 0.875 ** 2 * 1000 * 1.24) / 1000, 6)
    expect(e.source).toBe('gcode')
    expect(e.layers).toBe(80)
  })
})

describe('quote', () => {
  const p: Params = { ...DEFAULT_PARAMS, quantity: 2, pricePerKg: 20, powerW: 100, electricityPerKWh: 0.2, machinePrice: 600, lifetimeHours: 3000, laborMinutes: 30, laborRate: 10, failurePct: 10, markupPct: 50, taxPct: 20 }
  const e = { modelVolume: 0, shellVolume: 0, infillVolume: 0, partGrams: 50, gramsWithWaste: 50, hours: 10, hoursPerPart: 5, layers: 1, source: 'model' as const, timeSource: 'model' as const, flowLimited: false }
  it('adds up every line by hand', () => {
    const q = quote(e, p)
    const mat = (50 * 2 * 20) / 1000 // 2.00
    const el = 0.1 * 10 * 0.2 // 0.20
    const dep = (600 / 3000) * 10 // 2.00
    const lab = 5
    const base = mat + el + dep + lab // 9.20
    expect(q.lines.map((l) => l.amount)).toEqual([mat, el, dep, lab, base * 0.1].map((x) => expect.closeTo(x, 9)))
    expect(q.subtotal).toBeCloseTo(base * 1.1, 9)
    expect(q.markup).toBeCloseTo(base * 1.1 * 0.5, 9)
    expect(q.tax).toBeCloseTo(base * 1.1 * 1.5 * 0.2, 9)
    expect(q.total).toBeCloseTo(base * 1.1 * 1.5 * 1.2, 9)
    expect(q.perUnit).toBeCloseTo(q.total / 2, 9)
  })
})

describe('formatDuration', () => {
  it('formats', () => {
    expect(formatDuration(0.5)).toBe('30 min')
    expect(formatDuration(2.25)).toBe('2 h 15 min')
  })
})
