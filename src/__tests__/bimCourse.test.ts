import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BimImportError, importBimModel, transformMesh } from '../bim/BimModelImporter'
import { parseGlb } from '../bim/GlbReader'
import { createCourseManager } from '../course/CourseManager'
import { bimBridgeCourse } from '../course/courses/bimBridgeCourse'
import { nearestSampleIndex } from '../road/spline'

const loadBinary = async (uri: string) => {
  const buf = readFileSync(`public/${uri}`)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

describe('BimModelImporter', () => {
  it('converts Z-up millimetre models and applies offset / yaw', () => {
    const mesh = { positions: new Float32Array([1000, 2000, 3000]), normals: new Float32Array([0, 0, 1]), indices: new Uint32Array([0, 0, 0]) }
    const out = transformMesh(mesh, { scale: 0.001, upAxis: 'Z', offset: { x: 10, y: 0, z: 0 }, yaw: Math.PI / 2 })
    // Z-up → Y-up: (1, 2, 3) → (1, 3, -2); yaw 90°: (x, z) → (z, -x) = (-2, -1); + offset
    expect(out.positions[0]).toBeCloseTo(8, 5)
    expect(out.positions[1]).toBeCloseTo(3, 5)
    expect(out.positions[2]).toBeCloseTo(-1, 5)
    expect(out.normals[1]).toBeCloseTo(1, 5)
  })

  it('splits the sample model into drivable surface and obstacles', async () => {
    const model = parseGlb(await loadBinary('models/bim-bridge-course.glb'))
    const r = importBimModel(model)
    expect(r.drivableNames.sort()).toEqual(['Deck_Bridge', 'Road_Approach_North', 'Road_Approach_South'])
    expect(r.obstacleNames.some((n) => n.startsWith('Pier_'))).toBe(true)
    expect(r.collision.map((c) => c.label)).toEqual(['bim-drivable', 'bim-obstacles'])
    expect(() => importBimModel(model, { drivablePattern: /^Nothing/ })).toThrow(BimImportError)
  })

  it('builds the BIM course through CourseManager with the road surface under the centerline', async () => {
    const manager = createCourseManager({ loadBinary }).register(bimBridgeCourse)
    const course = await manager.load('bim-bridge')
    expect(course.definition.source).toBe('bim')
    expect(course.length).toBeGreaterThan(400)
    expect(course.collision[0].label).toBe('bim-drivable')
    // 中心線のサンプルが走行路メッシュの近く（鉛直 ±0.6 m）にあること
    const road = course.meshes.road
    for (const s of course.samples.filter((_, i) => i % 20 === 0)) {
      let best = Infinity
      for (let i = 0; i < road.positions.length; i += 3) {
        const dx = road.positions[i] - s.position.x, dz = road.positions[i + 2] - s.position.z
        const d = dx * dx + dz * dz
        if (d < best) best = d
      }
      expect(Math.sqrt(best)).toBeLessThan(5)
    }
    expect(nearestSampleIndex(course.samples, course.markers.start.position)).toBeLessThan(10)
  })
})
