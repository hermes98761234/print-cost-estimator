import type { CostLine, Estimate, Quote } from './lib/estimate'
import { formatDuration } from './lib/estimate'
import type { MeshStats } from './lib/mesh'
import type { T } from './i18n'

export const LINE_LABEL: Record<CostLine['key'], string> = {
  material: 'Material',
  electricity: 'Electricity',
  depreciation: 'Machine depreciation',
  labor: 'Labor',
  failure: 'Failure allowance',
}

export function money(x: number, cur: string): string {
  return `${cur}${x.toFixed(2)}`
}

export interface SummaryInput {
  title: string
  customer: string
  fileName: string
  materialName: string
  stats: MeshStats
  scalePct: number
  quantity: number
  est: Estimate
  q: Quote
  currency: string
}

/** Plain-text quote for copy/paste. */
export function summaryText(i: SummaryInput, t: T): string {
  const k = i.scalePct / 100
  const lines = [
    `${t('3D print quote')}${i.title ? `: ${i.title}` : ''}`,
    ...(i.customer ? [`${t('Customer')}: ${i.customer}`] : []),
    `${t('Model')}: ${i.fileName}, ${(i.stats.size[0] * k).toFixed(1)} x ${(i.stats.size[1] * k).toFixed(1)} x ${(i.stats.size[2] * k).toFixed(1)} mm`,
    `${t('Material')}: ${i.materialName}, ${i.est.gramsWithWaste.toFixed(1)} g ${t('per part (with waste)')}`,
    `${t('Quantity')}: ${i.quantity}`,
    `${t('Print time')}: ${formatDuration(i.est.hours)}`,
    '',
    ...i.q.lines.map((l) => `${t(LINE_LABEL[l.key])}: ${money(l.amount, i.currency)}`),
    `${t('Markup')}: ${money(i.q.markup, i.currency)}`,
    ...(i.q.tax > 0 ? [`${t('Tax')}: ${money(i.q.tax, i.currency)}`] : []),
    `${t('Total')}: ${money(i.q.total, i.currency)}`,
    ...(i.quantity > 1 ? [`${t('Per unit')}: ${money(i.q.perUnit, i.currency)}`] : []),
  ]
  return lines.join('\n')
}
