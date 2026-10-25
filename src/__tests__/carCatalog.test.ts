import { describe, expect, it } from 'vitest'
import { CAR_PRESETS, DEFAULT_TUNING, getCarPreset, resolveVehicleConfig } from '../vehicle/carCatalog'
import { DEFAULT_VEHICLE_CONFIG } from '../vehicle/vehicleConfig'

describe('carCatalog', () => {
  it('has unique ids and resolves unknown ids to the first preset', () => {
    const ids = CAR_PRESETS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(getCarPreset('nope').id).toBe(CAR_PRESETS[0].id)
  })

  it('applies preset overrides and tuning multipliers', () => {
    const preset = getCarPreset('black-gt')
    const neutral = resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, DEFAULT_TUNING)
    expect(neutral.massKg).toBe(1480)
    expect(neutral.maxEngineForce).toBeCloseTo(4600, 6)
    const tuned = resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, { ...DEFAULT_TUNING, power: 1, grip: 0 })
    expect(tuned.maxEngineForce).toBeCloseTo(4600 * 1.3, 6)
    expect(tuned.frictionSlip).toBeCloseTo(2.5 * 0.65, 6)
  })
})
