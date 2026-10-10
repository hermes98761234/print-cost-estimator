import { describe, expect, it } from 'vitest'
import { meshStats, parseOBJ, parseSTL, sampleMesh, shellVolume, type Mesh } from './mesh'

function binaryStl(m: Mesh): ArrayBuffer {
  const n = m.pos.length / 9
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, n, true)
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + i * 50 + 12 + k * 4, m.pos[i * 9 + k], true)
  return buf
}

describe('meshStats', () => {
  it('20 mm cube: V=8000, A=2400, watertight', () => {
    const s = meshStats(sampleMesh('cube'))
    expect(s.triangles).toBe(12)
    expect(s.volume).toBeCloseTo(8000, 6)
    expect(s.area).toBeCloseTo(2400, 6)
    expect(s.size).toEqual([20, 20, 20])
    expect(s.openEdges).toBe(0)
    expect(s.inverted).toBe(false)
  })
  it('cylinder r=15 h=30 matches the polygon prism formula', () => {
    const s = meshStats(sampleMesh('cylinder'))
    const n = 64
    expect(s.volume).toBeCloseTo(0.5 * n * 15 * 15 * Math.sin((2 * Math.PI) / n) * 30, 3)
    expect(s.openEdges).toBe(0)
    expect(s.inverted).toBe(false)
  })
  it('torus volume is close to 2 pi^2 R r^2', () => {
    const s = meshStats(sampleMesh('torus'))
    expect(s.volume / (2 * Math.PI ** 2 * 20 * 36)).toBeGreaterThan(0.97)
    expect(s.volume / (2 * Math.PI ** 2 * 20 * 36)).toBeLessThan(1.01)
    expect(s.openEdges).toBe(0)
    expect(s.inverted).toBe(false)
  })
  it('vase is a closed solid with positive volume', () => {
    const s = meshStats(sampleMesh('vase'))
    expect(s.openEdges).toBe(0)
    expect(s.inverted).toBe(false)
    expect(s.volume).toBeGreaterThan(10000)
    expect(s.size[2]).toBeCloseTo(80, 6)
  })
  it('flags open meshes and inverted winding', () => {
    const cube = sampleMesh('cube')
    expect(meshStats({ pos: cube.pos.slice(0, 99) }).openEdges).toBeGreaterThan(0)
    const flipped = cube.pos.slice()
    for (let i = 0; i < 12; i++) for (let k = 0; k < 3; k++) {
      const a = i * 9 + 3 + k, b = i * 9 + 6 + k
      ;[flipped[a], flipped[b]] = [flipped[b], flipped[a]]
    }
    const s = meshStats({ pos: flipped })
    expect(s.inverted).toBe(true)
    expect(s.volume).toBeCloseTo(8000, 6)
  })
})

describe('shellVolume', () => {
  it('cube: 4 walls of 1.35 mm and top/bottom of 0.8 mm', () => {
    expect(shellVolume(sampleMesh('cube'), 1.35, 0.8)).toBeCloseTo(4 * 400 * 1.35 + 2 * 400 * 0.8, 6)
  })
})

describe('parsers', () => {
  it('round-trips binary STL', () => {
    const s = meshStats(parseSTL(binaryStl(sampleMesh('cube'))))
    expect(s.volume).toBeCloseTo(8000, 3)
  })
  it('parses ASCII STL', () => {
    const txt = `solid t
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 10 0 0
  vertex 0 10 0
 endloop
endfacet
endsolid t`
    const m = parseSTL(new TextEncoder().encode(txt).buffer as ArrayBuffer)
    expect(m.pos.length).toBe(9)
    expect(meshStats(m).area).toBeCloseTo(50, 6)
  })
  it('rejects garbage', () => {
    expect(() => parseSTL(new TextEncoder().encode('hello').buffer as ArrayBuffer)).toThrow()
  })
  it('parses OBJ quads and negative indices', () => {
    const obj = `v 0 0 0\nv 10 0 0\nv 10 10 0\nv 0 10 0\nf 1 2 3 4\nf -4 -3 -2 -1\n`
    const m = parseOBJ(obj)
    expect(m.pos.length / 9).toBe(4)
    expect(meshStats(m).area).toBeCloseTo(200, 6)
  })
})
