import { describe, expect, it } from 'vitest'
import { catmullRomPoint, nearestSampleIndex, sampleCenterline, sampleIndexAtDistance } from '../road/spline'

describe('sampleCenterline', () => {
  it('samples a straight line at uniform spacing with -Z tangent and +X right', () => {
    const samples = sampleCenterline(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -50 },
        { x: 0, y: 0, z: -100 },
      ],
      { step: 2, defaultWidth: 7 },
    )
    expect(samples.length).toBe(51)
    expect(samples[0].distance).toBe(0)
    expect(samples[50].distance).toBeCloseTo(100, 3)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].distance - samples[i - 1].distance).toBeCloseTo(2, 3)
    }
    const mid = samples[25]
    expect(mid.tangent.z).toBeCloseTo(-1, 5)
    expect(mid.right.x).toBeCloseTo(1, 5)
    expect(mid.normal.y).toBeCloseTo(1, 5)
    expect(mid.width).toBe(7)
    expect(mid.grade).toBeCloseTo(0, 5)
    expect(Math.abs(mid.curvature)).toBeLessThan(1e-6)
  })

  it('interpolates width and grade', () => {
    const samples = sampleCenterline(
      [
        { x: 0, y: 0, z: 0, width: 6 },
        { x: 0, y: 10, z: -100, width: 8 },
      ],
      { step: 5 },
    )
    const first = samples[0]
    const last = samples[samples.length - 1]
    expect(first.width).toBeCloseTo(6, 3)
    expect(last.width).toBeCloseTo(8, 3)
    const mid = samples[Math.floor(samples.length / 2)]
    expect(mid.grade).toBeCloseTo(0.1, 2)
  })

  it('reports positive curvature for a left turn', () => {
    // -Z 方向へ進み、-X（左）へ曲がる
    const samples = sampleCenterline(
      [
        { x: 0, y: 0, z: 40 },
        { x: 0, y: 0, z: 0 },
        { x: -10, y: 0, z: -30 },
        { x: -40, y: 0, z: -40 },
        { x: -80, y: 0, z: -40 },
      ],
      { step: 2 },
    )
    const turning = samples.slice(10, samples.length - 10)
    const avg = turning.reduce((a, s) => a + s.curvature, 0) / turning.length
    expect(avg).toBeGreaterThan(0)
  })

  it('passes through control points (interpolating spline)', () => {
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 20, y: 2, z: -30 },
      { x: 10, y: 4, z: -70 },
      { x: 50, y: 6, z: -100 },
    ]
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]
      const at0 = catmullRomPoint(p0, pts[i], pts[i + 1], p3, 0)
      const at1 = catmullRomPoint(p0, pts[i], pts[i + 1], p3, 1)
      expect(at0.x).toBeCloseTo(pts[i].x, 6)
      expect(at1.z).toBeCloseTo(pts[i + 1].z, 6)
    }
  })

  it('finds nearest and distance-indexed samples', () => {
    const samples = sampleCenterline(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -100 },
      ],
      { step: 2 },
    )
    expect(sampleIndexAtDistance(samples, 50)).toBe(25)
    expect(sampleIndexAtDistance(samples, 1e9)).toBe(samples.length - 1)
    expect(nearestSampleIndex(samples, { x: 3, y: 0, z: -41 })).toBe(20)
    expect(nearestSampleIndex(samples, { x: 3, y: 0, z: -41 }, 5, 3)).toBe(20) // hint 外でも全探索で見つかる
  })

  it('rejects fewer than 2 points', () => {
    expect(() => sampleCenterline([{ x: 0, y: 0, z: 0 }])).toThrow()
  })
})
