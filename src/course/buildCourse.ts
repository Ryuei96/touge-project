/**
 * CourseDefinition → BuiltCourse の構築パイプライン。
 * 中心線 → スプライン → 路面メッシュ / ガードレール → 地形 → 衝突 → マーカー → 景観。
 * procedural と geospatial はこのパイプラインを共有する（違いは中心線の出どころのみ）。
 */
import { headingFromDirection, type Vec3 } from '../core/vec3'
import { buildCourseCollision } from '../road/CollisionBuilder'
import { generateGuardrailMesh, generateRoadMesh } from '../road/RoadMeshGenerator'
import { sampleCenterline, sampleIndexAtDistance, type RoadSample } from '../road/spline'
import { createRoadFollowingHeightField, generateTerrainMesh } from '../road/TerrainMeshGenerator'
import { generateScenery } from '../scenery/SceneryGenerator'
import { parseGlb } from '../bim/GlbReader'
import { importBimModel } from '../bim/BimModelImporter'
import type { BuiltCourse, CourseDefinition, Marker, Pose } from './types'

function buildMarkers(def: CourseDefinition, samples: RoadSample[]): BuiltCourse['markers'] {
  const first = samples[0]
  const last = samples[samples.length - 1]
  const length = last.distance
  const startOffset = Math.min(6, length * 0.05)
  const startIdx = sampleIndexAtDistance(samples, startOffset)
  const s0 = samples[startIdx]
  const start: Pose = {
    position: { x: s0.position.x, y: s0.position.y + 0.6, z: s0.position.z },
    heading: headingFromDirection(first.tangent),
  }
  const goal: Marker = {
    id: 'goal',
    position: { ...last.position },
    radius: Math.max(last.width, 8),
    label: 'GOAL',
    distance: last.distance,
  }
  const checkpoints: Marker[] = []
  const spec = def.checkpoints ?? { interval: 250 }
  const distances: { d: number; label?: string }[] = Array.isArray(spec)
    ? spec.map((c) => ({ d: c.atDistance, label: c.label }))
    : Array.from({ length: Math.max(0, Math.floor((length - 1) / spec.interval)) }, (_, i) => ({ d: (i + 1) * spec.interval }))
  distances
    .filter((c) => c.d > startOffset + 5 && c.d < length - 5)
    .sort((a, b) => a.d - b.d)
    .forEach((c, i) => {
      const s = samples[sampleIndexAtDistance(samples, c.d)]
      checkpoints.push({
        id: `cp-${i + 1}`,
        position: { ...s.position },
        radius: Math.max(s.width, 8),
        label: c.label ?? `CP ${i + 1}`,
        distance: s.distance,
      })
    })
  return { start, goal, checkpoints }
}

export function buildCourseFromCenterline(def: CourseDefinition): BuiltCourse {
  const samples = sampleCenterline(def.centerline, {
    step: def.sampleStep ?? 2,
    defaultWidth: def.defaultWidth,
    closed: def.closed ?? false,
  })
  const road = def.meshes?.road ?? generateRoadMesh(samples, { lift: 0 })
  const guardrails = def.guardrails === false ? [] : [generateGuardrailMesh(samples, -1), generateGuardrailMesh(samples, 1)]

  const terrainOpts = def.terrain ?? {}
  const terrainEnabled = terrainOpts.enabled ?? true
  const heightField = terrainEnabled ? createRoadFollowingHeightField(samples, terrainOpts) : undefined
  const terrain = def.meshes?.terrain ?? (heightField ? generateTerrainMesh(heightField, { resolution: terrainOpts.resolution ?? 128 }) : undefined)

  const collision = def.collision ?? buildCourseCollision({ road, terrain, guardrails })
  const markers = buildMarkers(def, samples)
  const scenery = generateScenery(heightField, samples, { seed: def.scenery?.seed, treeCount: def.scenery?.treeCount })

  let minY = Infinity, maxY = -Infinity
  for (const s of samples) {
    if (s.position.y < minY) minY = s.position.y
    if (s.position.y > maxY) maxY = s.position.y
  }
  if (terrain) {
    for (let i = 1; i < terrain.positions.length; i += 3) {
      if (terrain.positions[i] < minY) minY = terrain.positions[i]
      if (terrain.positions[i] > maxY) maxY = terrain.positions[i]
    }
  }
  return {
    definition: def,
    samples,
    length: samples[samples.length - 1].distance,
    meshes: { road, terrain, guardrails },
    collision,
    heightField,
    markers,
    scenery,
    bounds: { minY, maxY },
  }
}

export type BinaryLoader = (uri: string) => Promise<ArrayBuffer>

/**
 * BIM モデル（GLB）から走行路を取り出してコースを構築する。
 * 中心線（マーカー・オートパイロット・地形用）は定義側で与える。
 */
export async function buildBimCourse(def: CourseDefinition, loadBinary: BinaryLoader): Promise<BuiltCourse> {
  if (!def.model) throw new Error(`course "${def.id}": source 'bim' requires "model"`)
  const buffer = await loadBinary(def.model.uri)
  const glb = parseGlb(buffer)
  const imported = importBimModel(glb, {
    drivablePattern: def.model.drivablePattern ? new RegExp(def.model.drivablePattern, 'i') : undefined,
    scale: def.model.scale,
    upAxis: def.model.upAxis,
    offset: def.model.offset,
    yaw: def.model.yaw,
  })
  const samples = sampleCenterline(def.centerline, { step: def.sampleStep ?? 2, defaultWidth: def.defaultWidth, closed: def.closed ?? false })
  const terrainOpts = def.terrain ?? {}
  const terrainEnabled = terrainOpts.enabled ?? false
  const heightField = terrainEnabled ? createRoadFollowingHeightField(samples, terrainOpts) : undefined
  const terrain = heightField ? generateTerrainMesh(heightField, { resolution: terrainOpts.resolution ?? 96 }) : undefined
  const collision = [...imported.collision, ...(terrain ? buildCourseCollision({ road: imported.drivable, terrain, guardrails: [] }).filter((c) => c.label === 'terrain') : [])]
  const markers = buildMarkers(def, samples)
  const scenery = generateScenery(heightField, samples, { seed: def.scenery?.seed, treeCount: def.scenery?.treeCount ?? 0 })
  return {
    definition: def,
    samples,
    length: samples[samples.length - 1].distance,
    meshes: { road: imported.drivable, terrain, guardrails: imported.obstacles ? [imported.obstacles] : [] },
    collision,
    heightField,
    markers,
    scenery,
    bounds: { minY: imported.bounds.min[1], maxY: imported.bounds.max[1] },
  }
}

/** 既定の原点（架空コース用） */
export const LOCAL_ORIGIN = { local: { x: 0, y: 0, z: 0 } as Vec3, sourceCrs: 'LOCAL', verticalDatum: 'none' as const }
