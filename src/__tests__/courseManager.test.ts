import { describe, expect, it } from 'vitest'
import { LOCAL_ORIGIN } from '../course/buildCourse'
import { CourseSourceNotImplementedError, createCourseManager } from '../course/CourseManager'
import { touge01 } from '../course/courses/touge01'
import type { CourseDefinition } from '../course/types'
import { minSelfSeparation } from '../road/spline'

describe('CourseManager', () => {
  it('lists registered courses and builds the procedural touge course', async () => {
    const manager = createCourseManager().register(touge01)
    expect(manager.list()).toEqual([{ id: 'touge01', name: touge01.name, source: 'procedural', fictional: true }])
    const course = await manager.load('touge01')
    expect(course.length).toBeGreaterThan(1400)
    expect(course.samples.length).toBe(Math.floor(course.length / 2) + 1)
    // ガードレールは谷側の区間だけ（両側連続ではない）
    expect(course.meshes.guardrails.length).toBeGreaterThan(0)
    const railed = course.guardrailMask.left.filter(Boolean).length + course.guardrailMask.right.filter(Boolean).length
    expect(railed).toBeGreaterThan(0)
    expect(railed).toBeLessThan(course.samples.length * 2 * 0.8)
    expect(course.meshes.shoulders.length).toBe(2)
    expect(course.meshes.terrain).toBeDefined()
    const labels = course.collision.map((c) => c.label)
    expect(labels.slice(0, 2)).toEqual(['road', 'terrain'])
    expect(labels.filter((l) => l.startsWith('guardrail-')).length).toBe(course.meshes.guardrails.length)
    // マーカー
    expect(course.markers.checkpoints.length).toBeGreaterThanOrEqual(4)
    const ds = course.markers.checkpoints.map((c) => c.distance ?? 0)
    expect([...ds].sort((a, b) => a - b)).toEqual(ds)
    expect(course.markers.goal.distance).toBeCloseTo(course.length, 6)
    expect(course.markers.start.position.y).toBeGreaterThan(course.samples[0].position.y)
    // 景観
    expect(course.scenery.trees.length).toBeGreaterThan(100)
    expect(course.scenery.trees.some((t) => t.species === 'broadleaf')).toBe(true)
    expect(course.scenery.rocks.length).toBeGreaterThan(10)
    expect(course.scenery.delineators.length).toBeGreaterThan(10)
    expect(course.scenery.signs.some((sg) => sg.kind.startsWith('chevron'))).toBe(true)
    expect(course.scenery.signs.some((sg) => sg.kind === 'speed-40')).toBe(true)
    // 同一 Promise をキャッシュ
    expect(manager.load('touge01')).toBe(manager.load('touge01'))
  })

  it('keeps grades inside a drivable range', async () => {
    const course = await createCourseManager().register(touge01).load('touge01')
    const maxGrade = Math.max(...course.samples.map((s) => Math.abs(s.grade)))
    expect(maxGrade).toBeLessThan(0.2)
    const minRadius = 1 / Math.max(...course.samples.map((s) => Math.abs(s.curvature)))
    expect(minRadius).toBeGreaterThan(8)
  })

  it('does not cross or nearly touch itself in plan view', async () => {
    const course = await createCourseManager().register(touge01).load('touge01')
    const sep = minSelfSeparation(course.samples, 80)
    expect(sep.distance).toBeGreaterThan(40)
  })

  it('rejects a bim course without a model reference', async () => {
    const bim: CourseDefinition = {
      id: 'bim-1',
      name: 'bim',
      source: 'bim',
      origin: LOCAL_ORIGIN,
      attribution: { source: 'x', license: 'x', fictional: true },
      centerline: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -10 },
      ],
      defaultWidth: 6,
      elevation: { mode: 'embedded' },
      assets: [],
    }
    const manager = createCourseManager().register(bim)
    await expect(manager.load('bim-1')).rejects.toThrow(/requires "model"/)
    expect(() => manager.load('nope')).toThrow(/unknown course/)
    expect(new CourseSourceNotImplementedError('bim').message).toMatch(/bim/)
  })
})
