/**
 * GlbReader: GLB（binary glTF 2.0）を読み、ノード階層のワールド変換を適用した MeshData を取り出す。
 * Three.js に依存しない（Node のテストでも動く）。描画は Three.js の GLTFLoader、
 * 衝突判定・走行路抽出はこのリーダーの出力を使う。
 *
 * 対応: メッシュ（TRIANGLES / 非インデックス含む）、ノード TRS / matrix、複数シーン、
 *       POSITION / NORMAL / TEXCOORD_0、インデックス u8 / u16 / u32、バッファは BIN チャンクのみ。
 * 非対応: 外部 .bin / データ URI、スキニング、モーフ、Draco / meshopt 圧縮、KHR_mesh_quantization。
 */
import type { MeshData } from '../course/types'

export interface GlbMeshInstance {
  /** ノード名（未設定なら mesh 名、さらに無ければ node-<index>） */
  name: string
  nodeIndex: number
  meshIndex: number
  materialName?: string
  /** baseColorFactor（あれば） */
  baseColor?: [number, number, number, number]
  /** ワールド座標系に変換済み */
  mesh: MeshData
}

export interface GlbModel {
  generator?: string
  instances: GlbMeshInstance[]
  bounds: { min: [number, number, number]; max: [number, number, number] }
}

interface GltfAccessor {
  bufferView?: number
  byteOffset?: number
  componentType: number
  count: number
  type: string
  normalized?: boolean
}
interface GltfBufferView {
  buffer: number
  byteOffset?: number
  byteLength: number
  byteStride?: number
}
interface GltfPrimitive {
  attributes: Record<string, number>
  indices?: number
  mode?: number
  material?: number
}
interface GltfNode {
  name?: string
  mesh?: number
  children?: number[]
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}
export interface GltfJson {
  asset?: { generator?: string; version?: string }
  scene?: number
  scenes?: { nodes?: number[] }[]
  nodes?: GltfNode[]
  meshes?: { name?: string; primitives: GltfPrimitive[] }[]
  materials?: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[]
  accessors?: GltfAccessor[]
  bufferViews?: GltfBufferView[]
  buffers?: { byteLength: number; uri?: string }[]
  extensionsRequired?: string[]
}

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const TYPE_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

export class GlbParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GlbParseError'
  }
}

type Mat4 = Float64Array // column-major 16

function mat4Identity(): Mat4 {
  const m = new Float64Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}
function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
    }
  }
  return out
}
function mat4FromTrs(t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 1], s: number[] = [1, 1, 1]): Mat4 {
  const [x, y, z, w] = q
  const xx = x * x, yy = y * y, zz = z * z
  const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z
  const m = new Float64Array(16)
  m[0] = (1 - 2 * (yy + zz)) * s[0]; m[1] = 2 * (xy + wz) * s[0]; m[2] = 2 * (xz - wy) * s[0]; m[3] = 0
  m[4] = 2 * (xy - wz) * s[1]; m[5] = (1 - 2 * (xx + zz)) * s[1]; m[6] = 2 * (yz + wx) * s[1]; m[7] = 0
  m[8] = 2 * (xz + wy) * s[2]; m[9] = 2 * (yz - wx) * s[2]; m[10] = (1 - 2 * (xx + yy)) * s[2]; m[11] = 0
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1
  return m
}
/** 法線用: 3x3 部分の逆転置（非一様スケールにも対応）。列優先 9 要素 */
function normalMatrix(m: Mat4): number[] {
  // 行優先で 3x3 を取り出す
  const a = m[0], b = m[4], c = m[8]
  const d = m[1], e = m[5], f = m[9]
  const g = m[2], h = m[6], i = m[10]
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C || 1
  // 逆行列（行優先）
  const inv = [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, (c * d - a * f) / det, C / det, (b * g - a * h) / det, (a * e - b * d) / det]
  // 逆行列の転置を列優先で返す = 逆行列そのものを行優先→列優先に並べ替えずにそのまま列優先として扱う
  return inv
}

