/**
 * PointCloudImporter: 点群ファイル（PLY / LAS / XYZ テキスト）を読み、ゲーム座標の点群にする。
 * Three.js 非依存。描画は scenery/PointCloudLayer が THREE.Points で行う。
 *
 * 対応形式
 *   PLY : ascii / binary_little_endian。x y z と任意の red green blue (uchar) / nx ny nz
 *   LAS : 1.2 〜 1.4 の非圧縮（Point Data Record Format 0〜10）。XYZ スケール・オフセット適用、RGB があれば色
 *   XYZ : 1 行 "x y z [r g b]" のテキスト（区切りは空白またはカンマ）
 * 非対応: LAZ（圧縮）。laz-perf 等で事前に LAS へ展開するか、将来 wasm を導入する。
 */
import type { CoordinateTransformer } from './CoordinateTransformer'

export interface PointCloud {
  count: number
  /** xyz の並び */
  positions: Float32Array
  /** rgb 0..1 の並び（無ければ undefined） */
  colors?: Float32Array
  bounds: { min: [number, number, number]; max: [number, number, number] }
  /** 元データの座標参照系（判れば） */
  crs?: string
  source?: string
}

export class PointCloudParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PointCloudParseError'
  }
}

function computeBounds(p: Float32Array): PointCloud['bounds'] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < min[k]) min[k] = p[i + k]
      if (p[i + k] > max[k]) max[k] = p[i + k]
    }
  }
  if (p.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] }
  return { min, max }
}

// ---------------------------------------------------------------- PLY

interface PlyProperty {
  name: string
  type: string
  listCount?: string
}

const PLY_SIZE: Record<string, number> = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 }

function readPlyValue(dv: DataView, off: number, type: string): number {
  switch (type) {
    case 'char': case 'int8': return dv.getInt8(off)
    case 'uchar': case 'uint8': return dv.getUint8(off)
    case 'short': case 'int16': return dv.getInt16(off, true)
    case 'ushort': case 'uint16': return dv.getUint16(off, true)
    case 'int': case 'int32': return dv.getInt32(off, true)
    case 'uint': case 'uint32': return dv.getUint32(off, true)
    case 'float': case 'float32': return dv.getFloat32(off, true)
    case 'double': case 'float64': return dv.getFloat64(off, true)
    default: throw new PointCloudParseError(`unsupported PLY type ${type}`)
  }
}

