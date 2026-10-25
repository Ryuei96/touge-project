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

describe('closed course handling', () => {
  const loop = sampleCenterline(
    [
      { x: 0, y: 0, z: 0 },
      { x: 60, y: 0, z: -60 },
      { x: 0, y: 0, z: -120 },
      { x: -60, y: 0, z: -60 },
    ],
    { step: 2, closed: true },
  )
  it('wraps the nearest-sample search across the seam', async () => {
    const { nearestSampleIndex } = await import('../road/spline')
    const n = loop.length
    const nearEnd = loop[n - 2].position
    expect(nearestSampleIndex(loop, nearEnd, 2, 10, true)).toBe(n - 2)
    const nearStart = loop[1].position
    expect(nearestSampleIndex(loop, nearStart, n - 2, 10, true)).toBe(1)
  })
  it('keeps driving past the seam on a closed course', () => {
    const n = loop.length
    const s = loop[n - 2]
    const r = computeAutopilot(loop, s.position, s.tangent, 8, n - 2, { closed: true })
    expect(r.targetSpeed).toBeGreaterThan(10)
    expect(r.input.throttle).toBeGreaterThan(0)
    expect(Math.abs(r.input.steer)).toBeLessThan(1) // 継ぎ目が頂点なので舵は切るが飽和はしない
  })
})

describe('AutopilotDriver', () => {
  it('reverses after being stuck with throttle applied', async () => {
    const { AutopilotDriver } = await import('../vehicle/autopilot')
    const straight = sampleCenterline(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -200 },
      ],
      { step: 2 },
    )
    const d = new AutopilotDriver()
    let r = d.update(straight, { x: 0, y: 0, z: -20 }, { x: 0, y: 0, z: -1 }, 0, 10, 0.5)
    expect(r.input.throttle).toBeGreaterThan(0)
    for (let i = 0; i < 4; i++) r = d.update(straight, { x: 0, y: 0, z: -20 }, { x: 0, y: 0, z: -1 }, 0, 10, 0.5)
    expect(r.input.brake).toBe(1) // 後退フェーズ
    expect(r.input.throttle).toBe(0)
  })
})
