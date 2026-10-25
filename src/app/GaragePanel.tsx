import { useMemo } from 'react'
import { CAR_PRESETS, PART_LABELS, PART_OPTIONS, getCarPreset, getPartOption, resolveVehicleConfig, summarizeConfig, type PartCategory } from '../vehicle/carCatalog'
import { DEFAULT_VEHICLE_CONFIG } from '../vehicle/vehicleConfig'
import { useGarageStore } from './garageStore'

export function GaragePanel() {
  const carId = useGarageStore((s) => s.carId)
  const tuning = useGarageStore((s) => s.tuning)
  const setCar = useGarageStore((s) => s.setCar)
  const setTuning = useGarageStore((s) => s.setTuning)
  const setPart = useGarageStore((s) => s.setPart)
  const resetTuning = useGarageStore((s) => s.resetTuning)
  const preset = getCarPreset(carId)
  const summary = useMemo(() => summarizeConfig(resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, tuning)), [preset, tuning])
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
      <div className="parts-grid">
        {(Object.keys(PART_OPTIONS) as PartCategory[]).map((cat) => {
          const current = getPartOption(cat, tuning.parts[cat])
          return (
            <label key={cat} className="part-row small" title={current.description}>
              <span className="part-label">{PART_LABELS[cat]}</span>
              <select id={`part-${cat}`} value={current.id} onChange={(e) => setPart(cat, e.target.value)}>
                {PART_OPTIONS[cat].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>
      <div className="stats-grid small">
        <span>駆動力</span>
        <b>{summary.driveForceN.toFixed(0)} N</b>
        <span>重量</span>
        <b>{summary.massKg.toFixed(0)} kg</b>
        <span>最高速</span>
        <b>{summary.maxSpeedKmh.toFixed(0)} km/h</b>
        <span>0-100 目安</span>
        <b>{summary.zeroToHundredS.toFixed(1)} s</b>
        <span>グリップ</span>
        <b>{summary.grip.toFixed(2)}</b>
        <span>パワーウェイト</span>
        <b>{summary.powerToWeight.toFixed(2)} N/kg</b>
      </div>
      <label className="row small">
        ボディ色
        <input id="tune-color" type="color" value={tuning.bodyColor ?? preset.look.body} onChange={(e) => setTuning({ bodyColor: e.target.value })} />
        <button className="mini" onClick={() => setTuning({ bodyColor: undefined })}>
          標準色
        </button>
        <button className="mini" onClick={resetTuning}>
          パーツを初期化
        </button>
      </label>
    </div>
  )
}
