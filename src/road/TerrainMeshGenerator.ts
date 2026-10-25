/**
 * TerrainMeshGenerator: 道路に追従する地形（ハイトフィールド）とそのメッシュを生成する。
 *
 * 現状は架空地形: 路肩は路面高さに追従し、離れるにつれて
 * 「中心線に最小二乗フィットした平面 + fBm ノイズ」の山肌へ遷移する。
 * 実 DEM を使う場合は createHeightFieldFromDem（GeoDataImporter 側）で HeightField を差し替える。
 */
import { fbm2 } from '../core/noise'
import { clamp, smoothstep } from '../core/vec3'
import type { HeightField, MeshData, TerrainOptions } from '../course/types'
import type { RoadSample } from './spline'

interface Plane {
  a: number
  b: number
  c: number
} // y = a*x + b*z + c

/** 最小二乗法で y = a x + b z + c をフィット */
export function fitPlane(samples: RoadSample[]): Plane {
  let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sxy = 0, szy = 0, sy = 0
  const n = samples.length
  for (const s of samples) {
    const { x, y, z } = s.position
    sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z
    sxy += x * y; szy += z * y; sy += y
  }
  // 正規方程式 [sxx sxz sx; sxz szz sz; sx sz n] [a b c]^T = [sxy szy sy]
  const m = [
    [sxx, sxz, sx, sxy],
    [sxz, szz, sz, szy],
    [sx, sz, n, sy],
  ]
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    if (Math.abs(m[col][col]) < 1e-9) return { a: 0, b: 0, c: sy / Math.max(n, 1) }
    for (let r = 0; r < 3; r++) {
      if (r === col) continue
      const f = m[r][col] / m[col][col]
      for (let k = col; k < 4; k++) m[r][k] -= f * m[col][k]
    }
  }
  return { a: m[0][3] / m[0][0], b: m[1][3] / m[1][1], c: m[2][3] / m[2][2] }
}

export interface RoadHeightFieldOptions extends TerrainOptions {
  /** 道路幅の外側に取る路肩 [m] */
  shoulder?: number
}

/** 道路に追従する架空ハイトフィールド */
export function createRoadFollowingHeightField(samples: RoadSample[], options: RoadHeightFieldOptions = {}): HeightField {
  const margin = options.margin ?? 120
  const seed = options.seed ?? 1
  const amplitude = options.amplitude ?? 14
  const shoulder = options.shoulder ?? 1.5
  const blend = options.blendDistance ?? 45
  const plane = fitPlane(samples)

  const n = samples.length
  const sx = new Float64Array(n)
  const sy = new Float64Array(n)
  const sz = new Float64Array(n)
  const sw = new Float64Array(n)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < n; i++) {
    const p = samples[i].position
    sx[i] = p.x; sy[i] = p.y; sz[i] = p.z; sw[i] = samples[i].width
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }

  const roadInfo = (x: number, z: number) => {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const dx = sx[i] - x
      const dz = sz[i] - z
      const d = dx * dx + dz * dz
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return { distance: Math.sqrt(bestD), index: best }
  }

  /**
   * 近傍サンプルの距離加重平均で「道路基準高さ」を求める。
   * ヘアピンのように別区間の道路が並走する場所でも段差ではなく滑らかな斜面になる。
   */
  const influence = blend + 20
  const roadReference = (x: number, z: number) => {
    let best = 0
    let bestD = Infinity
    let wsum = 0
    let ysum = 0
    const r2 = influence * influence
    for (let i = 0; i < n; i++) {
      const dx = sx[i] - x
      const dz = sz[i] - z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD) {
        bestD = d2
        best = i
      }
      if (d2 < r2) {
        const w = 1 / (d2 + 4)
        wsum += w
        ysum += sy[i] * w
      }
    }
    const distance = Math.sqrt(bestD)
    const y = wsum > 0 ? ysum / wsum : sy[best]
    return { distance, index: best, y }
  }

  const mountain = (x: number, z: number) => {
    const base = plane.a * x + plane.b * z + plane.c
    const large = (fbm2(x / 90, z / 90, seed, 4) - 0.5) * 2 * amplitude
    const fine = (fbm2(x / 18, z / 18, seed + 7, 3) - 0.5) * 2 * 1.2
    return base + large + fine
  }

  const getHeight = (x: number, z: number) => {
    const { distance, index, y } = roadReference(x, z)
    const edge = sw[index] / 2 + shoulder
    const roadY = y - 0.15
    if (distance <= edge) return sy[index] - 0.15
    // 山肌が道路基準から極端に離れないよう差分を制限（切土・盛土の高さ上限）
    const diff = clamp(mountain(x, z) - roadY, -28, 18)
    // 切土（山側）は急な法面、盛土（谷側）は緩い斜面にする
    const blendHere = diff > 0 ? Math.min(blend, 16) : blend
    const t = smoothstep(edge, edge + blendHere, distance)
    const nearRoad = sy[index] - 0.15
    // 路肩直外では最近傍の路面高さ、遠方では加重平均 + 山肌へ
    const baseY = nearRoad + (roadY - nearRoad) * smoothstep(edge, edge + blend * 0.6, distance)
    return baseY + diff * t
  }

  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
    getHeight,
    roadInfo,
    roadWidthAt: (index: number) => sw[Math.max(0, Math.min(n - 1, index))],
  }
}

