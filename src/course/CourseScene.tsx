/**
 * BuiltCourse を Three.js / Rapier のシーンに展開する。
 * メッシュ生成ロジックは持たず、MeshData / CollisionShape を変換するだけ。
 */
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, InstancedMesh, Matrix4, Object3D } from 'three'
import type { BuiltCourse, CollisionShape, MeshData, PlacedAsset } from './types'
import { createGrassDetailTexture, createRoadTexture } from './textures'
import { useGameStore } from '../app/gameStore'
import { useGarageStore } from '../app/garageStore'
import { BimModelVisual, GlbAsset } from '../assets/GlbAsset'
import { EnvironmentLayers } from '../scenery/EnvironmentLayers'

function toGeometry(mesh: MeshData): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  g.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  if (mesh.uvs) g.setAttribute('uv', new BufferAttribute(mesh.uvs, 2))
  if (mesh.colors) g.setAttribute('color', new BufferAttribute(mesh.colors, 3))
  g.setIndex(new BufferAttribute(mesh.indices, 1))
  g.computeBoundingSphere()
  return g
}

function useGeometry(mesh: MeshData | undefined): BufferGeometry | null {
  const geometry = useMemo(() => (mesh ? toGeometry(mesh) : null), [mesh])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return geometry
}

function RoadMesh({ mesh }: { mesh: MeshData }) {
  const geometry = useGeometry(mesh)
  const texture = useMemo(() => createRoadTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={texture} roughness={0.9} metalness={0.02} />
    </mesh>
  )
}

function TerrainMesh({ mesh }: { mesh: MeshData }) {
  const geometry = useGeometry(mesh)
  const detail = useMemo(() => {
    const t = createGrassDetailTexture()
    t.repeat.set(60, 60)
    return t
  }, [])
  useEffect(() => () => detail.dispose(), [detail])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors map={detail} roughness={1} metalness={0} />
    </mesh>
  )
}

/** ガードレールの支柱（一定間隔） */
function GuardrailPosts({ course }: { course: BuiltCourse }) {
  const items = useMemo(() => {
    const out: Matrix4[] = []
    const dummy = new Object3D()
    const step = 4
    const samples = course.samples
    const spacing = samples.length > 1 ? samples[1].distance - samples[0].distance : 2
    const every = Math.max(1, Math.round(step / spacing))
    for (let i = 0; i < samples.length; i += every) {
      const s = samples[i]
      for (const side of [-1, 1]) {
        const d = s.width / 2 + 0.6
        dummy.position.set(s.position.x + s.right.x * d * side, s.position.y + 0.15, s.position.z + s.right.z * d * side)
        dummy.rotation.set(0, s.heading, 0)
        dummy.updateMatrix()
        out.push(dummy.matrix.clone())
      }
    }
    return out
  }, [course])
  const set = (m: InstancedMesh | null) => {
    if (!m) return
    items.forEach((mat, i) => m.setMatrixAt(i, mat))
    m.instanceMatrix.needsUpdate = true
  }
  if (items.length === 0) return null
  return (
    <instancedMesh ref={set} args={[undefined, undefined, items.length]} frustumCulled={false} castShadow>
      <boxGeometry args={[0.1, 0.9, 0.1]} />
      <meshStandardMaterial color="#8d949a" roughness={0.5} metalness={0.7} />
    </instancedMesh>
  )
}

function GuardrailMesh({ mesh }: { mesh: MeshData }) {
  const geometry = useGeometry(mesh)
  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#d7dde2" side={DoubleSide} roughness={0.35} metalness={0.8} />
    </mesh>
  )
}

function CollisionBodies({ shapes }: { shapes: CollisionShape[] }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {shapes.map((s) =>
        s.kind === 'trimesh' ? (
          <TrimeshCollider key={s.label} args={[s.vertices, s.indices]} friction={s.friction ?? 1} />
        ) : null,
      )}
    </RigidBody>
  )
}

function Trees({ course }: { course: BuiltCourse }) {
  const trees = course.scenery.trees
  const count = trees.length
  const matrices = useMemo(() => {
    const dummy = new Object3D()
    const trunk: Matrix4[] = []
    const crown: Matrix4[] = []
    const crownTop: Matrix4[] = []
    for (const t of trees) {
      dummy.position.set(t.position.x, t.position.y + 1.4 * t.scale, t.position.z)
      dummy.rotation.set(0, t.rotationY, 0)
      dummy.scale.setScalar(t.scale)
      dummy.updateMatrix()
      trunk.push(dummy.matrix.clone())
      dummy.position.set(t.position.x, t.position.y + 4.2 * t.scale, t.position.z)
      dummy.updateMatrix()
      crown.push(dummy.matrix.clone())
      dummy.position.set(t.position.x, t.position.y + 7.0 * t.scale, t.position.z)
      dummy.updateMatrix()
      crownTop.push(dummy.matrix.clone())
    }
    return { trunk, crown, crownTop }
  }, [trees])
  const setMatrices = (mesh: InstancedMesh | null, list: Matrix4[]) => {
    if (!mesh) return
    list.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
  }
  if (count === 0) return null
  return (
    <group>
      <instancedMesh ref={(m) => setMatrices(m, matrices.trunk)} args={[undefined, undefined, count]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.22, 0.38, 3.2, 7]} />
        <meshStandardMaterial color="#4f3b2a" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={(m) => setMatrices(m, matrices.crown)} args={[undefined, undefined, count]} frustumCulled={false} castShadow>
        <coneGeometry args={[2.4, 5.5, 8]} />
        <meshStandardMaterial color="#2c6132" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={(m) => setMatrices(m, matrices.crownTop)} args={[undefined, undefined, count]} frustumCulled={false} castShadow>
        <coneGeometry args={[1.6, 4.5, 8]} />
        <meshStandardMaterial color="#3a7a3c" roughness={0.95} />
      </instancedMesh>
    </group>
  )
}

