/**
 * チェックポイント通過・周回・ゴール判定・タイム計測・順位・掛け合いのトリガー。Canvas 内で useFrame を使う。
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { BuiltCourse } from '../course/types'
import { pickDialogue, type DialogueEvent } from '../race/dialogue'
import { nearestSampleIndex, sampleIndexAtDistance } from '../road/spline'
import { useGameStore } from './gameStore'
import { runtime } from './runtime'

export function RaceController({ course }: { course: BuiltCourse }) {
  const acc = useRef(0)
  const fired = useRef(new Set<string>())
  const lastRank = useRef(1)
  const lastResets = useRef(0)
  const hairpinCooldown = useRef(0)
  const total = course.markers.checkpoints.length
  const closed = course.definition.closed ?? false
  const lapTotal = closed ? (course.definition.laps ?? 1) : 1

  useEffect(() => {
    useGameStore.getState().patch({ checkpointTotal: total, courseName: course.definition.name, lapTotal })
    useGameStore.getState().resetRace()
    runtime.respawn = course.markers.start
    runtime.progressIndex = 0
    runtime.lapIndex = 0
    runtime.resetRequested = true
    acc.current = 0
    fired.current.clear()
    lastRank.current = 1
    return () => {
      runtime.respawn = null
    }
  }, [course, total, lapTotal])

  const say = (event: DialogueEvent, once = true) => {
    const key = once ? event : `${event}-${Math.floor(acc.current)}`
    if (fired.current.has(key)) return
    fired.current.add(key)
    const s = useGameStore.getState()
    if (s.dialogue) return // 進行中の会話は邪魔しない
    s.showDialogue(pickDialogue(event, course.definition.id.length + fired.current.size))
  }

  useFrame((_, dt) => {
    const s = useGameStore.getState()
    if (!s.physicsReady || !s.setupDone) return
    const p = runtime.position
    const n = course.samples.length
    const prevIdx = runtime.progressIndex
    const idx = nearestSampleIndex(course.samples, { x: p.x, y: p.y, z: p.z }, prevIdx, 40, closed)
    runtime.progressIndex = idx
    const withinLap = course.samples[idx].distance / course.length
    const progress = closed ? Math.min(1, (runtime.lapIndex + withinLap) / lapTotal) : withinLap

    if (!s.started && Math.abs(runtime.speedMs) > 0.5) {
      s.patch({ started: true })
      if (s.rivalEnabled) say('race-start')
    }
    if (s.started && !s.finished) acc.current += dt
    if (!s.started) {
      acc.current = 0
      fired.current.clear()
    }

    let patch: Partial<typeof s> | null = null
    const targets = [...course.markers.checkpoints, course.markers.goal]
    const next = targets[s.checkpointIndex]
    if (next && !s.finished && s.started) {
      const dx = p.x - next.position.x
      const dz = p.z - next.position.z
      const dy = p.y - next.position.y
      if (dx * dx + dz * dz < next.radius * next.radius && Math.abs(dy) < 6) {
        const isGoal = s.checkpointIndex === targets.length - 1
        if (isGoal) {
          if (closed && runtime.lapIndex + 1 < lapTotal) {
            runtime.lapIndex++
            patch = { checkpointIndex: 0, lap: runtime.lapIndex + 1 }
            runtime.respawn = course.markers.start
          } else {
            const rivalAhead = runtime.rival?.finished ?? false
            patch = { finished: true, finishTime: acc.current, checkpointIndex: s.checkpointIndex + 1 }
            say(s.rivalEnabled ? (rivalAhead ? 'finish-lose' : 'finish-win') : 'finish-solo')
          }
        } else {
          const si = sampleIndexAtDistance(course.samples, next.distance ?? 0)
          const sample = course.samples[si]
          runtime.respawn = { position: { x: sample.position.x, y: sample.position.y + 0.6, z: sample.position.z }, heading: sample.heading }
          patch = { checkpointIndex: s.checkpointIndex + 1 }
          if ((s.checkpointIndex + fired.current.size) % 2 === 0) say(`checkpoint`, false)
        }
      }
    }

    // 順位
    if (runtime.rival && s.started && !s.finished) {
      const mine = runtime.lapIndex * course.length + course.samples[idx].distance
      const rank = runtime.rival.finished || runtime.rival.raceDistance > mine + 2 ? 2 : 1
      if (rank !== lastRank.current) {
        if (acc.current > 3) say(rank === 1 ? 'overtake' : 'overtaken', false)
        lastRank.current = rank
        patch = { ...(patch ?? {}), rank }
      }
    }

    // 区間イベント
    if (s.started && !s.finished) {
      hairpinCooldown.current = Math.max(0, hairpinCooldown.current - dt)
      const ahead = course.samples[Math.min(n - 1, idx + 20)]
      if (Math.abs(ahead.curvature) > 1 / 28 && hairpinCooldown.current === 0) {
        hairpinCooldown.current = 25
        say('hairpin', false)
      }
      if (withinLap > 0.12 && withinLap < 0.2) say('first-corner')
      if (progress > 0.85) say('last-section')
      if (s.resets !== lastResets.current) {
        lastResets.current = s.resets
        say('crash', false)
      }
    }

    const every = Math.floor(acc.current * 10)
    const prevEvery = Math.floor((acc.current - dt) * 10)
    if (patch || every !== prevEvery || Math.abs(progress - s.progress) > 0.01) {
      s.patch({ ...(patch ?? {}), elapsed: acc.current, progress })
    }
  })
  return null
}