export interface TerrainMeshOptions {
  resolution?: number
}

/** HeightField からグリッドメッシュを生成（頂点色: 勾配と標高） */
export function generateTerrainMesh(field: HeightField, options: TerrainMeshOptions = {}): MeshData {
  const res = Math.max(2, options.resolution ?? 128)
  const roadHalf = (index: number) => (field.roadWidthAt ? field.roadWidthAt(index) / 2 : 3.5)
  const cols = res + 1
  const rows = res + 1
  const positions = new Float32Array(cols * rows * 3)
  const normals = new Float32Array(cols * rows * 3)
  const colors = new Float32Array(cols * rows * 3)
  const uvs = new Float32Array(cols * rows * 2)
  const indices = new Uint32Array(res * res * 6)
  const dx = (field.maxX - field.minX) / res
  const dz = (field.maxZ - field.minZ) / res

  let minY = Infinity, maxY = -Infinity
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = field.minX + c * dx
      const z = field.minZ + r * dz
      const y = field.getHeight(x, z)
      const i = (r * cols + c) * 3
      positions[i] = x; positions[i + 1] = y; positions[i + 2] = z
      uvs[(r * cols + c) * 2] = c / res
      uvs[(r * cols + c) * 2 + 1] = r / res
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  // 法線: 隣接頂点の差分
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const get = (rr: number, cc: number) => positions[(clamp(rr, 0, rows - 1) * cols + clamp(cc, 0, cols - 1)) * 3 + 1]
      const hl = get(r, c - 1), hr = get(r, c + 1), hd = get(r - 1, c), hu = get(r + 1, c)
      let nx = (hl - hr) / (2 * dx)
      let nz = (hd - hu) / (2 * dz)
      let ny = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const i = (r * cols + c) * 3
      normals[i] = nx; normals[i + 1] = ny; normals[i + 2] = nz
      // 色: 草地（ノイズで 2 色を混ぜる）→ 土（やや急）→ 岩（急斜面）。路肩は砂利、高所は少し明るく乾いた色
      const slope = 1 - ny
      const x = positions[i]
      const z = positions[i + 2]
      const h = (positions[i + 1] - minY) / Math.max(maxY - minY, 1)
      const n1 = fbm2(x / 23, z / 23, 31, 3)
      const n2 = fbm2(x / 7, z / 7, 77, 2)
      const grassA = [0.24, 0.41, 0.17]
      const grassB = [0.36, 0.5, 0.2]
      const dry = [0.5, 0.48, 0.26]
      const dirt = [0.42, 0.33, 0.22]
      const rock = [0.46, 0.44, 0.41]
      const gravel = [0.52, 0.5, 0.45]
      let cr = grassA[0] + (grassB[0] - grassA[0]) * n1
      let cg = grassA[1] + (grassB[1] - grassA[1]) * n1
      let cb = grassA[2] + (grassB[2] - grassA[2]) * n1
      const dryT = smoothstep(0.55, 0.95, h) * 0.5 * n2
      cr += (dry[0] - cr) * dryT; cg += (dry[1] - cg) * dryT; cb += (dry[2] - cb) * dryT
      const dirtT = smoothstep(0.2, 0.38, slope + n2 * 0.08)
      cr += (dirt[0] - cr) * dirtT; cg += (dirt[1] - cg) * dirtT; cb += (dirt[2] - cb) * dirtT
      const rockT = smoothstep(0.42, 0.62, slope + n2 * 0.06)
      cr += (rock[0] - cr) * rockT; cg += (rock[1] - cg) * rockT; cb += (rock[2] - cb) * rockT
      const info = field.roadInfo(x, z)
      const shoulderT = 1 - smoothstep(roadHalf(info.index) + 0.3, roadHalf(info.index) + 3.2, info.distance)
      cr += (gravel[0] - cr) * shoulderT; cg += (gravel[1] - cg) * shoulderT; cb += (gravel[2] - cb) * shoulderT
      // 微小な明暗のばらつき
      const v = 0.92 + n2 * 0.16
      colors[i] = cr * v
      colors[i + 1] = cg * v
      colors[i + 2] = cb * v
    }
  }
  let k = 0
  for (let r = 0; r < res; r++) {
    for (let c = 0; c < res; c++) {
      const a = r * cols + c
      const b = a + 1
      const cc = a + cols
      const d = cc + 1
      // 上から見て反時計回り（法線 +Y）
      indices[k++] = a; indices[k++] = cc; indices[k++] = b
      indices[k++] = b; indices[k++] = cc; indices[k++] = d
    }
  }
  return { positions, normals, indices, uvs, colors }
}
