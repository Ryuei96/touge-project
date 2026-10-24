/**
 * SceneryGenerator: 景観（樹木など）の配置を生成する。
 * 現状は決定論的な擬似乱数による簡易配置。将来は AI 生成アセット・自然言語編集の
 * 結果をこの SceneryInstances 形式に落とし込む想定。
 */
import { createRng } from '../core/noise'
import type { HeightField, SceneryInstances } from '../course/types'
import type { RoadSample } from '../road/spline'

export interface SceneryOptions {
  seed?: number
  treeCount?: number
  /** 道路中心線からの最小距離 [m] */
  minDistanceFromRoad?: number
  /** 道路からの最大距離 [m] */
  maxDistanceFromRoad?: number
}

export function generateScenery(field: HeightField | undefined, samples: RoadSample[], options: SceneryOptions = {}): SceneryInstances {
  const rng = createRng(options.seed ?? 42)
  const count = options.treeCount ?? 600
  const minD = options.minDistanceFromRoad ?? 9
  const maxD = options.maxDistanceFromRoad ?? 110
  const trees: SceneryInstances['trees'] = []
  if (!field || samples.length === 0) return { trees }
  let attempts = 0
  while (trees.length < count && attempts < count * 6) {
    attempts++
    // 道路沿いにばらまく: ランダムなサンプルの横方向オフセット
    const s = samples[Math.floor(rng() * samples.length)]
    const side = rng() < 0.5 ? -1 : 1
    const lateral = (minD + rng() * (maxD - minD)) * side
    const along = (rng() - 0.5) * 20
    const x = s.position.x + s.right.x * lateral + s.tangent.x * along
    const z = s.position.z + s.right.z * lateral + s.tangent.z * along
    if (x < field.minX || x > field.maxX || z < field.minZ || z > field.maxZ) continue
    const info = field.roadInfo(x, z)
    if (info.distance < samples[info.index].width / 2 + minD - 2) continue
    const y = field.getHeight(x, z)
    trees.push({ position: { x, y, z }, scale: 0.8 + rng() * 0.9, rotationY: rng() * Math.PI * 2 })
  }
  return { trees }
}
