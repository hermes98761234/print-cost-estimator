import { useEffect, useMemo, useRef, useState } from 'react'
import { MATERIALS, estimateFromGcode, estimateFromModel, formatDuration, quote, type Params } from './lib/estimate'
import { parseGcode, type GcodeInfo } from './lib/gcode'
import { meshStats, parseMeshFile, sampleMesh, type Mesh, type SampleId } from './lib/mesh'
import { loadState, saveState, type AppState, type Settings } from './lib/model'
import { tr, type T } from './i18n'
import { LINE_LABEL, money, summaryText } from './summary'
import NumberField from './components/NumberField'
import MeshView from './components/MeshView'

const SAMPLES: { id: SampleId; label: string }[] = [
  { id: 'cube', label: '20 mm cube' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'torus', label: 'Torus' },
  { id: 'vase', label: 'Vase' },
]

interface Loaded {
  mesh: Mesh
  name: string
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [loaded, setLoaded] = useState<Loaded>(() => ({ mesh: sampleMesh('torus'), name: 'torus.stl' }))
  const [gcode, setGcode] = useState<{ name: string; info: GcodeInfo } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const { settings, params } = state
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const setParams = (patch: Partial<Params>) => setState((s) => ({ ...s, params: { ...s.params, ...patch } }))
  const setSettings = (patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])

  const material = MATERIALS.find((m) => m.id === params.materialId) ?? MATERIALS[0]
  const stats = useMemo(() => meshStats(loaded.mesh), [loaded.mesh])
  const base = useMemo(() => estimateFromModel(loaded.mesh, stats, params, material.process), [loaded.mesh, stats, params, material.process])
  const est = useMemo(() => (gcode ? estimateFromGcode(base, gcode.info, params) : base), [base, gcode, params])
  const q = useMemo(() => quote(est, params), [est, params])
  const cur = settings.currency
  const k = params.scalePct / 100

  const handleFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        if (/\.(stl|obj)$/i.test(f.name)) {
          const mesh = parseMeshFile(f.name, await f.arrayBuffer())
          setLoaded({ mesh, name: f.name })
          setError(null)
        } else if (/\.(gcode|gco|gc|g|nc)$/i.test(f.name)) {
          setGcode({ name: f.name, info: parseGcode(await f.text()) })
          setError(null)
        } else {
          setError(t('Unsupported file: {0}', f.name))
        }
      } catch (e) {
        setError(t('Could not read {0}: {1}', f.name, e instanceof Error ? e.message : String(e)))
      }
    }
  }

  const pickMaterial = (id: string) => {
    const m = MATERIALS.find((x) => x.id === id) ?? MATERIALS[0]
    setParams({ materialId: m.id, density: m.density, pricePerKg: m.pricePerKg, ...(m.process === 'resin' ? { layerHeight: 0.05 } : params.layerHeight < 0.1 ? { layerHeight: 0.2 } : {}) })
    if (m.process === 'resin') setGcode(null)
  }

  const summary = summaryText(
    { title: settings.jobTitle, customer: settings.customer, fileName: loaded.name, materialName: material.name, stats, scalePct: params.scalePct, quantity: params.quantity, est, q, currency: cur },
    t,
  )
  const maxLine = Math.max(...q.lines.map((l) => l.amount), 1e-9)
  const fdm = material.process === 'fdm'
  const num = (key: keyof Params, label: string, extra: { min?: number; max?: number; step?: number; unit?: string } = {}) => (
    <NumberField label={t(label)} value={params[key] as number} onChange={(v) => setParams({ [key]: v })} min={extra.min ?? 0} max={extra.max} step={extra.step} unit={extra.unit} />
  )

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('3D print cost estimator')}</span>
        <span className="hint">{t('Load an STL, get weight, time and a price quote.')}</span>
        <span className="spacer" />
        <label className="inline">
          {t('Language')}
          <select value={settings.lang} onChange={(e) => setSettings({ lang: e.target.value as Settings['lang'] })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}
          <select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as Settings['theme'] })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <section className="section">
              <h3>{t('Model')}</h3>
              <div
                className={`drop${dragOver ? ' over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  void handleFiles(e.dataTransfer.files)
                }}
              >
                <FilePick label={t('Open STL / OBJ')} accept=".stl,.obj" onFiles={handleFiles} />
                <span className="hint">{t('or drop a file here')}</span>
              </div>
              <div className="row">
                {SAMPLES.map((s) => (
                  <button key={s.id} className="small" onClick={() => setLoaded({ mesh: sampleMesh(s.id), name: `${s.id}.stl` })}>
                    {t(s.label)}
                  </button>
                ))}
              </div>
              {error && <p className="err-text">{error}</p>}
              <div className="grid2">
                {num('scalePct', 'Scale', { min: 1, max: 5000, unit: '%' })}
                {num('quantity', 'Quantity', { min: 1, max: 10000, step: 1 })}
              </div>
            </section>

            <section className="section">
              <h3>{t('Material')}</h3>
              <label className="field">
                <span>{t('Filament / resin')}</span>
                <select value={params.materialId} onChange={(e) => pickMaterial(e.target.value)}>
                  {MATERIALS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid2">
                {num('density', 'Density', { min: 0.1, unit: 'g/cm³' })}
                {num('pricePerKg', 'Price', { unit: `${cur}/kg` })}
              </div>
            </section>

            <section className="section">
              <h3>{t('Print settings')}</h3>
              <div className="grid2">
                {num('layerHeight', 'Layer height', { min: 0.01, max: 2, unit: 'mm' })}
                {fdm && num('lineWidth', 'Line width', { min: 0.1, max: 3, unit: 'mm' })}
                {fdm && num('perimeters', 'Walls', { min: 0, step: 1 })}
                {fdm && num('topBottomLayers', 'Top/bottom layers', { min: 0, step: 1 })}
                {fdm && num('infillPct', 'Infill', { max: 100, unit: '%' })}
                {fdm && num('supportsPct', 'Supports', { unit: '%' })}
                {fdm && num('printSpeed', 'Print speed', { min: 1, unit: 'mm/s' })}
                {fdm && num('maxFlow', 'Max flow', { min: 0.1, unit: 'mm³/s' })}
                {!fdm && num('resinSecPerLayer', 'Seconds per layer', { min: 0.1, unit: 's' })}
                {num('wastePct', 'Waste / purge', { unit: '%' })}
              </div>
              {!fdm && (
                <label className="check">
                  <input type="checkbox" checked={params.resinHollow} onChange={(e) => setParams({ resinHollow: e.target.checked })} />
                  {t('Hollowed (2 mm walls)')}
                </label>
              )}
            </section>

            <section className="section">
              <h3>{t('Machine')}</h3>
              <div className="grid2">
                {num('powerW', 'Average power', { unit: 'W' })}
                {num('electricityPerKWh', 'Electricity', { unit: `${cur}/kWh` })}
                {num('machinePrice', 'Machine price', { unit: cur })}
                {num('lifetimeHours', 'Lifetime', { min: 1, unit: 'h' })}
              </div>
            </section>

            <section className="section">
              <h3>{t('Business')}</h3>
              <div className="grid2">
                {num('laborMinutes', 'Labor per job', { unit: 'min' })}
                {num('laborRate', 'Labor rate', { unit: `${cur}/h` })}
                {num('failurePct', 'Failure allowance', { unit: '%' })}
                {num('markupPct', 'Markup', { unit: '%' })}
                {num('taxPct', 'Tax', { unit: '%' })}
                <label className="field">
                  <span>{t('Currency symbol')}</span>
                  <input type="text" maxLength={4} value={cur} onChange={(e) => setSettings({ currency: e.target.value })} />
                </label>
              </div>
            </section>

            {fdm && (
              <section className="section">
                <h3>{t('G-code (optional)')}</h3>
                <p className="hint">{t('Use the slicer’s own time and filament numbers instead of the estimate.')}</p>
                <div className="row">
                  <FilePick label={t('Open G-code')} accept=".gcode,.gco,.gc,.g,.nc" onFiles={handleFiles} />
                  {gcode && (
                    <button className="small danger" onClick={() => setGcode(null)}>
                      {t('Remove')}
                    </button>
                  )}
                </div>
                {gcode && (
                  <p className="hint">
                    {gcode.name}: {formatDuration(gcode.info.seconds / 3600)} ({gcode.info.timeSource === 'comment' ? t('from slicer comment') : t('simulated from moves')}), {(gcode.info.filamentMm / 1000).toFixed(2)} m
                  </p>
                )}
              </section>
            )}
          </div>
        </aside>

        <main className="main">
          <div className="box model-box">
            <MeshView mesh={loaded.mesh} label={t('3D preview of the model, drag to rotate')} />
            <div className="stats">
              <h3>{loaded.name}</h3>
              <table className="data">
                <tbody>
                  <tr><td>{t('Size')}</td><td>{(stats.size[0] * k).toFixed(1)} × {(stats.size[1] * k).toFixed(1)} × {(stats.size[2] * k).toFixed(1)} mm</td></tr>
                  <tr><td>{t('Volume')}</td><td>{((stats.volume * k ** 3) / 1000).toFixed(2)} cm³</td></tr>
                  <tr><td>{t('Surface area')}</td><td>{((stats.area * k * k) / 100).toFixed(1)} cm²</td></tr>
                  <tr><td>{t('Triangles')}</td><td>{stats.triangles.toLocaleString(settings.lang)}</td></tr>
                </tbody>
              </table>
              {stats.openEdges > 0 && <p className="warn-text">{t('Mesh is not watertight ({0} open edges): volume may be off.', stats.openEdges)}</p>}
              {stats.inverted && <p className="warn-text">{t('Normals look inverted; volume uses the absolute value.')}</p>}
            </div>
          </div>

          <div className="box">
            <h3>{t('Estimate')}</h3>
            <table className="data">
              <tbody>
                <tr><td>{t('Material per part')}</td><td>{est.partGrams.toFixed(1)} g{fdm && est.source === 'model' ? ` (${t('walls {0} cm³, infill {1} cm³', (est.shellVolume / 1000).toFixed(2), (est.infillVolume / 1000).toFixed(2))})` : ''}</td></tr>
                <tr><td>{t('With waste')}</td><td>{est.gramsWithWaste.toFixed(1)} g</td></tr>
                <tr><td>{t('Filament length')}</td><td>{fdm ? `${(est.partGrams / params.density / (Math.PI * 0.875 ** 2)).toFixed(2)} m (1.75 mm)` : '—'}</td></tr>
                <tr><td>{t('Layers')}</td><td>{est.layers}</td></tr>
                <tr><td>{t('Print time per part')}</td><td>{formatDuration(est.hoursPerPart)} <span className="hint">({est.source === 'gcode' ? t('from G-code') : t('estimated')})</span></td></tr>
                {params.quantity > 1 && <tr><td>{t('Print time, all parts')}</td><td>{formatDuration(est.hours)}</td></tr>}
              </tbody>
            </table>
            {est.flowLimited && <p className="warn-text">{t('Speed is limited by the maximum flow rate.')}</p>}
          </div>

          <div className="box quote">
            <h3>{t('Cost breakdown')}</h3>
            <div className="row no-print">
              <label className="field grow">
                <span>{t('Job title')}</span>
                <input type="text" value={settings.jobTitle} onChange={(e) => setSettings({ jobTitle: e.target.value })} />
              </label>
              <label className="field grow">
                <span>{t('Customer')}</span>
                <input type="text" value={settings.customer} onChange={(e) => setSettings({ customer: e.target.value })} />
              </label>
            </div>
            <p className="print-only quote-head">
              {t('3D print quote')}
              {settings.jobTitle ? `: ${settings.jobTitle}` : ''}
              {settings.customer ? ` (${settings.customer})` : ''}
            </p>
            <table className="data bars">
              <tbody>
                {q.lines.map((l) => (
                  <tr key={l.key}>
                    <td>{t(LINE_LABEL[l.key])}</td>
                    <td className="num">{money(l.amount, cur)}</td>
                    <td className="barcell"><span className="bar" style={{ width: `${(l.amount / maxLine) * 100}%` }} /></td>
                  </tr>
                ))}
                <tr><td>{t('Markup')}</td><td className="num">{money(q.markup, cur)}</td><td /></tr>
                {q.tax > 0 && <tr><td>{t('Tax')}</td><td className="num">{money(q.tax, cur)}</td><td /></tr>}
                <tr className="total"><td>{t('Total')}</td><td className="num">{money(q.total, cur)}</td><td /></tr>
                {params.quantity > 1 && <tr><td>{t('Per unit')}</td><td className="num">{money(q.perUnit, cur)}</td><td /></tr>}
              </tbody>
            </table>
            <div className="row no-print">
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(summary).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  })
                }}
              >
                {copied ? t('Copied') : t('Copy summary')}
              </button>
              <button onClick={() => window.print()}>{t('Print / save as PDF')}</button>
              <button onClick={() => download('quote.txt', summary)}>{t('Download .txt')}</button>
            </div>
            <pre className="summary">{summary}</pre>
          </div>
        </main>
      </div>
      <p className="hint foot">
        {t('Estimates only: real results depend on your slicer, printer and model. Everything runs in your browser; files never leave it.')}{' '}
        <a href="https://github.com/hermes98761234/print-cost-estimator">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}

function FilePick({ label, accept, onFiles }: { label: string; accept: string; onFiles: (f: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button onClick={() => ref.current?.click()}>{label}</button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
