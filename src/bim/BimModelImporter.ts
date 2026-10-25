/**
 * BimModelImporter: GLB（BIM/CIM からの書き出し）を走行可能なコース部品に変換する。
 *
 * - 走行路の抽出: ノード名パターン（既定 /^(Road_|Deck_)/）で路面メッシュを選び、衝突形状にする
 * - 単位・軸変換: IFC / Civil 3D 由来のモデルは Z-up・mm 単位のことがあるので scale / upAxis で補正
 * - 配置: offset（ゲーム座標）と yaw で既存コースへ接続する
 *
 * Three.js 非依存。描画は CourseScene / GlbAsset が GLTFLoader で行い、
 * ここで作る MeshData は衝突と解析（境界・走行路）に使う。
 */
import type { CollisionShape, MeshData } from '../course/types'
import type { GlbModel, GlbMeshInstance } from './GlbReader'

export interface BimTransformOptions {
  /** モデル単位 → m の倍率（mm なら 0.001） */
  scale?: number
  /** モデルの上方向軸。'Z' のとき Z-up → Y-up へ変換（x, y, z → x, z, -y） */
  upAxis?: 'Y' | 'Z'
  /** ゲーム座標でのオフセット [m] */
  offset?: { x: number; y: number; z: number }
  /** Y 軸まわりの回転 [rad] */
  yaw?: number
}

export interface BimImportOptions extends BimTransformOptions {
  /** 走行路として扱うノード名の正規表現 */
  drivablePattern?: RegExp
  /** 衝突を付けないノード名の正規表現（装飾・見えない要素など） */
  noCollisionPattern?: RegExp
  friction?: number
}

export interface BimImportResult {
  /** 走行路（結合済み） */
  drivable: MeshData
  drivableNames: string[]
  /** 走行路以外で衝突を持つもの（結合済み。無ければ undefined） */
  obstacles?: MeshData
  obstacleNames: string[]
  collision: CollisionShape[]
  bounds: { min: [number, number, number]; max: [number, number, number] }
}

export const DEFAULT_DRIVABLE_PATTERN = /^(Road_|Deck_|Pavement_|Lane_)/i

export function transformMesh(mesh: MeshData, opts: BimTransformOptions): MeshData {
  const s = opts.scale ?? 1
  const zUp = opts.upAxis === 'Z'
  const yaw = opts.yaw ?? 0
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const o = opts.offset ?? { x: 0, y: 0, z: 0 }
  const positions = new Float32Array(mesh.positions.length)
  const normals = new Float32Array(mesh.normals.length)
  const apply = (src: Float32Array, dst: Float32Array, isPoint: boolean) => {
    for (let i = 0; i < src.length; i += 3) {
      let x = src[i], y = src[i + 1], z = src[i + 2]
      if (zUp) {
        const ny = z
        z = -y
        y = ny
      }
      if (isPoint) {
        x *= s; y *= s; z *= s
      }
      const rx = cy * x + sy * z
      const rz = -sy * x + cy * z
      dst[i] = isPoint ? rx + o.x : rx
      dst[i + 1] = isPoint ? y + o.y : y
      dst[i + 2] = isPoint ? rz + o.z : rz
    }
  }
  apply(mesh.positions, positions, true)
  apply(mesh.normals, normals, false)
  return { positions, normals, indices: mesh.indices, uvs: mesh.uvs, colors: mesh.colors }
}

export function mergeMeshes(meshes: MeshData[]): MeshData {
  const vcount = meshes.reduce((a, m) => a + m.positions.length / 3, 0)
  const icount = meshes.reduce((a, m) => a + m.indices.length, 0)
  const positions = new Float32Array(vcount * 3)
  const normals = new Float32Array(vcount * 3)
  const indices = new Uint32Array(icount)
  let vo = 0
  let io = 0
  for (const m of meshes) {
    positions.set(m.positions, vo * 3)
    normals.set(m.normals, vo * 3)
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + vo
    vo += m.positions.length / 3
    io += m.indices.length
  }
  return { positions, normals, indices }
}

function boundsOf(meshes: MeshData[]): BimImportResult['bounds'] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = m.positions[i + k]
        if (v < min[k]) min[k] = v
        if (v > max[k]) max[k] = v
      }
    }
  }
  return { min, max }
}

export class BimImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BimImportError'
  }
}

/** GLB モデルを走行路・障害物・衝突形状に分類する */
export function importBimModel(model: GlbModel, options: BimImportOptions = {}): BimImportResult {
  const drivablePattern = options.drivablePattern ?? DEFAULT_DRIVABLE_PATTERN
  const transformed = model.instances.map((inst: GlbMeshInstance) => ({ inst, mesh: transformMesh(inst.mesh, options) }))
  const drivableList = transformed.filter((t) => drivablePattern.test(t.inst.name))
  if (drivableList.length === 0) {
    throw new BimImportError(`no drivable surface found (nodes matching ${drivablePattern}). nodes: ${model.instances.map((i) => i.name).join(', ')}`)
  }
  const obstacleList = transformed.filter((t) => !drivablePattern.test(t.inst.name) && !(options.noCollisionPattern?.test(t.inst.name) ?? false))
  const drivable = mergeMeshes(drivableList.map((t) => t.mesh))
  const obstacles = obstacleList.length ? mergeMeshes(obstacleList.map((t) => t.mesh)) : undefined
  const collision: CollisionShape[] = [
    { kind: 'trimesh', label: 'bim-drivable', vertices: drivable.positions, indices: drivable.indices, friction: options.friction ?? 1 },
  ]
  if (obstacles) collision.push({ kind: 'trimesh', label: 'bim-obstacles', vertices: obstacles.positions, indices: obstacles.indices, friction: 0.5 })
  return {
    drivable,
    drivableNames: drivableList.map((t) => t.inst.name),
    obstacles,
    obstacleNames: obstacleList.map((t) => t.inst.name),
    collision,
    bounds: boundsOf(transformed.map((t) => t.mesh)),
  }
}
