/**
 * SceneryGenerator: 景観（樹木・岩・藪・視線誘導標・電柱・標識）の配置を生成する。
 * 決定論的な擬似乱数とノイズで、森の「まとまり」や種の混在を作る。
 * 将来は AI 生成アセット・自然言語編集の結果をこの SceneryInstances 形式に落とし込む想定。
 */
import { createRng, fbm2 } from '../core/noise'
import type { HeightField, SceneryInstances, SignInstance, TreeInstance } from '../course/types'
import type { RoadSample } from '../road/spline'

export interface SceneryOptions {
  seed?: number
  treeCount?: number
  /** 道路縁からの最小距離 [m] */
  minDistanceFromRoad?: number
  /** 道路からの最大距離 [m] */
  maxDistanceFromRoad?: number
  /** ガードレールがある側（サンプルごと）。無い所に視線誘導標を立てる */
  guardrailMask?: { left: boolean[]; right: boolean[] }
}

function slopeAt(field: HeightField, x: number, z: number): number {
  const d = 1.5
  const hx = field.getHeight(x + d, z) - field.getHeight(x - d, z)
  const hz = field.getHeight(x, z + d) - field.getHeight(x, z - d)
  return Math.hypot(hx, hz) / (2 * d)
}

export function generateScenery(field: HeightField | undefined, samples: RoadSample[], options: SceneryOptions = {}): SceneryInstances {
  const rng = createRng(options.seed ?? 42)
  const count = options.treeCount ?? 700
  const minD = options.minDistanceFromRoad ?? 7
  const maxD = options.maxDistanceFromRoad ?? 120
  const out: SceneryInstances = { trees: [], rocks: [], bushes: [], delineators: [], poles: [], signs: [] }
  if (!field || samples.length === 0) return out
  const seed = options.seed ?? 42
  const step = samples.length > 1 ? samples[1].distance - samples[0].distance : 2

  const edgeDistance = (x: number, z: number) => {
    const info = field.roadInfo(x, z)
    return info.distance - samples[info.index].width / 2
  }

  // --- 樹木: 森の密度ノイズで「まとまり」を作り、急斜面と道路際を避ける
  let attempts = 0
  while (out.trees.length < count && attempts < count * 8) {
    attempts++
    const s = samples[Math.floor(rng() * samples.length)]
    const side = rng() < 0.5 ? -1 : 1
    const lateral = (minD + rng() * (maxD - minD)) * side
    const along = (rng() - 0.5) * 24
    const x = s.position.x + s.right.x * lateral + s.tangent.x * along
    const z = s.position.z + s.right.z * lateral + s.tangent.z * along
    if (x < field.minX || x > field.maxX || z < field.minZ || z > field.maxZ) continue
    const ed = edgeDistance(x, z)
    if (ed < minD - 2) continue
    const density = fbm2(x / 60, z / 60, seed + 5, 3) // 0..1
    if (rng() > 0.25 + density * 0.9) continue
    const slope = slopeAt(field, x, z)
    if (slope > 0.9) continue
    const y = field.getHeight(x, z)
    const species = fbm2(x / 90, z / 90, seed + 9, 2) > 0.52 ? 'broadleaf' : 'conifer'
    const scale = (species === 'conifer' ? 0.7 : 0.6) + rng() * (species === 'conifer' ? 1.0 : 0.9)
    const tree: TreeInstance = { position: { x, y: y - 0.2, z }, scale, rotationY: rng() * Math.PI * 2, tint: rng(), species }
    out.trees.push(tree)
  }

  // --- 岩: 急斜面に多く、所々にまとめて
  const rockTarget = Math.round(count * 0.35)
  attempts = 0
  while (out.rocks.length < rockTarget && attempts < rockTarget * 10) {
    attempts++
    const s = samples[Math.floor(rng() * samples.length)]
    const side = rng() < 0.5 ? -1 : 1
    const lateral = (4 + rng() * 70) * side
    const along = (rng() - 0.5) * 20
    const x = s.position.x + s.right.x * lateral + s.tangent.x * along
    const z = s.position.z + s.right.z * lateral + s.tangent.z * along
    if (x < field.minX || x > field.maxX || z < field.minZ || z > field.maxZ) continue
    if (edgeDistance(x, z) < 1.0) continue
    const slope = slopeAt(field, x, z)
    if (rng() > 0.15 + slope * 1.2) continue
    const y = field.getHeight(x, z)
    out.rocks.push({ position: { x, y: y - 0.3, z }, scale: 0.5 + rng() * (slope > 0.5 ? 2.2 : 1.2), rotationY: rng() * Math.PI * 2, tint: rng() })
  }

  // --- 藪: 道路際（路肩のすぐ外）にまばらに
  const bushTarget = Math.round(count * 0.5)
  attempts = 0
  while (out.bushes.length < bushTarget && attempts < bushTarget * 6) {
    attempts++
    const s = samples[Math.floor(rng() * samples.length)]
    const side = rng() < 0.5 ? -1 : 1
    const lateral = (s.width / 2 + 2.2 + rng() * 5) * side
    const along = (rng() - 0.5) * 10
    const x = s.position.x + s.right.x * lateral + s.tangent.x * along
    const z = s.position.z + s.right.z * lateral + s.tangent.z * along
    if (x < field.minX || x > field.maxX || z < field.minZ || z > field.maxZ) continue
    if (rng() > 0.35 + fbm2(x / 30, z / 30, seed + 3, 2) * 0.6) continue
    const y = field.getHeight(x, z)
    out.bushes.push({ position: { x, y: y - 0.15, z }, scale: 0.35 + rng() * 0.55, rotationY: rng() * Math.PI * 2, tint: rng() })
  }

  // --- 視線誘導標: ガードレールの無い側に 12 m ごと
  const delinEvery = Math.max(1, Math.round(12 / step))
  for (let i = 0; i < samples.length; i += delinEvery) {
    const s = samples[i]
    for (const side of [-1, 1] as const) {
      const hasRail = side < 0 ? options.guardrailMask?.left[i] : options.guardrailMask?.right[i]
      if (hasRail) continue
      const d = s.width / 2 + 0.7
      out.delineators.push({ position: { x: s.position.x + s.right.x * d * side, y: s.position.y, z: s.position.z + s.right.z * d * side }, scale: 1, rotationY: s.heading })
    }
  }

  // --- 電柱: 山側（地形が高い側）に 45 m ごと
  const poleEvery = Math.max(1, Math.round(45 / step))
  for (let i = Math.round(poleEvery / 2); i < samples.length; i += poleEvery) {
    const s = samples[i]
    const d = s.width / 2 + 2.6
    const hl = field.getHeight(s.position.x - s.right.x * 8, s.position.z - s.right.z * 8)
    const hr = field.getHeight(s.position.x + s.right.x * 8, s.position.z + s.right.z * 8)
    const side = hl > hr ? -1 : 1
    const x = s.position.x + s.right.x * d * side
    const z = s.position.z + s.right.z * d * side
    out.poles.push({ position: { x, y: field.getHeight(x, z), z }, scale: 1, rotationY: s.heading })
  }

  // --- 標識: 急カーブの手前に警戒標識、カーブ外側にシェブロン。区間の最初に速度標識
  const signs: SignInstance[] = []
  const curveThreshold = 1 / 45
  let i = 2
  while (i < samples.length - 2) {
    const s = samples[i]
    if (Math.abs(s.curvature) > curveThreshold) {
      // カーブ区間の範囲
      let j = i
      while (j < samples.length - 1 && Math.abs(samples[j].curvature) > curveThreshold * 0.6) j++
      const left = s.curvature > 0
      const outer = left ? 1 : -1 // 左カーブの外側は右
      // 警戒標識: 50 m 手前の外側
      const pre = Math.max(0, i - Math.round(50 / step))
      const ps = samples[pre]
      const pd = ps.width / 2 + 1.3
      signs.push({ position: { x: ps.position.x + ps.right.x * pd * outer, y: ps.position.y, z: ps.position.z + ps.right.z * pd * outer }, heading: ps.heading, kind: left ? 'curve-left' : 'curve-right' })
      // シェブロン: 区間内 10 m ごと（外側）
      const every = Math.max(1, Math.round(10 / step))
      for (let k = i; k < j; k += every) {
        const cs = samples[k]
        const cd = cs.width / 2 + 1.6
        signs.push({ position: { x: cs.position.x + cs.right.x * cd * outer, y: cs.position.y, z: cs.position.z + cs.right.z * cd * outer }, heading: cs.heading, kind: left ? 'chevron-left' : 'chevron-right' })
      }
      i = j + Math.round(30 / step)
    } else i++
  }
  // 速度標識: 120 m 地点と 600 m ごと
  for (let d = 120; d < samples[samples.length - 1].distance - 60; d += 600) {
    const idx = Math.min(samples.length - 1, Math.round(d / step))
    const s = samples[idx]
    const sd = s.width / 2 + 1.3
    signs.push({ position: { x: s.position.x + s.right.x * sd, y: s.position.y, z: s.position.z + s.right.z * sd }, heading: s.heading, kind: 'speed-40' })
  }
  out.signs = signs
  return out
}
