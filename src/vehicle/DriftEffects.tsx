/**
 * ドリフト演出: 後輪のタイヤスモーク（スプライトのパーティクル）とスキッドマーク（路面上の帯）。
 * runtime の横滑り量とサイドブレーキを見て、自車の後輪位置から発生させる。
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DynamicDrawUsage, InstancedMesh, Matrix4, NormalBlending, Object3D, Quaternion, Vector3 } from 'three'
import { runtime } from '../app/runtime'
import type { VehicleConfig } from './vehicleConfig'

const MAX_SMOKE = 120
const MAX_SKID_SEGMENTS = 600

function smokeTexture(): CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new CanvasTexture(canvas)
}

interface Particle {
  life: number
  maxLife: number
  pos: Vector3
  vel: Vector3
  size: number
  rot: number
}

function createSkidGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(MAX_SKID_SEGMENTS * 2 * 2 * 3)
  const indices = new Uint32Array(MAX_SKID_SEGMENTS * 2 * 6)
  const posAttr = new BufferAttribute(positions, 3)
  posAttr.setUsage(DynamicDrawUsage)
  const colAttr = new BufferAttribute(new Float32Array(MAX_SKID_SEGMENTS * 2 * 2 * 3), 3)
  colAttr.setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', posAttr)
  geometry.setAttribute('color', colAttr)
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.setDrawRange(0, 0)
  return geometry
}

export function DriftEffects({ config }: { config: VehicleConfig }) {
  const smokeRef = useRef<InstancedMesh>(null)
  const tex = useMemo(() => smokeTexture(), [])
  const particles = useRef<Particle[]>([])
  const dummy = useMemo(() => new Object3D(), [])
  const tmpRef = useRef({ q: new Quaternion(), right: new Vector3(), wheel: new Vector3(), m: new Matrix4() })
  const emitAcc = useRef(0)
  // スキッドマーク: 後輪 2 本 × 連続帯。頂点 2 個/点
  const [skidGeometry] = useState(createSkidGeometry)
  const skidRef = useRef({ head: 0, count: 0, last: [new Vector3(), new Vector3()], lastValid: [false, false] })
  useEffect(() => () => {
    tex.dispose()
    skidGeometry.dispose()
  }, [tex, skidGeometry])

  useFrame(({ camera }, dt) => {
    const tmp = tmpRef.current
    const skid = skidRef.current
    const obj = runtime.playerObject
    const smoke = smokeRef.current
    if (!obj || !smoke) return
    obj.getWorldQuaternion(tmp.q)
    tmp.right.set(1, 0, 0).applyQuaternion(tmp.q)
    const fwd = runtime.forward
    const speed = Math.abs(runtime.speedMs)
    // 横滑り: 速度ベクトルの横成分
    const lateral = Math.abs(runtime.velocity.x * fwd.z - runtime.velocity.z * fwd.x)
    const slip = Math.min(1, lateral / 5) + (runtime.handbrake && speed > 4 ? 0.6 : 0)
    const intensity = runtime.wheelsOnGround >= 2 ? Math.min(1, slip) : 0
    const groundY = -(config.suspensionRestLength + config.wheelRadius) + 0.02

    // --- スモーク発生
    emitAcc.current += dt * intensity * 40
    while (emitAcc.current >= 1 && particles.current.length < MAX_SMOKE) {
      emitAcc.current -= 1
      for (const side of [-1, 1]) {
        tmp.wheel.copy(runtime.position).addScaledVector(tmp.right, side * config.trackHalf).addScaledVector(fwd, -config.wheelbaseHalf)
        tmp.wheel.y += groundY + 0.15
        particles.current.push({
          life: 0,
          maxLife: 0.9 + Math.random() * 0.8,
          pos: tmp.wheel.clone(),
          vel: new Vector3((Math.random() - 0.5) * 1.5 - fwd.x * speed * 0.25, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5 - fwd.z * speed * 0.25),
          size: 0.5 + Math.random() * 0.5,
          rot: Math.random() * Math.PI * 2,
        })
      }
    }
    // --- スモーク更新
    const alive: Particle[] = []
    let i = 0
    for (const p of particles.current) {
      p.life += dt
      if (p.life > p.maxLife) continue
      p.pos.addScaledVector(p.vel, dt)
      p.vel.multiplyScalar(1 - dt * 1.2)
      p.vel.y += dt * 0.4
      const t = p.life / p.maxLife
      const s = p.size + t * 2.2
      dummy.position.copy(p.pos)
      dummy.quaternion.copy(camera.quaternion)
      dummy.rotateZ(p.rot + t)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      smoke.setMatrixAt(i, dummy.matrix)
      smoke.setColorAt(i, new Color().setScalar(1 - t * 0.7))
      alive.push(p)
      i++
    }
    particles.current = alive
    smoke.count = i
    smoke.instanceMatrix.needsUpdate = true
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true

    // --- スキッドマーク
    const marking = intensity > 0.45 && speed > 3
    const pos = skidGeometry.getAttribute('position') as BufferAttribute
    const col = skidGeometry.getAttribute('color') as BufferAttribute
    const index = skidGeometry.getIndex()!
    for (const [wi, side] of [[0, -1], [1, 1]] as const) {
      if (!marking) {
        skid.lastValid[wi] = false
        continue
      }
      tmp.wheel.copy(runtime.position).addScaledVector(tmp.right, side * config.trackHalf).addScaledVector(fwd, -config.wheelbaseHalf)
      tmp.wheel.y += groundY
      const last = skid.last[wi]
      if (skid.lastValid[wi] && last.distanceTo(tmp.wheel) < 0.35) continue
      if (skid.lastValid[wi]) {
        const seg = skid.head
        const base = seg * 4
        const hw = config.wheelWidth * 0.55
        const pts = [
          last.clone().addScaledVector(tmp.right, -hw),
          last.clone().addScaledVector(tmp.right, hw),
          tmp.wheel.clone().addScaledVector(tmp.right, -hw),
          tmp.wheel.clone().addScaledVector(tmp.right, hw),
        ]
        pts.forEach((p, k) => {
          pos.setXYZ(base + k, p.x, p.y, p.z)
          const shade = 0.08 + (1 - intensity) * 0.1
          col.setXYZ(base + k, shade, shade, shade)
        })
        index.setX(seg * 6, base)
        index.setX(seg * 6 + 1, base + 2)
        index.setX(seg * 6 + 2, base + 1)
        index.setX(seg * 6 + 3, base + 1)
        index.setX(seg * 6 + 4, base + 2)
        index.setX(seg * 6 + 5, base + 3)
        skid.head = (skid.head + 1) % MAX_SKID_SEGMENTS
        skid.count = Math.min(MAX_SKID_SEGMENTS, skid.count + 1)
        pos.needsUpdate = true
        col.needsUpdate = true
        index.needsUpdate = true
        skidGeometry.setDrawRange(0, skid.count * 6)
        skidGeometry.computeBoundingSphere()
      }
      last.copy(tmp.wheel)
      skid.lastValid[wi] = true
    }
  })

  return (
    <group>
      <instancedMesh ref={smokeRef} args={[undefined, undefined, MAX_SMOKE]} frustumCulled={false} renderOrder={5}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} blending={NormalBlending} opacity={0.75} color="#e8e6e2" />
      </instancedMesh>
      <mesh geometry={skidGeometry} frustumCulled={false} renderOrder={1} position={[0, 0.015, 0]}>
        <meshBasicMaterial vertexColors transparent opacity={0.85} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  )
}

