/**
 * ライバル車。オートパイロットで走り、プレイヤー・他のライバルと物理的に干渉する。
 * グリッド位置はインデックスで決める（前方に 2 列で並ぶ）。
 */
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Mesh, Quaternion, Vector3 } from 'three'
import { useGameStore } from '../app/gameStore'
import { runtime, type RivalRuntime } from '../app/runtime'
import type { BuiltCourse, Pose } from '../course/types'
import type { RivalEntry } from '../race/characters'
import { nearestSampleIndex } from '../road/spline'
import { AutopilotDriver, type AutopilotOptions } from './autopilot'
import { CarBody } from './CarBody'
import { DEFAULT_TUNING, getCarPreset, resolveVehicleConfig } from './carCatalog'
import { RaycastVehicle } from './RaycastVehicle'
import { DEFAULT_VEHICLE_CONFIG } from './vehicleConfig'
import { WheelMesh } from './WheelMesh'

const SKILL: Record<'easy' | 'normal' | 'hard', AutopilotOptions> = {
  easy: { maxSpeed: 21, lateralAccel: 4.5 },
  normal: { maxSpeed: 27, lateralAccel: 5.6 },
  hard: { maxSpeed: 34, lateralAccel: 6.8, lookaheadPerSpeed: 0.5 },
}

export function RivalVehicle({ course, entry, index }: { course: BuiltCourse; entry: RivalEntry; index: number }) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const visualRef = useRef<Group>(null)
  const wheelRefs = useRef<(Mesh | null)[]>([null, null, null, null])
  const { world } = useRapier()
  const [vehicle, setVehicle] = useState<RaycastVehicle | null>(null)
  const preset = useMemo(() => getCarPreset(entry.carId), [entry.carId])
  const cfg = useMemo(() => resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, DEFAULT_TUNING), [preset])
  const tmpQuat = useMemo(() => new Quaternion(), [])
  const tmpVel = useMemo(() => new Vector3(), [])
  const driver = useRef(new AutopilotDriver())
  const stateRef = useRef<RivalRuntime>({ id: entry.id, characterId: entry.characterId, carId: entry.carId, position: new Vector3(), forward: new Vector3(0, 0, 1), speedMs: 0, progressIndex: 0, lapIndex: 0, finished: false, raceDistance: 0 })
  const [braking, setBraking] = useState(false)

  // グリッド: 前方 7 m 刻み・左右交互
  const start = useMemo<Pose>(() => {
    const s = course.markers.start
    const step = course.samples.length > 1 ? course.samples[1].distance - course.samples[0].distance : 2
    const ahead = 7 * (1 + Math.floor(index / 2))
    const side = index % 2 === 0 ? 1.8 : -1.8
    const si = Math.min(course.samples.length - 1, nearestSampleIndex(course.samples, s.position) + Math.round(ahead / step))
    const sample = course.samples[si]
    return { position: { x: sample.position.x + sample.right.x * side, y: sample.position.y + 0.6, z: sample.position.z + sample.right.z * side }, heading: sample.heading }
  }, [course, index])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const state = stateRef.current
    state.id = entry.id
    state.characterId = entry.characterId
    state.carId = entry.carId
    const v = new RaycastVehicle(world, body, cfg)
    v.teleport(start)
    state.progressIndex = 0
    state.lapIndex = 0
    state.finished = false
    state.raceDistance = 0
    runtime.rivals = [...runtime.rivals.filter((r) => r.id !== state.id), state]
    setVehicle(v)
    return () => {
      v.dispose()
      setVehicle(null)
      runtime.rivals = runtime.rivals.filter((r) => r !== state)
    }
  }, [world, start, cfg, entry.id, entry.characterId, entry.carId])

  useBeforePhysicsStep((w) => {
    if (!vehicle || vehicle.isDisposed) return
    const state = stateRef.current
    const st = useGameStore.getState()
    if ((runtime.resetRequested || !st.setupDone) && !st.started) {
      vehicle.teleport(start)
      state.progressIndex = 0
      state.lapIndex = 0
      state.finished = false
      state.raceDistance = 0
      driver.current.reset()
    }
    const t = vehicle.chassis.translation()
    const r = driver.current.update(course.samples, { x: t.x, y: t.y, z: t.z }, state.forward, state.speedMs, state.progressIndex, w.timestep, { ...SKILL[entry.skill], closed: course.definition.closed })
    const canGo = st.started || Math.abs(runtime.speedMs) > 0.5
    const input = state.finished || !canGo ? { throttle: 0, brake: 1, steer: r.input.steer, handbrake: false } : r.input
    vehicle.update(input, w.timestep)
    const b = input.brake > 0.3
    if (b !== braking) setBraking(b)
    if (t.y < course.bounds.minY - 30) {
      const s = course.samples[state.progressIndex]
      vehicle.teleport({ position: { x: s.position.x, y: s.position.y + 0.6, z: s.position.z }, heading: s.heading })
    }
  })

  useFrame(() => {
    const body = bodyRef.current
    const visual = visualRef.current
    if (!body || !visual || !vehicle || vehicle.isDisposed) return
    const state = stateRef.current
    visual.getWorldPosition(state.position)
    visual.getWorldQuaternion(tmpQuat)
    state.forward.set(0, 0, 1).applyQuaternion(tmpQuat)
    const lv = body.linvel()
    tmpVel.set(lv.x, lv.y, lv.z)
    state.speedMs = tmpVel.dot(state.forward)
    const prev = state.progressIndex
    const n = course.samples.length
    const idx = nearestSampleIndex(course.samples, state.position, prev, 40, course.definition.closed)
    if (course.definition.closed && prev > n * 0.8 && idx < n * 0.2) state.lapIndex++
    state.progressIndex = idx
    state.raceDistance = state.lapIndex * course.length + course.samples[idx].distance
    const laps = course.definition.closed ? (course.definition.laps ?? 1) : 1
    if (!state.finished && useGameStore.getState().started && (course.definition.closed ? state.lapIndex >= laps : idx >= n - 3)) {
      state.finished = true
      useGameStore.getState().patch({ rivalFinished: true })
    }
    const ws = vehicle.wheelStates()
    for (let i = 0; i < 4; i++) {
      const m = wheelRefs.current[i]
      if (!m) continue
      m.position.set(ws[i].x, ws[i].y, ws[i].z)
      m.rotation.set(0, ws[i].steering, 0)
      m.rotateX(ws[i].rotation)
    }
  })

  const [hx, hy, hz] = cfg.chassisHalfExtents
  return (
    <RigidBody ref={bodyRef} type="dynamic" colliders={false} canSleep={false} position={[start.position.x, start.position.y, start.position.z]} rotation={[0, start.heading, 0]} angularDamping={cfg.angularDamping}>
      <CuboidCollider args={[hx, hy, hz]} position={[0, cfg.chassisColliderOffsetY, 0]} mass={cfg.massKg} friction={0.4} restitution={0} />
      <group ref={visualRef}>
        <CarBody look={preset.look} config={cfg} braking={braking} wing={entry.skill === 'hard'} />
        {[0, 1, 2, 3].map((i) => (
          <WheelMesh
            key={i}
            ref={(m) => {
              wheelRefs.current[i] = m
            }}
            radius={cfg.wheelRadius}
            width={cfg.wheelWidth}
            rimColor={preset.look.wheel}
          />
        ))}
      </group>
    </RigidBody>
  )
}
