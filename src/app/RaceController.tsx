/**
 * チェックポイント通過・周回・ゴール判定・タイム計測・順位・掛け合いのトリガー。Canvas 内で useFrame を使う。
 * 掛け合いはキャラクターの口調（personality）別テンプレートから生成する。
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { audioEngine } from '../audio/AudioEngine'
import type { BuiltCourse } from '../course/types'
import { banterLine, getCharacter, type BanterEvent, type Character } from '../race/characters'
import { getCarPreset } from '../vehicle/carCatalog'
import { nearestSampleIndex, sampleIndexAtDistance } from '../road/spline'
import { useGameStore, type DialogueLine } from './gameStore'
import { useGarageStore } from './garageStore'
import { runtime } from './runtime'

interface RivalMemory {
  ahead: boolean | null
  lastClose: number
  lastPass: number
}

export function RaceController({ course }: { course: BuiltCourse }) {
  const acc = useRef(0)
  const fired = useRef(new Set<string>())
  const lastResets = useRef(0)
  const hairpinCooldown = useRef(0)
  const lastTalk = useRef(0)
  const memory = useRef(new Map<string, RivalMemory>())
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
    memory.current.clear()
    return () => {
      runtime.respawn = null
    }
  }, [course, total, lapTotal])

  /** 台詞を組み立てて表示。話者はキャラクター ID */
  const speak = (lines: DialogueLine[], minGap = 2.5) => {
    const s = useGameStore.getState()
    if (lines.length === 0 || s.dialogue) return false
    if (acc.current - lastTalk.current < minGap && lastTalk.current > 0) return false
    lastTalk.current = acc.current
    s.showDialogue(lines)
    return true
  }

  const names = () => {
    const g = useGarageStore.getState()
    const player = getCharacter(g.characters, g.playerCharacterId)
    const nav = getCharacter(g.characters, g.navigatorCharacterId)
    return { g, player, nav }
  }

  const rivalLine = (ch: Character, event: BanterEvent, other: string, seed: number, carId?: string): DialogueLine | null => {
    const { player } = names()
    const text = banterLine(ch.personality, event, { player: player.name, rival: ch.name, rivalCar: carId ? getCarPreset(carId).name : undefined, other }, seed)
    return text ? { speaker: ch.id, text } : null
  }

  const navLine = (event: BanterEvent, other: string, seed: number): DialogueLine | null => {
    const { player, nav } = names()
    if (nav.id === player.id) return null
    const text = banterLine(nav.personality, event, { player: player.name, rival: nav.name, other }, seed)
    return text ? { speaker: nav.id, text } : null
  }

  const once = (key: string): boolean => {
    if (fired.current.has(key)) return false
    fired.current.add(key)
    return true
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
    const { g, player, nav } = names()
    const rivals = runtime.rivals
    const seedBase = course.definition.id.length + fired.current.size

    if (!s.started && Math.abs(runtime.speedMs) > 0.5) {
      s.patch({ started: true })
      audioEngine.playSfx('start')
      const lines: DialogueLine[] = []
      const nl = navLine('race-start', '', seedBase)
      if (nl) lines.push(nl)
      const first = rivals[0]
      if (first) {
        const l = rivalLine(getCharacter(g.characters, first.characterId), 'race-start', player.name, seedBase, first.carId)
        if (l) lines.push(l)
      }
      speak(lines, 0)
    }
    if (s.started && !s.finished) acc.current += dt
    if (!s.started) {
      acc.current = 0
      fired.current.clear()
      memory.current.clear()
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
            audioEngine.playSfx('checkpoint')
            patch = { checkpointIndex: 0, lap: runtime.lapIndex + 1 }
            runtime.respawn = course.markers.start
          } else {
            const mine = runtime.lapIndex * course.length + course.samples[idx].distance
            const aheadCount = rivals.filter((r) => r.finished || r.raceDistance > mine).length
            const rank = 1 + aheadCount
            patch = { finished: true, finishTime: acc.current, checkpointIndex: s.checkpointIndex + 1, rank }
            audioEngine.playSfx('finish')
            const won = rank === 1
            const lines: DialogueLine[] = []
            const nl = navLine(won ? 'finish-win' : 'finish-lose', '', seedBase)
            if (nl) lines.push(nl)
            speak(lines, 0)
          }
        } else {
          const si = sampleIndexAtDistance(course.samples, next.distance ?? 0)
          const sample = course.samples[si]
          runtime.respawn = { position: { x: sample.position.x, y: sample.position.y + 0.6, z: sample.position.z }, heading: sample.heading }
          patch = { checkpointIndex: s.checkpointIndex + 1 }
          audioEngine.playSfx('checkpoint')
          if (s.checkpointIndex % 2 === 0) {
            const nl = navLine('checkpoint', '', s.checkpointIndex)
            if (nl) speak([nl])
          }
        }
      }
    }

    // 順位と、ライバルごとの接近・追い抜きの掛け合い
    if (s.started && !s.finished) {
      const mine = runtime.lapIndex * course.length + course.samples[idx].distance
      let aheadCount = 0
      for (const r of rivals) {
        const ahead = r.finished || r.raceDistance > mine + 1.5
        if (ahead) aheadCount++
        const ch = getCharacter(g.characters, r.characterId)
        let mem = memory.current.get(r.id)
        if (!mem) {
          mem = { ahead, lastClose: -99, lastPass: -99 }
          memory.current.set(r.id, mem)
        }
        const gap = r.raceDistance - mine
        if (acc.current > 3 && mem.ahead !== null && mem.ahead !== ahead && acc.current - mem.lastPass > 4) {
          mem.lastPass = acc.current
          // ahead=false になった = プレイヤーが抜いた
          const event: BanterEvent = ahead ? 'overtake' : 'overtaken'
          const line = rivalLine(ch, event, player.name, seedBase, r.carId)
          const navl = navLine(ahead ? 'overtaken' : 'overtake', ch.name, seedBase)
          speak([line, navl].filter((l): l is DialogueLine => !!l), 1)
        }
        mem.ahead = ahead
        if (Math.abs(gap) < 14 && acc.current - mem.lastClose > 18 && acc.current > 4) {
          mem.lastClose = acc.current
          const event: BanterEvent = gap > 0 ? 'close-ahead' : 'close-behind'
          const line = rivalLine(ch, event, player.name, seedBase + 1, r.carId)
          const navl = Math.random() < 0.5 ? navLine(event, ch.name, seedBase) : null
          speak([line, navl].filter((l): l is DialogueLine => !!l))
        }
      }
      const rank = 1 + aheadCount
      const rankTotal = rivals.length + 1
      if (rank !== s.rank || rankTotal !== s.rankTotal) patch = { ...(patch ?? {}), rank, rankTotal }

      // 区間イベント
      hairpinCooldown.current = Math.max(0, hairpinCooldown.current - dt)
      const ahead = course.samples[Math.min(n - 1, idx + 20)]
      if (Math.abs(ahead.curvature) > 1 / 28 && hairpinCooldown.current === 0) {
        hairpinCooldown.current = 25
        const near = rivals.find((r) => Math.abs(r.raceDistance - mine) < 25)
        const line = near ? rivalLine(getCharacter(g.characters, near.characterId), 'hairpin', player.name, seedBase, near.carId) : navLine('hairpin', '', seedBase)
        if (line) speak([line])
      }
      if (progress > 0.85 && once('last-section')) {
        const line = navLine('last-section', '', seedBase) ?? (rivals[0] ? rivalLine(getCharacter(g.characters, rivals[0].characterId), 'last-section', player.name, seedBase) : null)
        if (line) speak([line])
      }
      if (s.resets !== lastResets.current) {
        lastResets.current = s.resets
        const line = navLine('crash', '', s.resets) ?? (rivals[0] ? rivalLine(getCharacter(g.characters, rivals[0].characterId), 'crash', player.name, s.resets) : null)
        if (line) speak([line], 0)
      }
    }
    void nav

    const every = Math.floor(acc.current * 10)
    const prevEvery = Math.floor((acc.current - dt) * 10)
    if (patch || every !== prevEvery || Math.abs(progress - s.progress) > 0.01) {
      s.patch({ ...(patch ?? {}), elapsed: acc.current, progress })
    }
  })
  return null
}
