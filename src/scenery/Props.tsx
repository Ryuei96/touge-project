/**
 * 景観の小物をインスタンス描画する。樹木（針葉樹 / 広葉樹、個体ごとの色）・岩・藪・
 * 視線誘導標・電柱と電線・標識（警戒 / 規制 / シェブロン）。
 */
import { useEffect, useMemo } from 'react'
import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Matrix4, Object3D } from 'three'
import type { BuiltCourse, SceneryInstance, SignKind, TreeInstance } from '../course/types'
import { createSignTexture } from '../course/textures'

interface Part {
  geometry: BufferGeometry
  color: (tint: number) => Color
  /** インスタンスのローカル変換（スケール・高さ） */
  offsetY: number
  scaleMul?: [number, number, number]
  roughness?: number
}

function useInstanced(items: SceneryInstance[], parts: Part[]) {
  return useMemo(() => {
    const dummy = new Object3D()
    return parts.map((part) => {
      const matrices: Matrix4[] = []
      const colors: Color[] = []
      for (const it of items) {
        const m = part.scaleMul ?? [1, 1, 1]
        dummy.position.set(it.position.x, it.position.y + part.offsetY * it.scale, it.position.z)
        dummy.rotation.set(0, it.rotationY, 0)
        dummy.scale.set(it.scale * m[0], it.scale * m[1], it.scale * m[2])
        dummy.updateMatrix()
        matrices.push(dummy.matrix.clone())
        colors.push(part.color(it.tint ?? 0.5))
      }
      return { part, matrices, colors }
    })
  }, [items, parts])
}

function Instanced({ items, parts, castShadow = true }: { items: SceneryInstance[]; parts: Part[]; castShadow?: boolean }) {
  const data = useInstanced(items, parts)
  if (items.length === 0) return null
  return (
    <group>
      {data.map(({ part, matrices, colors }, i) => (
        <instancedMesh
          key={i}
          args={[undefined, undefined, items.length]}
          geometry={part.geometry}
          frustumCulled={false}
          castShadow={castShadow}
          receiveShadow
          ref={(m: InstancedMesh | null) => {
            if (!m) return
            matrices.forEach((mat, k) => m.setMatrixAt(k, mat))
            colors.forEach((c, k) => m.setColorAt(k, c))
            m.instanceMatrix.needsUpdate = true
            if (m.instanceColor) m.instanceColor.needsUpdate = true
          }}
        >
          <meshStandardMaterial roughness={part.roughness ?? 0.95} metalness={0} />
        </instancedMesh>
      ))}
    </group>
  )
}

const lerpColor = (a: string, b: string, t: number) => new Color(a).lerp(new Color(b), t)

const CONIFER_PARTS: Part[] = [
  { geometry: new CylinderGeometry(0.18, 0.32, 3.0, 7), color: (t) => lerpColor('#4a3626', '#5e4634', t), offsetY: 1.3 },
  { geometry: new ConeGeometry(2.3, 4.8, 8), color: (t) => lerpColor('#1f4d2a', '#2f6b35', t), offsetY: 4.3 },
  { geometry: new ConeGeometry(1.7, 4.2, 8), color: (t) => lerpColor('#245a31', '#39773f', t), offsetY: 6.6 },
  { geometry: new ConeGeometry(1.0, 3.2, 8), color: (t) => lerpColor('#2b6538', '#4a8a48', t), offsetY: 8.8 },
]
const BROADLEAF_PARTS: Part[] = [
  { geometry: new CylinderGeometry(0.22, 0.36, 3.6, 7), color: (t) => lerpColor('#5a4332', '#6f5542', t), offsetY: 1.6 },
  { geometry: new IcosahedronGeometry(2.6, 1), color: (t) => lerpColor('#3b6b2a', '#5e8c34', t), offsetY: 4.6 },
  { geometry: new IcosahedronGeometry(2.0, 1), color: (t) => lerpColor('#466f2c', '#79a03c', t), offsetY: 6.2, scaleMul: [1.3, 0.9, 1.1] },
  { geometry: new IcosahedronGeometry(1.5, 1), color: (t) => lerpColor('#4c7a30', '#86ad44', t), offsetY: 7.4, scaleMul: [0.9, 0.9, 1.2] },
]
const ROCK_PARTS: Part[] = [{ geometry: new DodecahedronGeometry(1, 0), color: (t) => lerpColor('#5e5a55', '#8a8378', t), offsetY: 0.3, scaleMul: [1.3, 0.8, 1.0], roughness: 1 }]
const BUSH_PARTS: Part[] = [{ geometry: new IcosahedronGeometry(0.9, 1), color: (t) => lerpColor('#2f5a22', '#5f8a2c', t), offsetY: 0.5, scaleMul: [1.2, 0.8, 1.1] }]
const DELINEATOR_PARTS: Part[] = [
  { geometry: new CylinderGeometry(0.04, 0.045, 1.0, 6), color: () => new Color('#f4f4f4'), offsetY: 0.5, roughness: 0.6 },
  { geometry: new CylinderGeometry(0.05, 0.05, 0.12, 6), color: () => new Color('#ff2a2a'), offsetY: 0.92, roughness: 0.4 },
]
const POLE_PARTS: Part[] = [
  { geometry: new CylinderGeometry(0.14, 0.18, 9, 8), color: () => new Color('#8b8a84'), offsetY: 4.5, roughness: 0.9 },
  { geometry: new CylinderGeometry(0.05, 0.05, 1.8, 6).rotateZ(Math.PI / 2), color: () => new Color('#6c6a64'), offsetY: 8.4, roughness: 0.9 },
]