export function parsePly(buffer: ArrayBuffer): PointCloud {
  const bytes = new Uint8Array(buffer)
  const headerEnd = (() => {
    const marker = new TextEncoder().encode('end_header')
    for (let i = 0; i + marker.length <= bytes.length; i++) {
      let ok = true
      for (let k = 0; k < marker.length; k++) if (bytes[i + k] !== marker[k]) { ok = false; break }
      if (ok) {
        let j = i + marker.length
        while (j < bytes.length && bytes[j] !== 0x0a) j++
        return j + 1
      }
    }
    return -1
  })()
  if (headerEnd < 0) throw new PointCloudParseError('PLY: end_header not found')
  const header = new TextDecoder().decode(bytes.subarray(0, headerEnd))
  if (!header.startsWith('ply')) throw new PointCloudParseError('PLY: bad magic')
  const lines = header.split(/\r?\n/)
  let format = ''
  let vertexCount = 0
  const props: PlyProperty[] = []
  let inVertex = false
  const otherElements: { name: string; count: number; props: PlyProperty[] }[] = []
  let current: { name: string; count: number; props: PlyProperty[] } | null = null
  for (const line of lines) {
    const t = line.trim().split(/\s+/)
    if (t[0] === 'format') format = t[1]
    else if (t[0] === 'element') {
      inVertex = t[1] === 'vertex'
      if (inVertex) vertexCount = Number(t[2])
      else {
        current = { name: t[1], count: Number(t[2]), props: [] }
        otherElements.push(current)
      }
    } else if (t[0] === 'property') {
      const prop: PlyProperty = t[1] === 'list' ? { name: t[4], type: t[3], listCount: t[2] } : { name: t[2], type: t[1] }
      if (inVertex) props.push(prop)
      else current?.props.push(prop)
    }
  }
  const ix = props.findIndex((p) => p.name === 'x')
  const iy = props.findIndex((p) => p.name === 'y')
  const iz = props.findIndex((p) => p.name === 'z')
  if (ix < 0 || iy < 0 || iz < 0) throw new PointCloudParseError('PLY: vertex element needs x, y, z')
  const ir = props.findIndex((p) => p.name === 'red' || p.name === 'r')
  const ig = props.findIndex((p) => p.name === 'green' || p.name === 'g')
  const ib = props.findIndex((p) => p.name === 'blue' || p.name === 'b')
  const hasColor = ir >= 0 && ig >= 0 && ib >= 0
  const positions = new Float32Array(vertexCount * 3)
  const colors = hasColor ? new Float32Array(vertexCount * 3) : undefined
  const colorScale = (p: PlyProperty) => (p.type === 'uchar' || p.type === 'uint8' ? 1 / 255 : p.type === 'ushort' || p.type === 'uint16' ? 1 / 65535 : 1)

  if (format === 'ascii') {
    const body = new TextDecoder().decode(bytes.subarray(headerEnd))
    const rows = body.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (rows.length < vertexCount) throw new PointCloudParseError(`PLY: expected ${vertexCount} vertices, got ${rows.length}`)
    for (let i = 0; i < vertexCount; i++) {
      const v = rows[i].trim().split(/\s+/).map(Number)
      positions[i * 3] = v[ix]; positions[i * 3 + 1] = v[iy]; positions[i * 3 + 2] = v[iz]
      if (colors) {
        colors[i * 3] = v[ir] * colorScale(props[ir]); colors[i * 3 + 1] = v[ig] * colorScale(props[ig]); colors[i * 3 + 2] = v[ib] * colorScale(props[ib])
      }
    }
  } else if (format === 'binary_little_endian') {
    if (props.some((p) => p.listCount)) throw new PointCloudParseError('PLY: list properties on vertex are not supported')
    const dv = new DataView(buffer)
    const stride = props.reduce((a, p) => a + PLY_SIZE[p.type], 0)
    const offsets: number[] = []
    let o = 0
    for (const p of props) {
      offsets.push(o)
      o += PLY_SIZE[p.type]
    }
    if (headerEnd + stride * vertexCount > buffer.byteLength) throw new PointCloudParseError('PLY: truncated vertex data')
    for (let i = 0; i < vertexCount; i++) {
      const base = headerEnd + i * stride
      positions[i * 3] = readPlyValue(dv, base + offsets[ix], props[ix].type)
      positions[i * 3 + 1] = readPlyValue(dv, base + offsets[iy], props[iy].type)
      positions[i * 3 + 2] = readPlyValue(dv, base + offsets[iz], props[iz].type)
      if (colors) {
        colors[i * 3] = readPlyValue(dv, base + offsets[ir], props[ir].type) * colorScale(props[ir])
        colors[i * 3 + 1] = readPlyValue(dv, base + offsets[ig], props[ig].type) * colorScale(props[ig])
        colors[i * 3 + 2] = readPlyValue(dv, base + offsets[ib], props[ib].type) * colorScale(props[ib])
      }
    }
  } else {
    throw new PointCloudParseError(`PLY: unsupported format ${format} (ascii / binary_little_endian only)`)
  }
  return { count: vertexCount, positions, colors, bounds: computeBounds(positions), source: 'ply' }
}

// ---------------------------------------------------------------- LAS

export interface LasHeaderInfo {
  version: string
  pointFormat: number
  pointCount: number
  recordLength: number
  scale: [number, number, number]
  offset: [number, number, number]
}

export function readLasHeader(buffer: ArrayBuffer): LasHeaderInfo & { dataOffset: number } {
  const dv = new DataView(buffer)
  const sig = new TextDecoder().decode(new Uint8Array(buffer, 0, 4))
  if (sig !== 'LASF') throw new PointCloudParseError('LAS: bad signature')
  const major = dv.getUint8(24)
  const minor = dv.getUint8(25)
  const dataOffset = dv.getUint32(96, true)
  const pointFormatRaw = dv.getUint8(104)
  const pointFormat = pointFormatRaw & 0x3f
  if (pointFormatRaw & 0x80) throw new PointCloudParseError('LAS: LAZ (compressed) is not supported; decompress to LAS first')
  const recordLength = dv.getUint16(105, true)
  let pointCount = dv.getUint32(107, true)
  if (major === 1 && minor >= 4 && pointCount === 0) {
    pointCount = Number(dv.getBigUint64(247, true))
  }
  const scale: [number, number, number] = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)]
  const offset: [number, number, number] = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)]
  return { version: `${major}.${minor}`, pointFormat, pointCount, recordLength, scale, offset, dataOffset }
}

/** 点フォーマットごとの RGB フィールド先頭オフセット（無ければ -1） */
function lasRgbOffset(format: number): number {
  switch (format) {
    case 2: return 20
    case 3: return 28
    case 5: return 28
    case 7: return 30
    case 8: return 30
    case 10: return 30
    default: return -1
  }
}

export interface LasOptions {
  /** 読み込む最大点数（それ以上は等間隔に間引く） */
  maxPoints?: number
}

