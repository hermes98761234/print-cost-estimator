import { useEffect, useRef, useState } from 'react'
import type { Mesh } from '../lib/mesh'

const MAX_TRIS = 15000

/** Flat-shaded software render of the mesh; drag to rotate. */
export default function MeshView({ mesh, label }: { mesh: Mesh; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState({ yaw: 0.6, pitch: 0.5 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ w: 300, h: 300 })

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ro = new ResizeObserver(() => setSize({ w: c.clientWidth, h: c.clientHeight }))
    ro.observe(c)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    c.width = size.w * dpr
    c.height = size.h * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, size.w, size.h)
    const cs = getComputedStyle(c)
    const accent = cs.getPropertyValue('--accent').trim() || '#2563eb'
    const rgb = hexToRgb(accent)
    const p = mesh.pos
    const n = p.length / 9
    const stride = Math.max(1, Math.ceil(n / MAX_TRIS))
    // centre + scale
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < p.length; i += 3) for (let a = 0; a < 3; a++) {
      mn[a] = Math.min(mn[a], p[i + a])
      mx[a] = Math.max(mx[a], p[i + a])
    }
    const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2
    const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1
    const s = (Math.min(size.w, size.h) * 1.15) / diag
    const cyaw = Math.cos(view.yaw), syaw = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch)
    const tx = (x: number, y: number, z: number) => {
      const X = (x - cx) * cyaw - (y - cy) * syaw
      const Y = (x - cx) * syaw + (y - cy) * cyaw
      const Z = z - cz
      return [X, Y * cp - Z * sp, Y * sp + Z * cp] as const // x, depth, up
    }
    const tris: { d: number; pts: number[]; shade: number }[] = []
    for (let i = 0; i < n; i += stride) {
      const o = i * 9
      const a = tx(p[o], p[o + 1], p[o + 2]), b = tx(p[o + 3], p[o + 4], p[o + 5]), d = tx(p[o + 6], p[o + 7], p[o + 8])
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2]
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
      const len = Math.hypot(nx, ny, nz) || 1
      nx /= len; ny /= len; nz /= len
      // light from the viewer's upper left
      const shade = 0.35 + 0.65 * Math.abs(nx * -0.4 + ny * -0.5 + nz * 0.76)
      tris.push({ d: (a[1] + b[1] + d[1]) / 3, pts: [a[0], a[2], b[0], b[2], d[0], d[2]], shade })
    }
    tris.sort((u, v) => v.d - u.d)
    const ox = size.w / 2, oy = size.h / 2
    for (const t of tris) {
      g.beginPath()
      g.moveTo(ox + t.pts[0] * s, oy - t.pts[1] * s)
      g.lineTo(ox + t.pts[2] * s, oy - t.pts[3] * s)
      g.lineTo(ox + t.pts[4] * s, oy - t.pts[5] * s)
      g.closePath()
      const col = `rgb(${Math.round(rgb[0] * t.shade)},${Math.round(rgb[1] * t.shade)},${Math.round(rgb[2] * t.shade)})`
      g.fillStyle = col
      g.strokeStyle = col
      g.lineWidth = 0.6
      g.fill()
      g.stroke()
    }
  }, [mesh, view, size])

  return (
    <canvas
      ref={ref}
      className="mesh-canvas"
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        drag.current = { x: e.clientX, y: e.clientY }
        setView((v) => ({ yaw: v.yaw + dx * 0.01, pitch: Math.max(-1.5, Math.min(1.5, v.pitch + dy * 0.01)) }))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    />
  )
}

function hexToRgb(h: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(h)
  if (!m) return [37, 99, 235]
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
