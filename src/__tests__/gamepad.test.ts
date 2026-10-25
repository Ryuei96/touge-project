import { afterEach, describe, expect, it, vi } from 'vitest'
import { GamepadInput, mergeInputs } from '../input/gamepad'

function fakePad(axes: number[], buttons: Record<number, number>): Gamepad {
  const b = Array.from({ length: 17 }, (_, i) => ({ pressed: (buttons[i] ?? 0) > 0.5, touched: false, value: buttons[i] ?? 0 }))
  return { id: 'DualSense', index: 0, connected: true, mapping: 'standard', axes, buttons: b, timestamp: 0 } as unknown as Gamepad
}

describe('GamepadInput', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('maps triggers and stick with deadzone', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [fakePad([0.5, 0, 0, 0], { 7: 0.8, 6: 0.2, 2: 1 })] })
    const gp = new GamepadInput()
    gp.poll()
    const i = gp.read()!
    expect(i.throttle).toBeCloseTo(0.8, 6)
    expect(i.brake).toBeCloseTo(0.2, 6)
    expect(i.steer).toBeGreaterThan(0.3)
    expect(i.steer).toBeLessThan(0.5)
    expect(i.handbrake).toBe(true)
    vi.stubGlobal('navigator', { getGamepads: () => [fakePad([0.05, 0, 0, 0], {})] })
    expect(gp.read()!.steer).toBe(0)
  })

  it('reports button edges once', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [fakePad([0, 0, 0, 0], { 0: 1 })] })
    const gp = new GamepadInput()
    gp.poll()
    expect(gp.consume('confirm')).toBe(true)
    gp.poll()
    expect(gp.consume('confirm')).toBe(false)
  })

  it('merges keyboard and pad inputs', () => {
    const merged = mergeInputs({ throttle: 1, brake: 0, steer: -0.2, handbrake: false }, { throttle: 0.3, brake: 0.5, steer: 0.8, handbrake: true })
    expect(merged).toEqual({ throttle: 1, brake: 0.5, steer: 0.8, handbrake: true })
    expect(mergeInputs({ throttle: 0, brake: 0, steer: 0, handbrake: false }, null).throttle).toBe(0)
  })
})
