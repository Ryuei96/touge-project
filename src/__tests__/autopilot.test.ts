import { describe, expect, it } from 'vitest'
import { sampleCenterline } from '../road/spline'
import { computeAutopilot } from '../vehicle/autopilot'

describe('computeAutopilot', () => {
  const samples = sampleCenterline(
    [
      { x: 0, y: 0, z: 40 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -100 },
      { x: -30, y: 0, z: -150 }, // 左カーブ
      { x: -80, y: 0, z: -160 },
    ],
    { step: 2 },
  )

  it('steers toward the centerline when offset to the right', () => {
    const r = computeAutopilot(samples, { x: 2, y: 0, z: -20 }, { x: 0, y: 0, z: -1 }, 10, 0)
    expect(r.input.steer).toBeLessThan(0) // 左へ戻す
    expect(r.input.throttle).toBeGreaterThan(0)
  })

  it('slows down before a curve', () => {
    const straight = computeAutopilot(samples, { x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: -1 }, 25, 0)
    const beforeCurve = computeAutopilot(samples, { x: 0, y: 0, z: -95 }, { x: 0, y: 0, z: -1 }, 25, 60)
    expect(beforeCurve.targetSpeed).toBeLessThan(straight.targetSpeed)
    expect(beforeCurve.input.brake).toBeGreaterThan(0)
  })
})
