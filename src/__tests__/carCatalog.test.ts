import { describe, expect, it } from 'vitest'
import { CAR_PRESETS, DEFAULT_PARTS, DEFAULT_TUNING, getCarPreset, resolveVehicleConfig, summarizeConfig } from '../vehicle/carCatalog'
import { DEFAULT_VEHICLE_CONFIG } from '../vehicle/vehicleConfig'

describe('carCatalog', () => {
  it('has unique ids and resolves unknown ids to the first preset', () => {
    const ids = CAR_PRESETS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(getCarPreset('nope').id).toBe(CAR_PRESETS[0].id)
  })

  it('applies preset overrides and part multipliers', () => {
    const preset = getCarPreset('black-gt')
    const stock = resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, DEFAULT_TUNING)
    expect(stock.massKg).toBe(1480)
    expect(stock.maxEngineForce).toBeCloseTo(4600, 6)
    const tuned = resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, { parts: { ...DEFAULT_PARTS, engine: 'full', weight: 'race', tires: 'eco' } })
    expect(tuned.maxEngineForce).toBeCloseTo(4600 * 1.35, 6)
    expect(tuned.maxSpeed).toBeCloseTo(62 + 8, 6)
    expect(tuned.massKg).toBeCloseTo(1480 * 0.85, 6)
    expect(tuned.frictionSlip).toBeCloseTo(2.5 * 0.8, 6)
    const summary = summarizeConfig(tuned)
    expect(summary.zeroToHundredS).toBeLessThan(summarizeConfig(stock).zeroToHundredS)
    expect(summary.maxSpeedKmh).toBeCloseTo(70 * 3.6, 6)
  })

  it('ignores unknown part ids by falling back to the first option', () => {
    const preset = getCarPreset('panda-hatch')
    const cfg = resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, { parts: { ...DEFAULT_PARTS, engine: 'does-not-exist' } })
    expect(cfg.maxEngineForce).toBeCloseTo(2600, 6)
  })
})
