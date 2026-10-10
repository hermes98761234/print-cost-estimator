/** Triangle mesh in millimetres: 9 floats per triangle (x0 y0 z0 x1 y1 z1 x2 y2 z2). */
export interface Mesh {
  pos: Float32Array
}

export interface MeshStats {
  triangles: number
  /** Enclosed volume in mm³ (absolute value of the signed sum). */
  volume: number
  /** Surface area in mm². */
  area: number
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
  /** Edges used by an odd number of triangles: > 0 means the mesh is not watertight. */
  openEdges: number
  /** True when the signed volume was negative (inverted normals / winding). */
  inverted: boolean
}

export function triangleCount(m: Mesh): number {
  return m.pos.length / 9
}

/** Parses binary or ASCII STL. Throws on garbage input. */
export function parseSTL(buf: ArrayBuffer): Mesh {
  if (buf.byteLength >= 84) {
    const n = new DataView(buf).getUint32(80, true)
    if (84 + n * 50 === buf.byteLength) {
      const dv = new DataView(buf)
      const pos = new Float32Array(n * 9)
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12
        for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(o + k * 4, true)
      }
      return { pos }
    }
  }
  const text = new TextDecoder().decode(buf)
  if (!/^\s*solid/i.test(text)) throw new Error('Not an STL file')
  const out: number[] = []
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(+m[1], +m[2], +m[3])
  if (out.length === 0 || out.length % 9 !== 0) throw new Error('Not an STL file')
  return { pos: Float32Array.from(out) }
}

/** Parses Wavefront OBJ (v / f lines; polygons are fan-triangulated). */
export function parseOBJ(text: string): Mesh {
  const v: number[] = []
  const out: number[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/)
      v.push(+p[1], +p[2], +p[3])
    } else if (line.startsWith('f ')) {
      const n = v.length / 3
      const idx = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((s) => {
          const i = parseInt(s.split('/')[0], 10)
          return i < 0 ? n + i : i - 1
        })
      for (let k = 1; k + 1 < idx.length; k++) {
        for (const i of [idx[0], idx[k], idx[k + 1]]) {
          if (!(i >= 0 && i < n)) throw new Error('Bad OBJ face index')
          out.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2])
        }
      }
    }
  }
  if (out.length === 0) throw new Error('No faces in OBJ')
  return { pos: Float32Array.from(out) }
}

export function parseMeshFile(name: string, buf: ArrayBuffer): Mesh {
  if (/\.obj$/i.test(name)) return parseOBJ(new TextDecoder().decode(buf))
  return parseSTL(buf)
}

export function meshStats(m: Mesh): MeshStats {
  const p = m.pos
  const n = p.length / 9
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  let vol = 0
  let area = 0
  const edges = new Map<string, number>()
  const key = (o: number) => `${Math.round(p[o] * 1e3)},${Math.round(p[o + 1] * 1e3)},${Math.round(p[o + 2] * 1e3)}`
  for (let i = 0; i < n; i++) {
    const o = i * 9
    for (let k = 0; k < 9; k++) {
      const a = k % 3
      if (p[o + k] < min[a]) min[a] = p[o + k]
      if (p[o + k] > max[a]) max[a] = p[o + k]
    }
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [p[o], p[o + 1], p[o + 2], p[o + 3], p[o + 4], p[o + 5], p[o + 6], p[o + 7], p[o + 8]]
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az
    area += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx)
    const ks = [key(o), key(o + 3), key(o + 6)]
    for (let e = 0; e < 3; e++) {
      const a = ks[e], b = ks[(e + 1) % 3]
      if (a === b) continue
      const ek = a < b ? `${a}|${b}` : `${b}|${a}`
      edges.set(ek, (edges.get(ek) ?? 0) + 1)
    }
  }
  let openEdges = 0
  for (const c of edges.values()) if (c % 2 === 1) openEdges++
  const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  return { triangles: n, volume: Math.abs(vol), area, min, max, size, openEdges, inverted: vol < 0 }
}

/** Fraction-of-area-weighted shell material: walls use `wall` mm thickness, horizontal faces `topBottom` mm. */
export function shellVolume(m: Mesh, wall: number, topBottom: number): number {
  const p = m.pos
  let v = 0
  for (let o = 0; o < p.length; o += 9) {
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2]
    const wx = p[o + 6] - p[o], wy = p[o + 7] - p[o + 1], wz = p[o + 8] - p[o + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    const h = Math.abs(nz) / len
    v += 0.5 * len * (h * topBottom + (1 - h) * wall)
  }
  return v
}

/** Closed box centred on the XY origin, sitting on z=0. */
function box(w: number, d: number, h: number): number[] {
  const x = w / 2, y = d / 2
  const v = [
    [-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0],
    [-x, -y, h], [x, -y, h], [x, y, h], [-x, y, h],
  ]
  const f = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ]
  return f.flatMap((t) => t.flatMap((i) => v[i]))
}

/** Surface of revolution of a closed counter-clockwise (r, z) profile; outward normals. */
function lathe(profile: [number, number][], seg: number): number[] {
  const out: number[] = []
  const pt = (i: number, a: number): number[] => [profile[i][0] * Math.cos(a), profile[i][0] * Math.sin(a), profile[i][1]]
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * 2 * Math.PI
    const a1 = ((s + 1) / seg) * 2 * Math.PI
    for (let i = 0; i < profile.length; i++) {
      const j = (i + 1) % profile.length
      const [p00, p01, p10, p11] = [pt(i, a0), pt(i, a1), pt(j, a0), pt(j, a1)]
      if (profile[i][0] > 1e-9) out.push(...p00, ...p01, ...p10)
      if (profile[j][0] > 1e-9) out.push(...p01, ...p11, ...p10)
    }
  }
  return out
}

export type SampleId = 'cube' | 'torus' | 'vase' | 'cylinder'

export function sampleMesh(id: SampleId): Mesh {
  switch (id) {
    case 'cube':
      return { pos: Float32Array.from(box(20, 20, 20)) }
    case 'cylinder':
      return { pos: Float32Array.from(lathe([[0, 0], [15, 0], [15, 30], [0, 30]], 64)) }
    case 'torus': {
      const R = 20, r = 6, n = 24
      const profile: [number, number][] = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI
        profile.push([R + r * Math.cos(a), r + r * Math.sin(a)])
      }
      return { pos: Float32Array.from(lathe(profile, 64)) }
    }
    case 'vase': {
      // 2 mm thick wall, 3 mm floor, bulging profile, 80 mm tall.
      const n = 20, H = 80
      const rad = (z: number) => 22 + 8 * Math.sin((z / H) * Math.PI * 1.5)
      const prof: [number, number][] = [[0, 0]]
      for (let i = 0; i <= n; i++) prof.push([rad((i / n) * H), (i / n) * H])
      for (let i = n; i >= 1; i--) prof.push([rad((i / n) * H) - 2, (i / n) * H])
      prof.push([rad((1 / n) * H) - 2, 3], [0, 3])
      return { pos: Float32Array.from(lathe(prof, 64)) }
    }
  }
}
