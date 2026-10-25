/**
 * 周辺環境レイヤー: 点群（THREE.Points）と CityGML 建物（メッシュ + 任意で trimesh 衝突）。
 * 読み込み・解析は geo/ の純粋モジュールで行い、ここは fetch と Three.js への変換のみ。
 */
import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { useEffect, useMemo, useState } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import type { BuiltCourse, CityGmlLayerRef, CourseLayer, MeshData, PointCloudLayerRef } from '../course/types'
import { CoordinateTransformer } from '../geo/CoordinateTransformer'
import { importCityGml } from '../geo/CityGmlImporter'
import { parsePointCloud, toGamePointCloud, type PointCloud } from '../geo/PointCloudImporter'

function useLayerData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null })
  useEffect(() => {
    let cancelled = false
    load()
      .then((data) => {
        if (!cancelled) setState({ data, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ data: null, error: e instanceof Error ? e.message : String(e) })
        console.error('[EnvironmentLayers]', e)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

function toGeometry(mesh: MeshData): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  g.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  g.setIndex(new BufferAttribute(mesh.indices, 1))
  g.computeBoundingSphere()
  return g
}

function PointCloudLayer({ layer, course }: { layer: PointCloudLayerRef; course: BuiltCourse }) {
  const { data } = useLayerData<PointCloud>(async () => {
    const res = await fetch(layer.uri)
    if (!res.ok) throw new Error(`failed to load ${layer.uri}: ${res.status}`)
    const raw = parsePointCloud(layer.uri, await res.arrayBuffer(), { maxPoints: layer.maxPoints })
    const transformer = layer.coordinates === 'projected' ? new CoordinateTransformer(course.definition.origin) : undefined
    return toGamePointCloud(raw, { transformer, axes: layer.coordinates === 'game' ? 'game' : 'ENU', swapXY: layer.swapXY, maxPoints: layer.maxPoints })
  }, [layer.uri, course])
  const geometry = useMemo(() => {
    if (!data) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(data.positions, 3))
    if (data.colors) g.setAttribute('color', new BufferAttribute(data.colors, 3))
    g.computeBoundingSphere()
    return g
  }, [data])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return (
    <points geometry={geometry}>
      <pointsMaterial size={layer.pointSize ?? 0.35} vertexColors={!!data?.colors} color={data?.colors ? undefined : '#c8d0d8'} sizeAttenuation />
    </points>
  )
}

function CityGmlLayer({ layer, course }: { layer: CityGmlLayerRef; course: BuiltCourse }) {
  const { data } = useLayerData(async () => {
    const res = await fetch(layer.uri)
    if (!res.ok) throw new Error(`failed to load ${layer.uri}: ${res.status}`)
    const origin = course.definition.origin
    const transformer = origin.sourcePosition && 'latitude' in origin.sourcePosition ? new CoordinateTransformer(origin) : undefined
    return importCityGml(await res.text(), { transformer, maxBuildings: layer.maxBuildings, maxDistance: layer.maxDistance })
  }, [layer.uri, course])
  const geometry = useMemo(() => (data ? toGeometry(data.merged) : null), [data])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry || !data) return null
  const mesh = (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={layer.color ?? '#d9d2c5'} roughness={0.85} metalness={0.05} />
    </mesh>
  )
  if (layer.collision === false) return mesh
  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[data.merged.positions, data.merged.indices]} friction={0.6} />
      {mesh}
    </RigidBody>
  )
}

export function EnvironmentLayers({ course }: { course: BuiltCourse }) {
  const layers: CourseLayer[] = course.definition.layers ?? []
  if (layers.length === 0) return null
  return (
    <group>
      {layers.map((l) => (l.kind === 'point-cloud' ? <PointCloudLayer key={l.id} layer={l} course={course} /> : <CityGmlLayer key={l.id} layer={l} course={course} />))}
    </group>
  )
}
