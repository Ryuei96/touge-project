import { describe, expect, it } from 'vitest'
import { DEFAULT_LOGITECH_MAPPING, detectChangedAxis, detectPressedButton, isWheelId, loadWheelSettings, pedalValue, readWheel, saveWheelSettings, steerValue } from '../input/wheel'

function fakePad(axes: number[], pressed: number[] = []): Gamepad {
  const buttons = Array.from({ length: 24 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 }))
  return { id: 'G923 Racing Wheel for PlayStation 4 and PC (Vendor: 046d Product: c266)', index: 0, connected: true, mapping: '', axes, buttons, timestamp: 0 } as unknown as Gamepad
}

describe('wheel', () => {
  it('recognises racing wheels by id', () => {
    expect(isWheelId('G923 Racing Wheel for PlayStation 4 and PC (Vendor: 046d Product: c266)')).toBe(true)
    expect(isWheelId('Logitech G29 Driving Force Racing Wheel')).toBe(true)
    expect(isWheelId('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe(false)
  })

  it('normalises pedals that rest at +1 and go to -1', () => {
    const m = DEFAULT_LOGITECH_MAPPING.throttle
    expect(pedalValue(1, m)).toBe(0)
    expect(pedalValue(0, m)).toBeCloseTo(0.5)
    expect(pedalValue(-1, m)).toBe(1)
    expect(pedalValue(1.2, m)).toBe(0)
  })

  it('maps the wheel lock angle to full steer', () => {
    const m = { ...DEFAULT_LOGITECH_MAPPING, wheelRotationDeg: 900, lockToLockDeg: 360, linearity: 1 }
    // 180° right of centre = 0.4 of the 450° half-range → full lock
    expect(steerValue(0.4, m)).toBeCloseTo(1, 2)
    expect(steerValue(0.2, m)).toBeCloseTo(0.5, 1)
    expect(steerValue(-0.4, m)).toBeCloseTo(-1, 2)
    expect(steerValue(0.003, m)).toBe(0)
    expect(steerValue(0.4, { ...m, steerInvert: true })).toBeCloseTo(-1, 2)
  })

  it('reads a full drive input from the default Logitech layout', () => {
    const pad = fakePad([0.2, -1, 1, 1], [1])
    const input = readWheel(pad, { ...DEFAULT_LOGITECH_MAPPING, linearity: 1 })
    expect(input.throttle).toBe(1)
    expect(input.brake).toBe(0)
    expect(input.steer).toBeCloseTo(0.5, 1)
    expect(input.handbrake).toBe(true)
  })

  it('detects the moved axis and pressed button during calibration', () => {
    expect(detectChangedAxis([0, 1, 1, 1], [0, 1, -0.2, 1])).toEqual({ axis: 2, from: 1, to: -0.2 })
    expect(detectChangedAxis([0, 1, 1, 1], [0.1, 1, 1, 1])).toBeNull()
    expect(detectPressedButton([false, false, true], [false, true, true])).toBe(1)
    expect(detectPressedButton([false, true], [false, true])).toBeNull()
  })

  it('round-trips settings through storage and tolerates garbage', () => {
    const map = new Map<string, string>()
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) }
    const settings = { mapping: { ...DEFAULT_LOGITECH_MAPPING, lockToLockDeg: 270, buttons: { ...DEFAULT_LOGITECH_MAPPING.buttons, reset: 7 } }, forceWheel: true }
    saveWheelSettings(settings, storage)
    const loaded = loadWheelSettings(storage)
    expect(loaded.mapping.lockToLockDeg).toBe(270)
    expect(loaded.mapping.buttons.reset).toBe(7)
    expect(loaded.mapping.buttons.camera).toBe(DEFAULT_LOGITECH_MAPPING.buttons.camera)
    expect(loaded.forceWheel).toBe(true)
    map.set('touge-wheel-v1', '{not json')
    expect(loadWheelSettings(storage).mapping).toEqual(DEFAULT_LOGITECH_MAPPING)
  })
})
