import { useState } from 'react'

interface Props {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
}

/** Number input that keeps what the user types (even half-typed "0.") and only commits valid values. */
export default function NumberField({ label, value, onChange, min, max, step, unit }: Props) {
  const [draft, setDraft] = useState(String(value))
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    // External change (preset, reset): resync the draft unless it already means the same number.
    setPrev(value)
    if (parseFloat(draft) !== value) setDraft(String(value))
  }
  const n = parseFloat(draft)
  const bad = !Number.isFinite(n) || (min != null && n < min) || (max != null && n > max)
  return (
    <label className="field">
      <span>
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <input
        type="number"
        inputMode="decimal"
        className={bad ? 'bad' : undefined}
        value={draft}
        min={min}
        max={max}
        step={step ?? 'any'}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v) && (min == null || v >= min) && (max == null || v <= max)) onChange(v)
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  )
}
