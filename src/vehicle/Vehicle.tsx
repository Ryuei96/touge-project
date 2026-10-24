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
import { computeAutopilot } from './autopilot'
import { RaycastVehicle } from './RaycastVehicle'
import { DEFAULT_VEHICLE_CONFIG } from './vehicleConfig'

const cfg = DEFAULT_VEHICLE_CONFIG

export function Vehicle({ course }: { course: BuiltCourse }) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const visualRef = useRef<Group>(null)
  const wheelRefs = useRef<(Mesh | null)[]>([null, null, null, null])
  const { world } = useRapier()
  const [vehicle, setVehicle] = useState<RaycastVehicle | null>(null)
  const hudTimer = useRef(0)
  const tmpForward = useMemo(() => new Vector3(), [])
  const tmpQuat = useMemo(() => new Quaternion(), [])
  const tmpVel = useMemo(() => new Vector3(), [])
  const lastInput = useRef<DriveInput>({ throttle: 0, brake: 0, steer: 0, handbrake: false })

  const start = course.markers.start

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const v = new RaycastVehicle(world, body, cfg)
    v.teleport(start)
    runtime.respawn = start
    runtime.progressIndex = 0
    setVehicle(v)
    useGameStore.getState().patch({ physicsReady: true })
    return () => {
      v.dispose()
      setVehicle(null)
      useGameStore.getState().patch({ physicsReady: false })
    }
  }, [world, start])

  useEffect(() => {
    keyboard.attach(window)
    return () => keyboard.detach()
  }, [])

  useBeforePhysicsStep((w) => {
    if (!vehicle) return
    const state = useGameStore.getState()

    if (keyboard.consume('KeyC')) state.cycleCamera()
    if (keyboard.consume('KeyP')) state.setAutopilot(!state.autopilot)
    if (keyboard.consume('KeyR') || runtime.resetRequested) {
      runtime.resetRequested = false
      vehicle.teleport(runtime.respawn ?? start)
      state.patch({ resets: state.resets + 1 })
    }

    let input = keyboard.read()
    if (state.autopilot) {
      const r = computeAutopilot(course.samples, runtime.position, runtime.forward, runtime.speedMs, runtime.progressIndex)
      input = r.input
    }
    lastInput.current = input
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
      <CuboidCollider args={[hx, hy, hz]} position={[0, cfg.chassisColliderOffsetY, 0]} mass={cfg.massKg} friction={0.4} restitution={0} />
      <group ref={visualRef}>
        {/* ボディ */}
        <mesh position={[0, 0.05, 0]} castShadow>
          <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
          <meshStandardMaterial color="#d8362f" roughness={0.35} metalness={0.3} />
        </mesh>
        {/* キャビン */}
        <mesh position={[0, hy + 0.3, -0.25]} castShadow>
          <boxGeometry args={[hx * 1.6, 0.55, 1.9]} />
          <meshStandardMaterial color="#2b2f36" roughness={0.2} metalness={0.4} />
        </mesh>
        {/* ヘッドライト */}
        <mesh position={[-hx * 0.65, 0.1, hz]}>
          <boxGeometry args={[0.3, 0.14, 0.06]} />
          <meshStandardMaterial color="#fff8d0" emissive="#fff2a8" emissiveIntensity={1.5} />
        </mesh>
        <mesh position={[hx * 0.65, 0.1, hz]}>
          <boxGeometry args={[0.3, 0.14, 0.06]} />
          <meshStandardMaterial color="#fff8d0" emissive="#fff2a8" emissiveIntensity={1.5} />
        </mesh>
        {/* テールランプ */}
        <mesh position={[0, 0.1, -hz]}>
          <boxGeometry args={[hx * 1.6, 0.12, 0.06]} />
          <meshStandardMaterial color="#5a0000" emissive="#ff2020" emissiveIntensity={0.8} />
        </mesh>
        {/* ホイール */}
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            ref={(m) => {
              wheelRefs.current[i] = m
            }}
            castShadow
          >
            <cylinderGeometry args={[cfg.wheelRadius, cfg.wheelRadius, cfg.wheelWidth, 18]} onUpdate={(g) => g.rotateZ(Math.PI / 2)} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  )
}
