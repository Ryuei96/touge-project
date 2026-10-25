/**
 * RoadMeshGenerator: RoadSample 列から路面メッシュ・ガードレールメッシュを生成する。
 * Three.js 非依存（MeshData を返す）。車両挙動からは完全に独立している。
 */
import type { MeshData } from '../course/types'
import type { RoadSample } from './spline'

export interface RoadMeshOptions {
  /** テクスチャ V 方向の繰り返し長 [m] */
  uvLengthPerRepeat?: number
  /** 路面を法線方向に持ち上げる量 [m]（地形との Z ファイト回避） */
  lift?: number
}

export function generateRoadMesh(samples: RoadSample[], options: RoadMeshOptions = {}): MeshData {
  const uvLen = options.uvLengthPerRepeat ?? 12
  const lift = options.lift ?? 0
  const n = samples.length
  if (n < 2) throw new Error('need at least 2 samples')
  const positions = new Float32Array(n * 2 * 3)
  const normals = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const indices = new Uint32Array((n - 1) * 6)

  for (let i = 0; i < n; i++) {
    const s = samples[i]
    const hw = s.width / 2
    const lx = s.position.x - s.right.x * hw + s.normal.x * lift
    const ly = s.position.y - s.right.y * hw + s.normal.y * lift
    const lz = s.position.z - s.right.z * hw + s.normal.z * lift
    const rx = s.position.x + s.right.x * hw + s.normal.x * lift
    const ry = s.position.y + s.right.y * hw + s.normal.y * lift
    const rz = s.position.z + s.right.z * hw + s.normal.z * lift
    const o = i * 6
    positions[o] = lx; positions[o + 1] = ly; positions[o + 2] = lz
    positions[o + 3] = rx; positions[o + 4] = ry; positions[o + 5] = rz
    normals[o] = s.normal.x; normals[o + 1] = s.normal.y; normals[o + 2] = s.normal.z
    normals[o + 3] = s.normal.x; normals[o + 4] = s.normal.y; normals[o + 5] = s.normal.z
    const v = s.distance / uvLen
    uvs[i * 4] = 0; uvs[i * 4 + 1] = v
    uvs[i * 4 + 2] = 1; uvs[i * 4 + 3] = v
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2       // left i
    const b = i * 2 + 1   // right i
    const c = i * 2 + 2   // left i+1
    const d = i * 2 + 3   // right i+1
    const o = i * 6
    // 反時計回り（上から見て）: 法線が +Y 側になるように
    indices[o] = a; indices[o + 1] = b; indices[o + 2] = c
    indices[o + 3] = b; indices[o + 4] = d; indices[o + 5] = c
  }
  return { positions, normals, uvs, indices }
}

export interface GuardrailOptions {
  /** 路肩からのオフセット [m] */
  offset?: number
  height?: number
  /** 下端を路面より下げる量 [m] */
  sink?: number
  /** 下端の高さ [m]（ビーム描画用。指定すると sink を無視して bottom..bottom+height の帯になる） */
  bottom?: number
}

/** 片側のガードレール（薄い壁）。side = -1 左, +1 右 */
export function generateGuardrailMesh(samples: RoadSample[], side: -1 | 1, options: GuardrailOptions = {}): MeshData {
  const offset = options.offset ?? 0.6
  const height = options.height ?? 0.9
  const sink = options.bottom !== undefined ? -options.bottom : (options.sink ?? 0.4)
  const n = samples.length
  const positions = new Float32Array(n * 2 * 3)
  const normals = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const indices = new Uint32Array((n - 1) * 6)
  for (let i = 0; i < n; i++) {
    const s = samples[i]
    const d = s.width / 2 + offset
    const bx = s.position.x + s.right.x * d * side
    const by = s.position.y + s.right.y * d * side - sink
    const bz = s.position.z + s.right.z * d * side
    const o = i * 6
    positions[o] = bx; positions[o + 1] = by; positions[o + 2] = bz
    positions[o + 3] = bx; positions[o + 4] = by + height + sink; positions[o + 5] = bz
    // 法線は道路中心側を向ける
    normals[o] = -s.right.x * side; normals[o + 1] = 0; normals[o + 2] = -s.right.z * side
    normals[o + 3] = -s.right.x * side; normals[o + 4] = 0; normals[o + 5] = -s.right.z * side
    uvs[i * 4] = s.distance / 4; uvs[i * 4 + 1] = 0
    uvs[i * 4 + 2] = s.distance / 4; uvs[i * 4 + 3] = 1
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3
    const o = i * 6
    if (side > 0) {
      indices[o] = a; indices[o + 1] = b; indices[o + 2] = c
      indices[o + 3] = b; indices[o + 4] = d; indices[o + 5] = c
    } else {
      indices[o] = a; indices[o + 1] = c; indices[o + 2] = b
      indices[o + 3] = b; indices[o + 4] = c; indices[o + 5] = d
    }
  }
  return { positions, normals, uvs, indices }
}

