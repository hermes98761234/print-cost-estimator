import type { Mesh, MeshStats } from './mesh'
import { shellVolume } from './mesh'
import type { GcodeInfo } from './gcode'

export interface Material {
  id: string
  name: string
  /** g/cm³ */
  density: number
  /** currency units per kg */
  pricePerKg: number
  process: 'fdm' | 'resin'
}

export const MATERIALS: Material[] = [
  { id: 'pla', name: 'PLA', density: 1.24, pricePerKg: 20, process: 'fdm' },
  { id: 'petg', name: 'PETG', density: 1.27, pricePerKg: 22, process: 'fdm' },
  { id: 'abs', name: 'ABS', density: 1.04, pricePerKg: 20, process: 'fdm' },
  { id: 'asa', name: 'ASA', density: 1.07, pricePerKg: 28, process: 'fdm' },
  { id: 'tpu', name: 'TPU', density: 1.21, pricePerKg: 35, process: 'fdm' },
  { id: 'nylon', name: 'Nylon (PA12)', density: 1.01, pricePerKg: 50, process: 'fdm' },
  { id: 'resin', name: 'Resin (standard)', density: 1.1, pricePerKg: 35, process: 'resin' },
]

export interface Params {
  materialId: string
  density: number
  pricePerKg: number
  // geometry & process
  scalePct: number
  quantity: number
  layerHeight: number
  lineWidth: number
  perimeters: number
  topBottomLayers: number
  infillPct: number
  supportsPct: number
  wastePct: number
  printSpeed: number
  maxFlow: number
  /** resin: seconds per layer (exposure + lift) */
  resinSecPerLayer: number
  /** resin: 100 = solid, lower = hollowed with 2 mm walls and that fraction of the interior kept */
  resinHollow: boolean
  // machine
  powerW: number
  machinePrice: number
  lifetimeHours: number
  electricityPerKWh: number
  // business
  laborMinutes: number
  laborRate: number
  failurePct: number
  markupPct: number
  taxPct: number
}

export const DEFAULT_PARAMS: Params = {
  materialId: 'pla',
  density: 1.24,
  pricePerKg: 20,
  scalePct: 100,
  quantity: 1,
  layerHeight: 0.2,
  lineWidth: 0.45,
  perimeters: 3,
  topBottomLayers: 4,
  infillPct: 20,
  supportsPct: 0,
  wastePct: 5,
  printSpeed: 60,
  maxFlow: 12,
  resinSecPerLayer: 9,
  resinHollow: false,
  powerW: 120,
  machinePrice: 300,
  lifetimeHours: 3000,
  electricityPerKWh: 0.15,
  laborMinutes: 10,
  laborRate: 15,
  failurePct: 5,
  markupPct: 30,
  taxPct: 0,
}

export interface Estimate {
  /** printed material volume per part, mm³ (before supports/waste) */
  modelVolume: number
  shellVolume: number
  infillVolume: number
  /** grams of material per part including supports (no waste) */
  partGrams: number
  /** grams per part including waste */
  gramsWithWaste: number
  /** print hours for the whole batch */
  hours: number
  hoursPerPart: number
  layers: number
  source: 'model' | 'gcode'
  timeSource: 'model' | 'comment' | 'simulated'
  flowLimited: boolean
}

export interface CostLine {
  key: 'material' | 'electricity' | 'depreciation' | 'labor' | 'failure'
  amount: number
}

export interface Quote {
  lines: CostLine[]
  subtotal: number
  markup: number
  tax: number
  total: number
  perUnit: number
}

