/**
 * ライバル車。オートパイロットで走り、プレイヤーと物理的に干渉する。
 */
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Mesh, Quaternion, Vector3 } from 'three'
import { useGameStore } from '../app/gameStore'
import { runtime, type RivalRuntime } from '../app/runtime'
import type { BuiltCourse, Pose } from '../course/types'
import { nearestSampleIndex } from '../road/spline'
import { AutopilotDriver, type AutopilotOptions } from './autopilot'
import { CarBody } from './CarBody'
import { getCarPreset, resolveVehicleConfig, DEFAULT_TUNING } from './carCatalog'
import { RaycastVehicle } from './RaycastVehicle'
import { DEFAULT_VEHICLE_CONFIG } from './vehicleConfig'

const SKILL: Record<'easy' | 'normal' | 'hard', AutopilotOptions> = {
  easy: { maxSpeed: 21, lateralAccel: 4.5 },
  normal: { maxSpeed: 27, lateralAccel: 5.6 },
  hard: { maxSpeed: 34, lateralAccel: 6.8, lookaheadPerSpeed: 0.5 },
}

export function RivalVehicle({ course, carId = 'black-gt' }: { course: BuiltCourse; carId?: string }) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const visualRef = useRef<Group>(null)
  const wheelRefs = useRef<(Mesh | null)[]>([null, null, null, null])
  const { world } = useRapier()
  const [vehicle, setVehicle] = useState<RaycastVehicle | null>(null)
  const preset = useMemo(() => getCarPreset(carId), [carId])
  const cfg = useMemo(() => resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, DEFAULT_TUNING), [preset])
  const skill = useGameStore((s) => s.rivalSkill)
  const tmpQuat = useMemo(() => new Quaternion(), [])
  const driver = useRef(new AutopilotDriver())
  const tmpVel = useMemo(() => new Vector3(), [])
  const stateRef = useRef<RivalRuntime>({ position: new Vector3(), forward: new Vector3(0, 0, 1), speedMs: 0, progressIndex: 0, lapIndex: 0, finished: false, raceDistance: 0 })

  // スタート位置: プレイヤーの少し前、道路の右寄り
  const start = useMemo<Pose>(() => {
    const s = course.markers.start
    const sample = course.samples[Math.min(course.samples.length - 1, nearestSampleIndex(course.samples, s.position) + 4)]
    return { position: { x: sample.position.x + sample.right.x * 1.8, y: sample.position.y + 0.6, z: sample.position.z + sample.right.z * 1.8 }, heading: sample.heading }
  }, [course])

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const state = stateRef.current
    const v = new RaycastVehicle(world, body, cfg)
    v.teleport(start)
    state.progressIndex = 0
    state.lapIndex = 0
    state.finished = false
    runtime.rival = state
    setVehicle(v)
    return () => {
      v.dispose()
      setVehicle(null)
      runtime.rival = null
    }
  }, [world, start, cfg])

  useBeforePhysicsStep((w) => {
    if (!vehicle) return
    const state = stateRef.current
    const st = useGameStore.getState()
    if (runtime.resetRequested || !st.setupDone) {
      // プレイヤーの復帰・セットアップ中はスタートに戻す
      if (!st.started) {
        vehicle.teleport(start)
        state.progressIndex = 0
        state.lapIndex = 0
        state.finished = false
      }
    }
    const t = vehicle.chassis.translation()
    const r = driver.current.update(course.samples, { x: t.x, y: t.y, z: t.z }, state.forward, state.speedMs, state.progressIndex, w.timestep, { ...SKILL[skill], closed: course.definition.closed })
    const canGo = st.started || Math.abs(runtime.speedMs) > 0.5
    const input = state.finished || !canGo ? { throttle: 0, brake: 1, steer: r.input.steer, handbrake: false } : r.input
    vehicle.update(input, w.timestep)
    // 落下時はコース上に戻す
    if (t.y < course.bounds.minY - 30) {
      const s = course.samples[state.progressIndex]
      vehicle.teleport({ position: { x: s.position.x, y: s.position.y + 0.6, z: s.position.z }, heading: s.heading })
    }
  })

  useFrame(() => {
    const body = bodyRef.current
    const visual = visualRef.current
    if (!body || !visual || !vehicle) return
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
    if (!state.finished && (course.definition.closed ? state.lapIndex >= laps : idx >= n - 3)) {
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
        <CarBody look={preset.look} config={cfg} />
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            ref={(m) => {
              wheelRefs.current[i] = m
            }}
          >
            <cylinderGeometry args={[cfg.wheelRadius, cfg.wheelRadius, cfg.wheelWidth, 18]} onUpdate={(g) => g.rotateZ(Math.PI / 2)} />
            <meshStandardMaterial color={preset.look.wheel} roughness={0.9} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  )
}
