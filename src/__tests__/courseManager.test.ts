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
    expect(course.meshes.guardrails.length).toBe(2)
    expect(course.meshes.terrain).toBeDefined()
    expect(course.collision.map((c) => c.label)).toEqual(['road', 'terrain', 'guardrail-0', 'guardrail-1'])
    // マーカー
    expect(course.markers.checkpoints.length).toBeGreaterThanOrEqual(4)
    const ds = course.markers.checkpoints.map((c) => c.distance ?? 0)
    expect([...ds].sort((a, b) => a - b)).toEqual(ds)
    expect(course.markers.goal.distance).toBeCloseTo(course.length, 6)
    expect(course.markers.start.position.y).toBeGreaterThan(course.samples[0].position.y)
    // 景観
    expect(course.scenery.trees.length).toBeGreaterThan(100)
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

  it('throws for unimplemented bim source', async () => {
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
    await expect(manager.load('bim-1')).rejects.toBeInstanceOf(CourseSourceNotImplementedError)
    expect(() => manager.load('nope')).toThrow(/unknown course/)
  })
})