export function parseLas(buffer: ArrayBuffer, options: LasOptions = {}): PointCloud {
  const h = readLasHeader(buffer)
  const dv = new DataView(buffer)
  const maxPoints = options.maxPoints ?? Infinity
  const stride = Math.max(1, Math.ceil(h.pointCount / maxPoints))
  const count = Math.floor((h.pointCount + stride - 1) / stride)
  const positions = new Float32Array(count * 3)
  const rgbOff = lasRgbOffset(h.pointFormat)
  const colors = rgbOff >= 0 ? new Float32Array(count * 3) : undefined
  let k = 0
  for (let i = 0; i < h.pointCount; i += stride) {
    const base = h.dataOffset + i * h.recordLength
    if (base + 12 > buffer.byteLength) throw new PointCloudParseError('LAS: truncated point data')
    positions[k * 3] = dv.getInt32(base, true) * h.scale[0] + h.offset[0]
    positions[k * 3 + 1] = dv.getInt32(base + 4, true) * h.scale[1] + h.offset[1]
    positions[k * 3 + 2] = dv.getInt32(base + 8, true) * h.scale[2] + h.offset[2]
    if (colors) {
      colors[k * 3] = dv.getUint16(base + rgbOff, true) / 65535
      colors[k * 3 + 1] = dv.getUint16(base + rgbOff + 2, true) / 65535
      colors[k * 3 + 2] = dv.getUint16(base + rgbOff + 4, true) / 65535
    }
    k++
  }
  return { count, positions, colors, bounds: computeBounds(positions), source: `las ${h.version} pdrf ${h.pointFormat}` }
}

// ---------------------------------------------------------------- XYZ テキスト

export function parseXyzText(text: string): PointCloud {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  const positions = new Float32Array(rows.length * 3)
  let colors: Float32Array | undefined
  rows.forEach((row, i) => {
    const v = row.split(/[\s,]+/).map(Number)
    if (v.length < 3 || v.slice(0, 3).some((x) => Number.isNaN(x))) throw new PointCloudParseError(`XYZ: bad row ${i + 1}: "${row}"`)
    positions[i * 3] = v[0]; positions[i * 3 + 1] = v[1]; positions[i * 3 + 2] = v[2]
    if (v.length >= 6) {
      colors ??= new Float32Array(rows.length * 3)
      const scale = Math.max(v[3], v[4], v[5]) > 1 ? 1 / 255 : 1
      colors[i * 3] = v[3] * scale; colors[i * 3 + 1] = v[4] * scale; colors[i * 3 + 2] = v[5] * scale
    }
  })
  return { count: rows.length, positions, colors, bounds: computeBounds(positions), source: 'xyz' }
}

// ---------------------------------------------------------------- 変換

export interface PointCloudTransformOptions {
  /** 点群の座標が投影座標（easting, northing, height）のとき: CourseOrigin 経由で変換 */
  transformer?: CoordinateTransformer
  /** 点群の軸順。'ENU' = (east, north, up), 'XYZ-game' = 既にゲーム座標 */
  axes?: 'ENU' | 'game'
  /** 日本の平面直角座標系の CSV/LAS は X=北, Y=東 の場合がある */
  swapXY?: boolean
  maxPoints?: number
}

/** 点群をゲーム座標へ変換（必要なら間引く） */
export function toGamePointCloud(cloud: PointCloud, options: PointCloudTransformOptions = {}): PointCloud {
  const stride = options.maxPoints ? Math.max(1, Math.ceil(cloud.count / options.maxPoints)) : 1
  const count = Math.floor((cloud.count + stride - 1) / stride)
  const positions = new Float32Array(count * 3)
  const colors = cloud.colors ? new Float32Array(count * 3) : undefined
  let k = 0
  for (let i = 0; i < cloud.count; i += stride) {
    let a = cloud.positions[i * 3]
    let b = cloud.positions[i * 3 + 1]
    const c = cloud.positions[i * 3 + 2]
    if (options.swapXY) [a, b] = [b, a]
    let x: number, y: number, z: number
    if (options.transformer) {
      const g = options.transformer.toGame({ easting: a, northing: b, height: c })
      x = g.x; y = g.y; z = g.z
    } else if (options.axes === 'game') {
      x = a; y = b; z = c
    } else {
      x = a; y = c; z = -b
    }
    positions[k * 3] = x; positions[k * 3 + 1] = y; positions[k * 3 + 2] = z
    if (colors && cloud.colors) {
      colors[k * 3] = cloud.colors[i * 3]; colors[k * 3 + 1] = cloud.colors[i * 3 + 1]; colors[k * 3 + 2] = cloud.colors[i * 3 + 2]
    }
    k++
  }
  return { count, positions, colors, bounds: computeBounds(positions), crs: 'game', source: cloud.source }
}

/** 拡張子から形式を判別して解析 */
export function parsePointCloud(uri: string, buffer: ArrayBuffer, options: LasOptions = {}): PointCloud {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'ply') return parsePly(buffer)
  if (ext === 'las') return parseLas(buffer, options)
  if (ext === 'laz') throw new PointCloudParseError('LAZ is not supported yet')
  if (ext === 'xyz' || ext === 'txt' || ext === 'csv') return parseXyzText(new TextDecoder().decode(buffer))
  throw new PointCloudParseError(`unknown point cloud format: ${uri}`)
}
