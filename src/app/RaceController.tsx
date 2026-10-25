/**
 * チェックポイント通過・ゴール判定・タイム計測。Canvas 内で useFrame を使う。
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { BuiltCourse } from '../course/types'
import { nearestSampleIndex, sampleIndexAtDistance } from '../road/spline'
import { useGameStore } from './gameStore'
import { runtime } from './runtime'

export function RaceController({ course }: { course: BuiltCourse }) {
  const acc = useRef(0)
  const total = course.markers.checkpoints.length

  useEffect(() => {
    useGameStore.getState().patch({ checkpointTotal: total, courseName: course.definition.name })
    useGameStore.getState().resetRace()
    runtime.respawn = course.markers.start
    runtime.progressIndex = 0
    runtime.resetRequested = true
    return () => {
      runtime.respawn = null
    }
  }, [course, total])

  useFrame((_, dt) => {
    const s = useGameStore.getState()
    if (!s.physicsReady) return
    const p = runtime.position
    const idx = nearestSampleIndex(course.samples, { x: p.x, y: p.y, z: p.z }, runtime.progressIndex)
    runtime.progressIndex = idx
    const progress = course.samples[idx].distance / course.length

    if (!s.started && Math.abs(runtime.speedMs) > 0.5) {
      s.patch({ started: true })
    }
    if (s.started && !s.finished) {
      acc.current += dt
    }

    const targets = [...course.markers.checkpoints, course.markers.goal]
    const next = targets[s.checkpointIndex]
    let patch: Partial<typeof s> | null = null
    if (next && !s.finished) {
      const dx = p.x - next.position.x
      const dz = p.z - next.position.z
      const dy = p.y - next.position.y
      if (dx * dx + dz * dz < next.radius * next.radius && Math.abs(dy) < 6) {
        const isGoal = s.checkpointIndex === targets.length - 1
        if (isGoal) {
          patch = { finished: true, finishTime: acc.current, checkpointIndex: s.checkpointIndex + 1 }
        } else {
          const si = sampleIndexAtDistance(course.samples, next.distance ?? 0)
          const sample = course.samples[si]
          runtime.respawn = {
            position: { x: sample.position.x, y: sample.position.y + 0.6, z: sample.position.z },
            heading: sample.heading,
          }
          patch = { checkpointIndex: s.checkpointIndex + 1 }
        }
      }
    }
    // HUD は 10Hz で更新
    const every = Math.floor(acc.current * 10)
    const prevEvery = Math.floor((acc.current - dt) * 10)
    if (patch || every !== prevEvery || Math.abs(progress - s.progress) > 0.01) {
      s.patch({ ...(patch ?? {}), elapsed: acc.current, progress })
    }
  })
  return null
}