/** Volume (mm³) of material that gets deposited per part for FDM walls + infill, or the resin volume. */
export function materialVolume(mesh: Mesh, stats: MeshStats, p: Params, process: 'fdm' | 'resin') {
  const k = p.scalePct / 100
  const volume = stats.volume * k ** 3
  if (process === 'resin') {
    if (!p.resinHollow) return { volume, shell: volume, infill: 0 }
    const shell = Math.min(volume, stats.area * k * k * 2)
    return { volume, shell, infill: 0 }
  }
  const wall = p.perimeters * p.lineWidth
  const tb = p.topBottomLayers * p.layerHeight
  // Shell thickness is in mm, so the integral over the (unscaled) mesh scales with k².
  const shell = Math.min(volume, shellVolume(mesh, wall / k, tb / k) * k ** 3)
  const infill = Math.max(0, volume - shell) * (p.infillPct / 100)
  return { volume, shell, infill }
}

export function estimateFromModel(mesh: Mesh, stats: MeshStats, p: Params, process: 'fdm' | 'resin'): Estimate {
  const k = p.scalePct / 100
  const { volume, shell, infill } = materialVolume(mesh, stats, p, process)
  const deposited = shell + infill
  const layers = Math.max(1, Math.ceil((stats.size[2] * k) / p.layerHeight))
  const partGrams = (deposited / 1000) * p.density * (1 + p.supportsPct / 100)
  const gramsWithWaste = partGrams * (1 + p.wastePct / 100)
  let secondsPerPart: number
  let flowLimited = false
  if (process === 'resin') {
    secondsPerPart = layers * p.resinSecPerLayer + 300
  } else {
    const natural = p.printSpeed * p.lineWidth * p.layerHeight
    flowLimited = natural > p.maxFlow
    const flow = Math.min(natural, p.maxFlow)
    secondsPerPart = (deposited * (1 + p.supportsPct / 100)) / flow + layers * 2.5 + 300
  }
  const q = Math.max(1, Math.round(p.quantity))
  return {
    modelVolume: volume,
    shellVolume: shell,
    infillVolume: infill,
    partGrams,
    gramsWithWaste,
    hours: (secondsPerPart * q) / 3600,
    hoursPerPart: secondsPerPart / 3600,
    layers,
    source: 'model',
    timeSource: 'model',
    flowLimited,
  }
}

/** G-code supplies the time (and material, when reported); the model still gives the volume breakdown. */
export function estimateFromGcode(base: Estimate, g: GcodeInfo, p: Params, filamentDiameter = 1.75): Estimate {
  const area = Math.PI * (filamentDiameter / 2) ** 2
  const grams = g.filamentG ?? (g.filamentMm * area * p.density) / 1000
  const q = Math.max(1, Math.round(p.quantity))
  return {
    ...base,
    partGrams: grams,
    gramsWithWaste: grams * (1 + p.wastePct / 100),
    hoursPerPart: g.seconds / 3600,
    hours: (g.seconds * q) / 3600,
    layers: g.layers || base.layers,
    source: 'gcode',
    timeSource: g.timeSource,
    flowLimited: false,
  }
}


export function quote(e: Estimate, p: Params): Quote {
  const q = Math.max(1, Math.round(p.quantity))
  const material = (e.gramsWithWaste * q * p.pricePerKg) / 1000
  const electricity = (p.powerW / 1000) * e.hours * p.electricityPerKWh
  const depreciation = p.lifetimeHours > 0 ? (p.machinePrice / p.lifetimeHours) * e.hours : 0
  const labor = (p.laborMinutes / 60) * p.laborRate
  const base = material + electricity + depreciation + labor
  const failure = base * (p.failurePct / 100)
  const lines: CostLine[] = [
    { key: 'material', amount: material },
    { key: 'electricity', amount: electricity },
    { key: 'depreciation', amount: depreciation },
    { key: 'labor', amount: labor },
    { key: 'failure', amount: failure },
  ]
  const subtotal = base + failure
  const markup = subtotal * (p.markupPct / 100)
  const tax = (subtotal + markup) * (p.taxPct / 100)
  const total = subtotal + markup + tax
  return { lines, subtotal, markup, tax, total, perUnit: total / q }
}

export function formatDuration(hours: number): string {
  const total = Math.round(hours * 3600)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