/** メッシュの AABB */
export function meshBounds(mesh: MeshData): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const p = mesh.positions
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < min[k]) min[k] = p[i + k]
      if (p[i + k] > max[k]) max[k] = p[i + k]
    }
  }
  return { min, max }
}

/**
 * mask[i] が true の連続区間ごとにガードレールを生成する。短い区間（minRun 未満のサンプル数）は捨てる。
 */
export function generateGuardrailRuns(samples: RoadSample[], side: -1 | 1, mask: boolean[], options: GuardrailOptions & { minRun?: number } = {}): { meshes: MeshData[]; runs: [number, number][] } {
  const minRun = options.minRun ?? 6
  const meshes: MeshData[] = []
  const runs: [number, number][] = []
  let start = -1
  const flush = (end: number) => {
    if (start >= 0 && end - start + 1 >= minRun) {
      meshes.push(generateGuardrailMesh(samples.slice(start, end + 1), side, options))
      runs.push([start, end])
    }
    start = -1
  }
  for (let i = 0; i < samples.length; i++) {
    if (mask[i]) {
      if (start < 0) start = i
    } else flush(i - 1)
  }
  flush(samples.length - 1)
  return { meshes, runs }
}

/** 路肩（砂利・土の帯）。路面の外側に width [m] の帯を少し下げて敷く */
export function generateShoulderMesh(samples: RoadSample[], side: -1 | 1, width = 1.2, drop = 0.06): MeshData {
  const n = samples.length
  const positions = new Float32Array(n * 2 * 3)
  const normals = new Float32Array(n * 2 * 3)
  const uvs = new Float32Array(n * 2 * 2)
  const indices = new Uint32Array((n - 1) * 6)
  for (let i = 0; i < n; i++) {
    const s = samples[i]
    const d0 = s.width / 2 - 0.02
    const d1 = s.width / 2 + width
    const o = i * 6
    positions[o] = s.position.x + s.right.x * d0 * side
    positions[o + 1] = s.position.y - 0.01
    positions[o + 2] = s.position.z + s.right.z * d0 * side
    positions[o + 3] = s.position.x + s.right.x * d1 * side
    positions[o + 4] = s.position.y - drop
    positions[o + 5] = s.position.z + s.right.z * d1 * side
    for (let k = 0; k < 2; k++) {
      normals[o + k * 3] = 0
      normals[o + k * 3 + 1] = 1
      normals[o + k * 3 + 2] = 0
    }
    uvs[i * 4] = 0; uvs[i * 4 + 1] = s.distance / 3
    uvs[i * 4 + 2] = 1; uvs[i * 4 + 3] = s.distance / 3
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3
    const o = i * 6
    if (side > 0) {
      indices[o] = a; indices[o + 1] = b; indices[o + 2] = c
      indices[o + 3] = b; indices[o + 4] = d; indices[o + 5] = c
    } else {
      indices[o] = a; indices[o + 1] = c; indices[o + 2] = b
      indices[o + 3] = b; indices[o + 4] = c; indices[o + 5] = d
    }
  }
  return { positions, normals, uvs, indices }
}
