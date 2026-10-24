import { describe, expect, it } from 'vitest'
import { buildCourseCollision, buildTrimeshCollision, countTriangles } from '../road/CollisionBuilder'
import { generateGuardrailMesh, generateRoadMesh, meshBounds } from '../road/RoadMeshGenerator'
import { sampleCenterline } from '../road/spline'

const straight = () =>
  sampleCenterline(
    [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -100 },
    ],
    { step: 10, defaultWidth: 8 },
  )

describe('generateRoadMesh', () => {
  it('creates two vertices per sample and two triangles per segment', () => {
    const samples = straight()
    const mesh = generateRoadMesh(samples)
    expect(mesh.positions.length).toBe(samples.length * 2 * 3)
    expect(mesh.indices.length).toBe((samples.length - 1) * 6)
    const b = meshBounds(mesh)
    expect(b.min[0]).toBeCloseTo(-4, 5)
    expect(b.max[0]).toBeCloseTo(4, 5)
    expect(b.min[2]).toBeCloseTo(-100, 5)
    expect(b.max[2]).toBeCloseTo(0, 5)
  })

  it('has upward-facing triangles', () => {
    const mesh = generateRoadMesh(straight())
    const p = mesh.positions
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]]
      const ax = p[a * 3], az = p[a * 3 + 2]
      const bx = p[b * 3], bz = p[b * 3 + 2]
      const cx = p[c * 3], cz = p[c * 3 + 2]
      const ux = bx - ax, uz = bz - az
      const vx = cx - ax, vz = cz - az
      const ny = uz * vx - ux * vz
      expect(ny).toBeGreaterThan(0)
    }
  })
})

describe('generateGuardrailMesh', () => {
  it('places the right rail outside the right edge', () => {
    const mesh = generateGuardrailMesh(straight(), 1, { offset: 0.5, height: 1 })
    const b = meshBounds(mesh)
    expect(b.min[0]).toBeCloseTo(4.5, 5)
    expect(b.max[1]).toBeCloseTo(1, 5)
  })
})

describe('CollisionBuilder', () => {
  it('wraps meshes into trimesh shapes', () => {
    const samples = straight()
    const road = generateRoadMesh(samples)
    const shapes = buildCourseCollision({ road, guardrails: [generateGuardrailMesh(samples, -1), generateGuardrailMesh(samples, 1)] })
    expect(shapes.map((s) => s.label)).toEqual(['road', 'guardrail-0', 'guardrail-1'])
    expect(countTriangles(shapes)).toBe((samples.length - 1) * 2 * 3)
  })

  it('rejects out-of-range indices', () => {
    const bad = { positions: new Float32Array(9), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 5]) }
    expect(() => buildTrimeshCollision(bad, 'bad')).toThrow(/out of range/)
  })
})