function Markers({ course }: { course: BuiltCourse }) {
  const checkpointIndex = useGameStore((s) => s.checkpointIndex)
  const finished = useGameStore((s) => s.finished)
  const all = [...course.markers.checkpoints, course.markers.goal]
  return (
    <group>
      {all.map((m, i) => {
        const sample = course.samples[Math.min(course.samples.length - 1, Math.round((m.distance ?? 0) / (course.samples[1].distance - course.samples[0].distance)))]
        const isGoal = i === all.length - 1
        const passed = finished || i < checkpointIndex
        const isNext = !finished && i === checkpointIndex
        const color = isGoal ? '#f5c542' : isNext ? '#3ddcff' : passed ? '#6c7a89' : '#9ad0ff'
        const w = sample.width + 1.6
        return (
          <group key={m.id} position={[m.position.x, m.position.y, m.position.z]} rotation={[0, sample.heading, 0]}>
            <mesh position={[0, 2.2, 0]}>
              <boxGeometry args={[w, 4.4, 0.08]} />
              <meshStandardMaterial color={color} transparent opacity={passed ? 0.12 : 0.3} depthWrite={false} side={DoubleSide} />
            </mesh>
            <mesh position={[-w / 2, 2.5, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 5, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[w / 2, 2.5, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 5, 8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, 5, 0]}>
              <boxGeometry args={[w + 0.2, 0.25, 0.25]} />
              <meshStandardMaterial color={color} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function PrimitiveAsset({ asset }: { asset: PlacedAsset }) {
  const s = asset.scale ?? { x: 1, y: 1, z: 1 }
  const r = asset.rotation ?? { x: 0, y: 0, z: 0 }
  const geometry = (() => {
    switch (asset.primitive) {
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
      case 'cone':
        return <coneGeometry args={[0.5, 1, 16]} />
      case 'sphere':
        return <sphereGeometry args={[0.5, 16, 12]} />
      default:
        return <boxGeometry args={[1, 1, 1]} />
    }
  })()
  const mesh = (
    <mesh position={[asset.position.x, asset.position.y, asset.position.z]} rotation={[r.x, r.y, r.z]} scale={[s.x, s.y, s.z]}>
      {geometry}
      <meshStandardMaterial color={asset.color ?? '#ffffff'} />
    </mesh>
  )
  if (asset.collision === 'box') {
    return (
      <RigidBody type="fixed" colliders="cuboid">
        {mesh}
      </RigidBody>
    )
  }
  return mesh
}

function Assets({ assets }: { assets: PlacedAsset[] }) {
  return (
    <group>
      {assets.map((a) => {
        if (a.kind === 'primitive') return <PrimitiveAsset key={a.id} asset={a} />
        if (a.kind === 'glb') return <GlbAsset key={a.id} asset={a} />
        // fbx は Blender で GLB に変換して使う（README 参照）
        return null
      })}
    </group>
  )
}

/** ユーザーがガレージ画面で配置したモデル（localStorage に保存） */
function PlacedAssets({ courseId }: { courseId: string }) {
  const placed = useGarageStore((s) => s.placed[courseId])
  if (!placed || placed.length === 0) return null
  return <Assets assets={placed} />
}

export function CourseScene({ course }: { course: BuiltCourse }) {
  const def = course.definition
  const isBim = def.source === 'bim' && def.model
  return (
    <group>
      {isBim && def.model ? (
        <BimModelVisual uri={def.model.uri} offset={def.model.offset} yaw={def.model.yaw} scale={def.model.scale} upAxis={def.model.upAxis} />
      ) : (
        <>
          <RoadMesh mesh={course.meshes.road} />
          {course.meshes.guardrails.map((g, i) => (
            <GuardrailMesh key={i} mesh={g} />
          ))}
          {course.meshes.guardrails.length > 0 && <GuardrailPosts course={course} />}
        </>
      )}
      {course.meshes.terrain && <TerrainMesh mesh={course.meshes.terrain} />}
      <CollisionBodies shapes={course.collision} />
      <Trees course={course} />
      <Markers course={course} />
      <Assets assets={def.assets} />
      <PlacedAssets courseId={def.id} />
      <EnvironmentLayers course={course} />
    </group>
  )
}
