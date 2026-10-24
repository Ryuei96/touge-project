import { describe, expect, it } from 'vitest'
import { sampleCenterline } from '../road/spline'
import { createRoadFollowingHeightField, fitPlane, generateTerrainMesh } from '../road/TerrainMeshGenerator'

describe('TerrainMeshGenerator', () => {
  const samples = sampleCenterline(
    [
      { x: 0, y: 10, z: 0 },
      { x: 0, y: 20, z: -100 },
      { x: 30, y: 30, z: -200 },
    ],
    { step: 4, defaultWidth: 7 },
  )

  it('fits a plane to the centerline', () => {
    const flat = sampleCenterline(
      [
        { x: 0, y: 5, z: 0 },
        { x: 10, y: 5, z: -100 },
        { x: -10, y: 5, z: -200 },
      ],
      { step: 10 },
    )
    const p = fitPlane(flat)
    expect(p.a).toBeCloseTo(0, 6)
    expect(p.b).toBeCloseTo(0, 6)
    expect(p.c).toBeCloseTo(5, 6)
  })

  it('follows the road surface inside the shoulder', () => {
    const field = createRoadFollowingHeightField(samples, { shoulder: 1.5, margin: 50 })
    const s = samples[10]
    const h = field.getHeight(s.position.x + s.right.x * 2, s.position.z + s.right.z * 2)
    expect(h).toBeCloseTo(s.position.y - 0.15, 3)
    expect(field.roadInfo(s.position.x, s.position.z).index).toBe(10)
  })

  it('generates a grid mesh covering the bounds with colors', () => {
    const field = createRoadFollowingHeightField(samples, { margin: 40 })
    const mesh = generateTerrainMesh(field, { resolution: 16 })
    expect(mesh.positions.length).toBe(17 * 17 * 3)
    expect(mesh.indices.length).toBe(16 * 16 * 6)
    expect(mesh.colors?.length).toBe(17 * 17 * 3)
    expect(mesh.positions[0]).toBeCloseTo(field.minX, 5)
    expect(mesh.positions[2]).toBeCloseTo(field.minZ, 5)
    for (let i = 0; i < mesh.normals.length; i += 3) expect(mesh.normals[i + 1]).toBeGreaterThan(0)
  })
})