function Wires({ poles }: { poles: SceneryInstance[] }) {
  const geometry = useMemo(() => {
    const pts: number[] = []
    for (let i = 0; i + 1 < poles.length; i++) {
      const a = poles[i].position, b = poles[i + 1].position
      const dist = Math.hypot(a.x - b.x, a.z - b.z)
      if (dist > 90) continue
      // たるみ（放物線）を 6 分割で
      const segs = 6
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs, t1 = (k + 1) / segs
        const sag = (t: number) => -1.2 * 4 * t * (1 - t)
        pts.push(a.x + (b.x - a.x) * t0, a.y + 8.6 + (b.y - a.y) * t0 + sag(t0), a.z + (b.z - a.z) * t0)
        pts.push(a.x + (b.x - a.x) * t1, a.y + 8.6 + (b.y - a.y) * t1 + sag(t1), a.z + (b.z - a.z) * t1)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [poles])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (poles.length < 2) return null
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#2a2a2a" />
    </lineSegments>
  )
}

const SIGN_KINDS: SignKind[] = ['curve-left', 'curve-right', 'speed-40', 'chevron-left', 'chevron-right']

function Signs({ course }: { course: BuiltCourse }) {
  const textures = useMemo(() => Object.fromEntries(SIGN_KINDS.map((k) => [k, createSignTexture(k)])) as Record<SignKind, ReturnType<typeof createSignTexture>>, [])
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures])
  const signs = course.scenery.signs
  if (signs.length === 0) return null
  return (
    <group>
      {signs.map((sg, i) => {
        const chevron = sg.kind.startsWith('chevron')
        const h = chevron ? 1.1 : 2.1
        const w = chevron ? 1.1 : 0.9
        const bh = chevron ? 0.55 : 0.9
        return (
          <group key={i} position={[sg.position.x, sg.position.y, sg.position.z]} rotation={[0, sg.heading, 0]}>
            <mesh position={[0, h / 2, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.045, h, 6]} />
              <meshStandardMaterial color="#9ea2a6" metalness={0.6} roughness={0.5} />
            </mesh>
            {/* 板: 進行方向（-Z 側から見る）に向ける */}
            <mesh position={[0, h, 0]} rotation={[0, Math.PI, 0]} castShadow>
              <planeGeometry args={[w, bh]} />
              <meshStandardMaterial map={textures[sg.kind]} transparent alphaTest={0.4} roughness={0.5} metalness={0.1} side={2} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export function SceneryProps({ course }: { course: BuiltCourse }) {
  const sc = course.scenery
  const conifers = useMemo(() => sc.trees.filter((t: TreeInstance) => t.species === 'conifer'), [sc.trees])
  const broadleaf = useMemo(() => sc.trees.filter((t: TreeInstance) => t.species === 'broadleaf'), [sc.trees])
  return (
    <group>
      <Instanced items={conifers} parts={CONIFER_PARTS} />
      <Instanced items={broadleaf} parts={BROADLEAF_PARTS} />
      <Instanced items={sc.rocks} parts={ROCK_PARTS} />
      <Instanced items={sc.bushes} parts={BUSH_PARTS} castShadow={false} />
      <Instanced items={sc.delineators} parts={DELINEATOR_PARTS} castShadow={false} />
      <Instanced items={sc.poles} parts={POLE_PARTS} />
      <Wires poles={sc.poles} />
      <Signs course={course} />
    </group>
  )
}
