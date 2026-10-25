import { CAR_PRESETS, DEFAULT_TUNING, getCarPreset, type CarTuning } from '../vehicle/carCatalog'
import { useGarageStore } from './garageStore'

const SLIDERS: { key: keyof Omit<CarTuning, 'bodyColor'>; label: string; low: string; high: string }[] = [
  { key: 'power', label: '出力', low: 'ノーマル', high: 'ハイパワー' },
  { key: 'grip', label: 'グリップ', low: '滑る', high: '食う' },
  { key: 'suspension', label: '足回り', low: '柔らかい', high: '硬い' },
  { key: 'steering', label: 'ステア', low: '穏やか', high: 'クイック' },
]

export function GaragePanel() {
  const carId = useGarageStore((s) => s.carId)
  const tuning = useGarageStore((s) => s.tuning)
  const setCar = useGarageStore((s) => s.setCar)
  const setTuning = useGarageStore((s) => s.setTuning)
  const resetTuning = useGarageStore((s) => s.resetTuning)
  const preset = getCarPreset(carId)
  return (
    <div className="subpanel">
      <div className="subtitle">ガレージ</div>
      <div className="car-list">
        {CAR_PRESETS.map((c) => (
          <button key={c.id} className={`car-card ${c.id === carId ? 'selected' : ''}`} onClick={() => setCar(c.id)} title={c.tagline}>
            <span className="swatch" style={{ background: `linear-gradient(180deg, ${c.look.upper ?? c.look.body} 50%, ${c.look.body} 50%)` }} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <div className="small tagline">{preset.tagline}</div>
      {SLIDERS.map((s) => (
        <label key={s.key} className="slider-row small">
          <span className="slider-label">{s.label}</span>
          <span className="slider-end">{s.low}</span>
          <input id={`tune-${s.key}`} type="range" min={0} max={1} step={0.05} value={tuning[s.key]} onChange={(e) => setTuning({ [s.key]: Number(e.target.value) })} />
          <span className="slider-end">{s.high}</span>
        </label>
      ))}
      <label className="row small">
        ボディ色
        <input id="tune-color" type="color" value={tuning.bodyColor ?? preset.look.body} onChange={(e) => setTuning({ bodyColor: e.target.value })} />
        <button className="mini" onClick={() => setTuning({ bodyColor: undefined })}>
          標準色
        </button>
        <button className="mini" onClick={resetTuning} disabled={JSON.stringify(tuning) === JSON.stringify(DEFAULT_TUNING)}>
          リセット
        </button>
      </label>
    </div>
  )
}
