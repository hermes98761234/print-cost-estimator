export interface GcodeInfo {
  /** Print time in seconds, from slicer comments when present, otherwise simulated from the moves. */
  seconds: number
  timeSource: 'comment' | 'simulated'
  /** Filament length pushed through the extruder, mm. */
  filamentMm: number
  /** Filament mass in grams if the slicer reported it. */
  filamentG: number | null
  layers: number
}

/** "1d 2h 3m 4s", "1h 5m", "12 minutes", "45s" -> seconds (null if nothing recognised). */
export function parseDuration(s: string): number | null {
  const re = /(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi
  let total = 0
  let found = false
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const u = m[2].toLowerCase()[0]
    const x = parseFloat(m[1])
    total += u === 'd' ? x * 86400 : u === 'h' ? x * 3600 : u === 'm' ? x * 60 : x
    found = true
  }
  return found ? total : null
}

function commentTime(text: string): number | null {
  let m = /^;TIME:(\d+(?:\.\d+)?)/m.exec(text) // Cura
  if (m) return parseFloat(m[1])
  m = /^;\s*total estimated time\s*[:=]\s*([^;\r\n]+)/im.exec(text) // OrcaSlicer / Bambu Studio
  if (m) return parseDuration(m[1])
  m = /^;\s*estimated printing time \(normal mode\)\s*=\s*([^\r\n]+)/im.exec(text) // PrusaSlicer / SuperSlicer
  if (m) return parseDuration(m[1])
  m = /^;\s*estimated printing time\s*=\s*([^\r\n]+)/im.exec(text)
  if (m) return parseDuration(m[1])
  m = /^;\s*Build time:\s*([^\r\n]+)/im.exec(text) // Simplify3D
  if (m) return parseDuration(m[1])
  return null
}

function commentGrams(text: string): number | null {
  const m = /^;\s*(?:total )?filament (?:used \[g\]|weight \[g\])\s*[:=]\s*([\d.,\s]+)/im.exec(text)
  if (!m) return null
  const sum = m[1].split(',').reduce((a, x) => a + (parseFloat(x) || 0), 0)
  return sum > 0 ? sum : null
}

function commentMm(text: string): number | null {
  let m = /^;\s*filament used \[mm\]\s*=\s*([\d.,\s]+)/im.exec(text)
  if (m) {
    const sum = m[1].split(',').reduce((a, x) => a + (parseFloat(x) || 0), 0)
    if (sum > 0) return sum
  }
  m = /^;\s*Filament used:\s*([\d.]+)\s*m\b/im.exec(text) // Cura
  if (m) return parseFloat(m[1]) * 1000
  return null
}

/** Trapezoidal move time: accelerate to the feed rate and brake, or a triangle profile for short moves. */
export function moveTime(dist: number, feed: number, accel: number): number {
  if (dist <= 0 || feed <= 0) return 0
  const dAcc = (feed * feed) / accel
  return dist >= dAcc ? dist / feed + feed / accel : 2 * Math.sqrt(dist / accel)
}

export function parseGcode(text: string, accel = 1500): GcodeInfo {
  let x = 0, y = 0, z = 0, e = 0
  let absXYZ = true, absE = true
  let feed = 1500 / 60 // mm/s
  let t = 0
  let extruded = 0
  let deficit = 0
  let lastLayerZ = NaN
  const zs = new Set<number>()
  for (const raw of text.split('\n')) {
    const semi = raw.indexOf(';')
    const line = (semi >= 0 ? raw.slice(0, semi) : raw).trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    const cmd = parts[0].toUpperCase()
    if (cmd === 'G90') absXYZ = true
    else if (cmd === 'G91') absXYZ = false
    else if (cmd === 'M82') absE = true
    else if (cmd === 'M83') absE = false
    else if (cmd === 'G4') {
      for (const p of parts) {
        if (p[0] === 'P' || p[0] === 'p') t += (parseFloat(p.slice(1)) || 0) / 1000
        else if (p[0] === 'S' || p[0] === 's') t += parseFloat(p.slice(1)) || 0
      }
    } else if (cmd === 'G92') {
      for (const p of parts.slice(1)) {
        const v = parseFloat(p.slice(1))
        if (isNaN(v)) continue
        const a = p[0].toUpperCase()
        if (a === 'E') e = v
        else if (a === 'X') x = v
        else if (a === 'Y') y = v
        else if (a === 'Z') z = v
      }
    } else if (cmd === 'G0' || cmd === 'G1') {
      let nx = x, ny = y, nz = z, de = 0
      let hasE = false
      for (const p of parts.slice(1)) {
        const v = parseFloat(p.slice(1))
        if (isNaN(v)) continue
        switch (p[0].toUpperCase()) {
          case 'X': nx = absXYZ ? v : x + v; break
          case 'Y': ny = absXYZ ? v : y + v; break
          case 'Z': nz = absXYZ ? v : z + v; break
          case 'E': de = absE ? v - e : v; hasE = true; break
          case 'F': feed = v / 60; break
        }
      }
      const xy = Math.hypot(nx - x, ny - y)
      const dist = Math.hypot(xy, nz - z)
      t += moveTime(dist > 0 ? dist : Math.abs(de), feed, accel)
      if (hasE) {
        if (de < 0) deficit += -de
        else {
          const recover = Math.min(deficit, de)
          deficit -= recover
          extruded += de - recover
          if (de - recover > 0 && xy > 0) {
            if (nz !== lastLayerZ) {
              zs.add(Math.round(nz * 1000))
              lastLayerZ = nz
            }
          }
        }
        e = absE ? e + de : e
      }
      x = nx; y = ny; z = nz
    }
  }
  const fromComment = commentTime(text)
  return {
    seconds: fromComment ?? t,
    timeSource: fromComment != null ? 'comment' : 'simulated',
    filamentMm: commentMm(text) ?? extruded,
    filamentG: commentGrams(text),
    layers: zs.size,
  }
}
