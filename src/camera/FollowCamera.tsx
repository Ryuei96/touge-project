import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { useGameStore, type CameraMode } from '../app/gameStore'
import { runtime } from '../app/runtime'

const OFFSETS: Record<CameraMode, { back: number; up: number; lookUp: number; lookAhead: number; damp: number }> = {
  chase: { back: 6.4, up: 2.3, lookUp: 0.9, lookAhead: 4, damp: 6 },
  far: { back: 12, up: 6, lookUp: 1.2, lookAhead: 6, damp: 4 },
  hood: { back: -2.4, up: 0.75, lookUp: 0.7, lookAhead: 14, damp: 60 },
}

export function FollowCamera() {
  const mode = useGameStore((s) => s.cameraMode)
  const desired = useRef(new Vector3())
  const look = useRef(new Vector3())
  const current = useRef(new Vector3())
  const initialized = useRef(false)
  const flatForward = useRef(new Vector3())
  const pos = useRef(new Vector3())
  const fwd = useRef(new Vector3())
  const quat = useRef(new Quaternion())

  useEffect(() => {
    initialized.current = false
  }, [mode])

  useFrame((state, dt) => {
    const camera = state.camera
    const o = OFFSETS[mode]
    // 物理の補間後に呼ばれるので、runtime の値（1 フレーム前）ではなく描画オブジェクトから直接読む
    const obj = runtime.playerObject
    let p: Vector3 = runtime.position
    let f: Vector3 = runtime.forward
    let q: Quaternion = runtime.quaternion
    if (obj) {
      obj.getWorldPosition(pos.current)
      obj.getWorldQuaternion(quat.current)
      fwd.current.set(0, 0, 1).applyQuaternion(quat.current)
      p = pos.current
      f = fwd.current
      q = quat.current
    }
    flatForward.current.set(f.x, 0, f.z)
    if (flatForward.current.lengthSq() < 1e-6) flatForward.current.set(0, 0, 1)
    flatForward.current.normalize()
    desired.current.copy(p).addScaledVector(flatForward.current, -o.back)
    desired.current.y += o.up
    look.current.copy(p).addScaledVector(flatForward.current, o.lookAhead)
    look.current.y += o.lookUp

    if (!initialized.current) {
      current.current.copy(desired.current)
      initialized.current = true
    } else {
      const k = 1 - Math.exp(-o.damp * Math.min(dt, 0.1))
      current.current.lerp(desired.current, k)
    }
    // 速度で画角を広げ、高速域で微小に揺らす
    const speed = Math.abs(runtime.speedMs)
    const ratio = Math.min(1, speed / 55)
    if ((camera as PerspectiveCamera).isPerspectiveCamera) {
      const pc = camera as PerspectiveCamera
      const targetFov = 60 + ratio * 16
      if (Math.abs(pc.fov - targetFov) > 0.05) {
        pc.fov += (targetFov - pc.fov) * Math.min(1, dt * 4)
        pc.updateProjectionMatrix()
      }
    }
    const shake = ratio > 0.6 ? (ratio - 0.6) * 0.06 : 0
    if (shake > 0) {
      desired.current.x += (Math.random() - 0.5) * shake
      desired.current.y += (Math.random() - 0.5) * shake
      look.current.y += (Math.random() - 0.5) * shake * 0.5
    }
    if (mode === 'hood') {
      camera.position.copy(desired.current)
      camera.quaternion.copy(q)
      // 車体に固定しつつ、前方を見る
      camera.lookAt(look.current)
    } else {
      camera.position.copy(current.current)
      camera.lookAt(look.current)
    }
  })
  return null
}