function readAccessor(json: GltfJson, bin: DataView, index: number): { data: Float32Array | Uint32Array; size: number } {
  const acc = json.accessors?.[index]
  if (!acc) throw new GlbParseError(`accessor ${index} not found`)
  const size = TYPE_SIZE[acc.type]
  if (!size) throw new GlbParseError(`unsupported accessor type ${acc.type}`)
  if (acc.bufferView === undefined) throw new GlbParseError('sparse / empty accessors are not supported')
  const view = json.bufferViews?.[acc.bufferView]
  if (!view) throw new GlbParseError(`bufferView ${acc.bufferView} not found`)
  if (view.buffer !== 0) throw new GlbParseError('only the embedded BIN buffer is supported')
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const compSize = acc.componentType === 5126 || acc.componentType === 5125 ? 4 : acc.componentType === 5123 || acc.componentType === 5122 ? 2 : 1
  const stride = view.byteStride ?? size * compSize
  const isFloat = acc.componentType === 5126
  const out = isFloat ? new Float32Array(acc.count * size) : new Uint32Array(acc.count * size)
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < size; k++) {
      const off = base + i * stride + k * compSize
      let v: number
      switch (acc.componentType) {
        case 5126: v = bin.getFloat32(off, true); break
        case 5125: v = bin.getUint32(off, true); break
        case 5123: v = bin.getUint16(off, true); break
        case 5121: v = bin.getUint8(off); break
        case 5122: v = bin.getInt16(off, true); break
        case 5120: v = bin.getInt8(off); break
        default: throw new GlbParseError(`unsupported componentType ${acc.componentType}`)
      }
      if (acc.normalized && !isFloat) {
        const max = acc.componentType === 5121 ? 255 : acc.componentType === 5123 ? 65535 : acc.componentType === 5120 ? 127 : 32767
        v = v / max
      }
      out[i * size + k] = v
    }
  }
  return { data: out, size }
}

function computeFlatNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const idx of [a, b, c]) {
      normals[idx] += nx; normals[idx + 1] += ny; normals[idx + 2] += nz
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l
  }
  return normals
}

/** GLB コンテナを分解して JSON と BIN を返す */
export function splitGlb(buffer: ArrayBuffer): { json: GltfJson; bin: DataView } {
  const dv = new DataView(buffer)
  if (buffer.byteLength < 20 || dv.getUint32(0, true) !== GLB_MAGIC) throw new GlbParseError('not a GLB file (bad magic)')
  const version = dv.getUint32(4, true)
  if (version !== 2) throw new GlbParseError(`unsupported GLB version ${version}`)
  const total = dv.getUint32(8, true)
  let offset = 12
  let json: GltfJson | null = null
  let bin: DataView | null = null
  while (offset + 8 <= Math.min(total, buffer.byteLength)) {
    const len = dv.getUint32(offset, true)
    const type = dv.getUint32(offset + 4, true)
    const start = offset + 8
    if (type === CHUNK_JSON) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len))) as GltfJson
    } else if (type === CHUNK_BIN) {
      bin = new DataView(buffer, start, len)
    }
    offset = start + len
  }
  if (!json) throw new GlbParseError('GLB has no JSON chunk')
  return { json, bin: bin ?? new DataView(new ArrayBuffer(0)) }
}

