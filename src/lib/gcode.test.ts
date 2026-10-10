import { describe, expect, it } from 'vitest'
import { moveTime, parseDuration, parseGcode } from './gcode'

describe('parseDuration', () => {
  it('parses slicer formats', () => {
    expect(parseDuration('1d 2h 3m 4s')).toBe(86400 + 7200 + 180 + 4)
    expect(parseDuration('1h 5m')).toBe(3900)
    expect(parseDuration('12 minutes')).toBe(720)
    expect(parseDuration('nothing')).toBeNull()
  })
})

describe('parseGcode', () => {
  it('reads Cura header time and filament length', () => {
    const g = parseGcode(';FLAVOR:Marlin\n;TIME:3725\n;Filament used: 2.5m\nG1 X1 Y1\n')
    expect(g.seconds).toBe(3725)
    expect(g.timeSource).toBe('comment')
    expect(g.filamentMm).toBe(2500)
  })
  it('reads PrusaSlicer footer comments', () => {
    const g = parseGcode('G1 X1\n; filament used [mm] = 1000.5\n; filament used [g] = 3.0\n; estimated printing time (normal mode) = 1h 2m 3s\n')
    expect(g.seconds).toBe(3723)
    expect(g.filamentG).toBe(3)
    expect(g.filamentMm).toBeCloseTo(1000.5)
  })
  it('simulates time: one 100 mm move at 60 mm/s with a 1500 mm/s² ramp', () => {
    const g = parseGcode('G90\nM82\nG1 X100 F3600 E5\n')
    expect(g.timeSource).toBe('simulated')
    expect(g.seconds).toBeCloseTo(100 / 60 + 60 / 1500, 6)
    expect(g.filamentMm).toBeCloseTo(5)
  })
  it('does not count retract + unretract as extrusion, handles G92 and relative E', () => {
    const g = parseGcode('M83\nG1 X10 E1 F6000\nG1 E-2\nG1 X20 F6000\nG1 E2\nG1 X30 E1\nG92 E0\n')
    expect(g.filamentMm).toBeCloseTo(2)
  })
  it('counts layers by distinct Z with extrusion', () => {
    const g = parseGcode('M83\nG1 Z0.2\nG1 X5 E1\nG1 X9 E1\nG1 Z0.4\nG1 X0 E1\nG1 Z0.6\nG1 X5 E1\n')
    expect(g.layers).toBe(3)
  })
  it('moveTime short move uses a triangle profile', () => {
    expect(moveTime(1, 100, 1000)).toBeCloseTo(2 * Math.sqrt(1 / 1000), 9)
  })
})
