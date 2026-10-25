import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'
import { useGameStore, type CameraMode } from '../app/gameStore'
import { runtime } from '../app/runtime'

const OFFSETS: Record<CameraMode, { back: number; up: number; lookUp: number; lookAhead: number; damp: number }> = {
  chase: { back: 7.5, up: 2.8, lookUp: 1.0, lookAhead: 3, damp: 5 },
  far: { back: 14, up: 7, lookUp: 1.2, lookAhead: 6, damp: 4 },
  hood: { back: -2.4, up: 0.75, lookUp: 0.7, lookAhead: 14, damp: 60 },
}

export function FollowCamera() {
  const camera = useThree((s) => s.camera)
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

  useFrame((_, dt) => {
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