/** GLB を解析し、ワールド変換済みのメッシュ一覧を返す */
export function parseGlb(buffer: ArrayBuffer): GlbModel {
  const { json, bin } = splitGlb(buffer)
  if (json.extensionsRequired?.length) throw new GlbParseError(`required extensions not supported: ${json.extensionsRequired.join(', ')}`)
  const nodes = json.nodes ?? []
  const instances: GlbMeshInstance[] = []
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  const visit = (nodeIndex: number, parent: Mat4, depth: number) => {
    if (depth > 64) throw new GlbParseError('node hierarchy too deep (cycle?)')
    const node = nodes[nodeIndex]
    if (!node) return
    const local = node.matrix ? Float64Array.from(node.matrix) : mat4FromTrs(node.translation, node.rotation, node.scale)
    const world = mat4Multiply(parent, local)
    const meshIndex = node.mesh
    if (meshIndex !== undefined) {
      const mesh = json.meshes?.[meshIndex]
      if (!mesh) throw new GlbParseError(`mesh ${meshIndex} not found`)
      const nm = normalMatrix(world)
      for (const prim of mesh.primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue // TRIANGLES 以外は無視
        if (prim.attributes.POSITION === undefined) continue
        const pos = readAccessor(json, bin, prim.attributes.POSITION)
        const count = pos.data.length / 3
        const positions = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
          const x = pos.data[i * 3], y = pos.data[i * 3 + 1], z = pos.data[i * 3 + 2]
          const wx = world[0] * x + world[4] * y + world[8] * z + world[12]
          const wy = world[1] * x + world[5] * y + world[9] * z + world[13]
          const wz = world[2] * x + world[6] * y + world[10] * z + world[14]
          positions[i * 3] = wx; positions[i * 3 + 1] = wy; positions[i * 3 + 2] = wz
          if (wx < min[0]) min[0] = wx
          if (wy < min[1]) min[1] = wy
          if (wz < min[2]) min[2] = wz
          if (wx > max[0]) max[0] = wx
          if (wy > max[1]) max[1] = wy
          if (wz > max[2]) max[2] = wz
        }
        let indices: Uint32Array
        if (prim.indices !== undefined) {
          const idx = readAccessor(json, bin, prim.indices)
          indices = idx.data instanceof Uint32Array ? idx.data : Uint32Array.from(idx.data)
        } else {
          indices = new Uint32Array(count)
          for (let i = 0; i < count; i++) indices[i] = i
        }
        // 行列式が負（鏡像）なら巻き順を反転
        const det =
          world[0] * (world[5] * world[10] - world[9] * world[6]) -
          world[4] * (world[1] * world[10] - world[9] * world[2]) +
          world[8] * (world[1] * world[6] - world[5] * world[2])
        if (det < 0) {
          for (let i = 0; i < indices.length; i += 3) {
            const t = indices[i + 1]
            indices[i + 1] = indices[i + 2]
            indices[i + 2] = t
          }
        }
        let normals: Float32Array
        if (prim.attributes.NORMAL !== undefined) {
          const n = readAccessor(json, bin, prim.attributes.NORMAL)
          normals = new Float32Array(count * 3)
          for (let i = 0; i < count; i++) {
            const x = n.data[i * 3], y = n.data[i * 3 + 1], z = n.data[i * 3 + 2]
            // 逆転置行列（行優先 inv の転置）を適用
            let nx = nm[0] * x + nm[3] * y + nm[6] * z
            let ny = nm[1] * x + nm[4] * y + nm[7] * z
            let nz = nm[2] * x + nm[5] * y + nm[8] * z
            const l = Math.hypot(nx, ny, nz) || 1
            nx /= l; ny /= l; nz /= l
            normals[i * 3] = nx; normals[i * 3 + 1] = ny; normals[i * 3 + 2] = nz
          }
        } else {
          normals = computeFlatNormals(positions, indices)
        }
        let uvs: Float32Array | undefined
        if (prim.attributes.TEXCOORD_0 !== undefined) {
          const uv = readAccessor(json, bin, prim.attributes.TEXCOORD_0)
          uvs = uv.data instanceof Float32Array ? uv.data : Float32Array.from(uv.data)
        }
        const material = prim.material !== undefined ? json.materials?.[prim.material] : undefined
        const bc = material?.pbrMetallicRoughness?.baseColorFactor
        instances.push({
          name: node.name ?? mesh.name ?? `node-${nodeIndex}`,
          nodeIndex,
          meshIndex,
          materialName: material?.name,
          baseColor: bc && bc.length === 4 ? [bc[0], bc[1], bc[2], bc[3]] : undefined,
          mesh: { positions, normals, indices, uvs },
        })
      }
    }
    node.children?.forEach((c) => visit(c, world, depth + 1))
  }

  const sceneIndex = json.scene ?? 0
  const roots = json.scenes?.[sceneIndex]?.nodes ?? nodes.map((_, i) => i).filter((i) => !nodes.some((n) => n.children?.includes(i)))
  roots.forEach((r) => visit(r, mat4Identity(), 0))
  if (instances.length === 0) {
    min[0] = min[1] = min[2] = 0
    max[0] = max[1] = max[2] = 0
  }
  return { generator: json.asset?.generator, instances, bounds: { min, max } }
}
