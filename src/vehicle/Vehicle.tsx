/**
 * 車両の React コンポーネント。
 * Rapier RigidBody + RaycastVehicle（物理）と、簡易ボックス形状の見た目を持つ。
 * 入力はキーボードまたはオートパイロットから受け取る。
 */
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Mesh, Quaternion, Vector3 } from 'three'
import { useGameStore } from '../app/gameStore'
import { runtime } from '../app/runtime'
import type { BuiltCourse } from '../course/types'
import { keyboard, type DriveInput } from '../input/keyboard'
import { gamepad, mergeInputs } from '../input/gamepad'
import { useGarageStore } from '../app/garageStore'
import { audioEngine } from '../audio/AudioEngine'
import { AutopilotDriver } from './autopilot'
import { CarBody } from './CarBody'
import { WheelMesh } from './WheelMesh'
import { getCarPreset, resolveVehicleConfig } from './carCatalog'
import { RaycastVehicle } from './RaycastVehicle'
import { DEFAULT_VEHICLE_CONFIG } from './vehicleConfig'

export function Vehicle({ course }: { course: BuiltCourse }) {
  const carId = useGarageStore((s) => s.carId)
  const tuning = useGarageStore((s) => s.tuning)
  const preset = useMemo(() => getCarPreset(carId), [carId])
  const cfg = useMemo(() => resolveVehicleConfig(DEFAULT_VEHICLE_CONFIG, preset, tuning), [preset, tuning])
  const bodyRef = useRef<RapierRigidBody>(null)
  const visualRef = useRef<Group>(null)
  const wheelRefs = useRef<(Mesh | null)[]>([null, null, null, null])
  const { world } = useRapier()
  const [vehicle, setVehicle] = useState<RaycastVehicle | null>(null)
  const hudTimer = useRef(0)
  const rumbleTimer = useRef(0)
  const tmpForward = useMemo(() => new Vector3(), [])
  const tmpQuat = useMemo(() => new Quaternion(), [])
  const tmpVel = useMemo(() => new Vector3(), [])
  const lastInput = useRef<DriveInput>({ throttle: 0, brake: 0, steer: 0, handbrake: false })
  const driver = useRef(new AutopilotDriver())
  const [braking, setBraking] = useState(false)
  const lastHit = useRef(0)
  const onHit = (force: number) => {
    const now = performance.now()
    if (force < 1500 || now - lastHit.current < 400) return
    lastHit.current = now
    audioEngine.playSfx(force > 6000 ? 'collision' : 'bump')
    gamepad.rumble(Math.min(1, force / 12000), 0.4, 220)
  }

  const start = course.markers.start

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const v = new RaycastVehicle(world, body, cfg)
    // 車種変更時は直前の復帰地点から再開、初回はスタート
    const pose = runtime.respawn ?? start
    v.teleport(pose)
    if (!runtime.respawn) {
      runtime.respawn = start
      runtime.progressIndex = 0
    }
    setVehicle(v)
    runtime.playerObject = visualRef.current
    useGameStore.getState().patch({ physicsReady: true })
    return () => {
      v.dispose()
      setVehicle(null)
      runtime.playerObject = null
      useGameStore.getState().patch({ physicsReady: false })
    }
  }, [world, start, cfg])

  useEffect(() => {
    keyboard.attach(window)
    return () => keyboard.detach()
  }, [])

  useBeforePhysicsStep((w) => {
    if (!vehicle) return
    const state = useGameStore.getState()

    if (keyboard.consume('KeyC')) state.cycleCamera()
    if (keyboard.consume('KeyP')) state.setAutopilot(!state.autopilot)
    if (keyboard.consume('KeyR')) {
      runtime.resetRequested = false
      vehicle.teleport(runtime.respawn ?? start)
      state.patch({ resets: state.resets + 1 })
    } else if (runtime.resetRequested) {
      // 内部要求（コース切替・落下）は復帰回数に数えない
      runtime.resetRequested = false
      vehicle.teleport(runtime.respawn ?? start)
    }

    let input = mergeInputs(keyboard.read(), gamepad.read())
    if (state.autopilot) {
      const r = driver.current.update(course.samples, runtime.position, runtime.forward, runtime.speedMs, runtime.progressIndex, w.timestep, { closed: course.definition.closed })
      input = state.finished ? { throttle: 0, brake: 1, steer: r.input.steer, handbrake: false } : r.input
    }
    if (!state.setupDone) {
      // セットアップ・会話中は停車させる（ブレーキ入力は後退扱いになるので速度を直接ゼロにする）
      input = { throttle: 0, brake: 0, steer: 0, handbrake: true }
      vehicle.chassis.setLinvel({ x: 0, y: vehicle.chassis.linvel().y, z: 0 }, true)
      vehicle.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
    lastInput.current = input
    runtime.throttle = input.throttle
    runtime.handbrake = input.handbrake
    vehicle.update(input, w.timestep)

    // 落下時の自動復帰
    const t = vehicle.chassis.translation()
    if (t.y < course.bounds.minY - 30) runtime.resetRequested = true
  })

  useFrame((_, dt) => {
    const body = bodyRef.current
    const visual = visualRef.current
    if (!body || !visual || !vehicle) return
    // RigidBody の補間済みワールド変換（visual group は RigidBody の子）
    visual.getWorldPosition(runtime.position)
    visual.getWorldQuaternion(tmpQuat)
    runtime.quaternion.copy(tmpQuat)
    tmpForward.set(0, 0, 1).applyQuaternion(tmpQuat)
    runtime.forward.copy(tmpForward)
    const lv = body.linvel()
    tmpVel.set(lv.x, lv.y, lv.z)
    runtime.velocity.copy(tmpVel)
    runtime.speedMs = tmpVel.dot(tmpForward)
    runtime.wheelsOnGround = vehicle.wheelsInContact()

    // サウンド: 横滑り量とサイドブレーキからスキール強度を出す
    const lateral = Math.abs(tmpVel.x * tmpForward.z - tmpVel.z * tmpForward.x)
    const skid = Math.min(1, lateral / 6) + (runtime.handbrake && Math.abs(runtime.speedMs) > 3 ? 0.5 : 0)
    audioEngine.update({ throttle: runtime.throttle, speedMs: Math.abs(runtime.speedMs), maxSpeedMs: cfg.maxSpeed, skid, wheelsOnGround: runtime.wheelsOnGround })
    // 振動: スキール中は弱く連続、エンジン回転に応じた微振動
    rumbleTimer.current += dt
    if (rumbleTimer.current > 0.1) {
      rumbleTimer.current = 0
      if (skid > 0.25) gamepad.rumble(0, Math.min(0.5, skid * 0.5), 120)
      else if (runtime.throttle > 0.5 && Math.abs(runtime.speedMs) < 4) gamepad.rumble(0.12, 0.05, 120)
    }

    // ホイール表示
    const ws = vehicle.wheelStates()
    for (let i = 0; i < 4; i++) {
      const m = wheelRefs.current[i]
      if (!m) continue
      const w = ws[i]
      m.position.set(w.x, w.y, w.z)
      m.rotation.set(0, w.steering, 0)
      m.rotateX(w.rotation)
    }

    hudTimer.current += dt
    if (hudTimer.current > 0.1) {
      hudTimer.current = 0
      const b = lastInput.current.brake > 0 || lastInput.current.handbrake
      if (b !== braking) setBraking(b)
      useGameStore.getState().patch({
        speedKmh: Math.abs(runtime.speedMs) * 3.6,
        gear: vehicle.gear,
        wheelsOnGround: runtime.wheelsOnGround,
      })
    }
  })

  const [hx, hy, hz] = cfg.chassisHalfExtents
  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      canSleep={false}
      position={[start.position.x, start.position.y, start.position.z]}
      rotation={[0, start.heading, 0]}
      linearDamping={0.02}
      angularDamping={cfg.angularDamping}
    >
      <CuboidCollider
        key={carId}
        args={[hx, hy, hz]}
        position={[0, cfg.chassisColliderOffsetY, 0]}
        mass={cfg.massKg}
        friction={0.4}
        restitution={0}
        onContactForce={(e) => onHit(e.totalForceMagnitude)}
      />
      <group ref={visualRef}>
        <CarBody look={preset.look} config={cfg} bodyColor={tuning.bodyColor} wing={tuning.parts.aero === 'wing'} braking={braking} spotlights />
        {/* ホイール */}
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
