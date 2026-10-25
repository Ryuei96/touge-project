/**
 * CityGmlImporter: PLATEAU などの CityGML（建築物 bldg:Building）から建物メッシュを作る。
 * Three.js 非依存。
 *
 * 対応: LOD1（bldg:lod1Solid）と LOD2（bldg:lod2Solid / boundedBy の各面）の gml:posList。
 *       座標は PLATEAU 標準の EPSG:6697（緯度 経度 標高 の順）を既定とし、CoordinateTransformer でゲーム座標へ。
 * 非対応: テクスチャ（app:appearance）、LOD3 以上の細部、gml:LinearRing の interior（穴）
 *
 * 多角形の三角形化は面の法線に投影した 2D で ear clipping。LOD1 の屋根・床は凸でない場合があるので必要。
 */
import { XMLParser } from 'fast-xml-parser'
import type { Vec3 } from '../core/vec3'
import type { MeshData } from '../course/types'
import { CoordinateTransformer } from './CoordinateTransformer'

export interface CityGmlBuilding {
  id: string
  name?: string
  measuredHeight?: number
  usage?: string
  /** ゲーム座標のメッシュ */
  mesh: MeshData
  /** 底面中心（ゲーム座標） */
  center: Vec3
  footprintArea: number
}

export interface CityGmlImportOptions {
  /** 緯度経度→ゲーム座標。省略時は最初の建物の最初の点を原点にする */
  transformer?: CoordinateTransformer
  /** posList の並び。PLATEAU は 'latlonh' */
  order?: 'latlonh' | 'lonlath'
  /** 読み込む建物数の上限 */
  maxBuildings?: number
  /** 原点からこの距離 [m] を超える建物は捨てる */
  maxDistance?: number
}

export interface CityGmlImportResult {
  buildings: CityGmlBuilding[]
  /** 全建物を結合したメッシュ（描画・衝突用） */
  merged: MeshData
  transformer: CoordinateTransformer
  skipped: number
}

export class CityGmlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CityGmlParseError'
  }
}

type Node = Record<string, unknown>

/** 任意の深さから名前（名前空間接頭辞を除いた末尾一致）で要素を集める */
function collect(node: unknown, localName: string, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 60 || node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const n of node) collect(n, localName, out, depth + 1)
    return out
  }
  for (const [key, value] of Object.entries(node as Node)) {
    const local = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key
    if (local === localName) {
      if (Array.isArray(value)) out.push(...value)
      else out.push(value)
    } else {
      collect(value, localName, out, depth + 1)
    }
  }
  return out
}

function textOf(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (typeof v === 'object' && '#text' in (v as Node)) return String((v as Node)['#text'])
  return undefined
}

function attrOf(v: unknown, name: string): string | undefined {
  if (v && typeof v === 'object') {
    const a = (v as Node)[`@_${name}`]
    if (a !== undefined) return String(a)
  }
  return undefined
}

/** posList 文字列 → 3D 点列 */
export function parsePosList(text: string): [number, number, number][] {
  const nums = text.trim().split(/\s+/).map(Number)
  if (nums.length % 3 !== 0 || nums.some((n) => Number.isNaN(n))) throw new CityGmlParseError('posList must be triples of numbers')
  const pts: [number, number, number][] = []
  for (let i = 0; i < nums.length; i += 3) pts.push([nums[i], nums[i + 1], nums[i + 2]])
  // 閉じている場合は末尾を落とす
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1]
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) pts.pop()
  }
  return pts
}

/** 平面多角形（3D）を ear clipping で三角形化。返すのは頂点インデックス */
export function triangulatePolygon(points: Vec3[]): number[] {
  const n = points.length
  if (n < 3) return []
  if (n === 3) return [0, 1, 2]
  // 法線（Newell）
  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n]
    nx += (a.y - b.y) * (a.z + b.z)
    ny += (a.z - b.z) * (a.x + b.x)
    nz += (a.x - b.x) * (a.y + b.y)
  }
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz)
  // 最大成分の軸を落として 2D へ
  const to2d = (p: Vec3): [number, number] => (ax >= ay && ax >= az ? [p.y, p.z] : ay >= az ? [p.z, p.x] : [p.x, p.y])
  const pts2 = points.map(to2d)
  // 法線が落とした軸の負方向なら向きが反転するので符号で補正
  const dominant = ax >= ay && ax >= az ? nx : ay >= az ? ny : nz
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = pts2[i], b = pts2[(i + 1) % n]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const ccw = area > 0
  const idx = Array.from({ length: n }, (_, i) => i)
  if (!ccw) idx.reverse()
  const tris: number[] = []
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const inside = (p: [number, number], a: [number, number], b: [number, number], c: [number, number]) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0
  let guard = 0
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length]
      const a = pts2[i0], b = pts2[i1], c = pts2[i2]
      if (cross(a, b, c) <= 1e-12) continue // 凹頂点
      let ear = true
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue
        if (inside(pts2[j], a, b, c)) { ear = false; break }
      }
      if (!ear) continue
      tris.push(i0, i1, i2)
      idx.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) {
      // 退化（自己交差など）: 扇状に割って終了
      for (let i = 1; i < idx.length - 1; i++) tris.push(idx[0], idx[i], idx[i + 1])
      break
    }
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2])
  // 元の法線方向（dominant の符号）に合わせて巻き順を揃える
  if (dominant < 0) {
    for (let i = 0; i < tris.length; i += 3) {
      const t = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = t
    }
  }
  return tris
}

function buildMesh(polygons: Vec3[][]): MeshData {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (const poly of polygons) {
    const tris = triangulatePolygon(poly)
    if (tris.length === 0) continue
    // 面法線
    let nx = 0, ny = 0, nz = 0
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      nx += (a.y - b.y) * (a.z + b.z)
      ny += (a.z - b.z) * (a.x + b.x)
      nz += (a.x - b.x) * (a.y + b.y)
    }
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    const base = positions.length / 3
    for (const p of poly) {
      positions.push(p.x, p.y, p.z)
      normals.push(nx, ny, nz)
    }
    for (const t of tris) indices.push(base + t)
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) }
}

export function mergeMeshData(meshes: MeshData[]): MeshData {
  const vcount = meshes.reduce((a, m) => a + m.positions.length / 3, 0)
  const icount = meshes.reduce((a, m) => a + m.indices.length, 0)
  const positions = new Float32Array(vcount * 3)
  const normals = new Float32Array(vcount * 3)
  const indices = new Uint32Array(icount)
  let vo = 0, io = 0
  for (const m of meshes) {
    positions.set(m.positions, vo * 3)
    normals.set(m.normals, vo * 3)
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + vo
    vo += m.positions.length / 3
    io += m.indices.length
  }
  return { positions, normals, indices }
}

/** CityGML テキストから建物を抽出し、ゲーム座標のメッシュにする */
export function importCityGml(xml: string, options: CityGmlImportOptions = {}): CityGmlImportResult {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: false, isArray: (name) => /(^|:)(Building|surfaceMember|posList|cityObjectMember)$/.test(name) })
  let doc: unknown
  try {
    doc = parser.parse(xml)
  } catch (e) {
    throw new CityGmlParseError(`XML parse failed: ${e instanceof Error ? e.message : String(e)}`)
  }
  const buildingsRaw = collect(doc, 'Building')
  if (buildingsRaw.length === 0) throw new CityGmlParseError('no bldg:Building found')
  const order = options.order ?? 'latlonh'
  const toGeodetic = (p: [number, number, number]) => (order === 'latlonh' ? { latitude: p[0], longitude: p[1], altitude: p[2] } : { latitude: p[1], longitude: p[0], altitude: p[2] })

  let transformer = options.transformer
  if (!transformer) {
    const first = collect(buildingsRaw[0], 'posList')[0]
    const firstPts = parsePosList(textOf(first) ?? '')
    if (firstPts.length === 0) throw new CityGmlParseError('first building has no posList')
    const g = toGeodetic(firstPts[0])
    transformer = new CoordinateTransformer({ local: { x: 0, y: 0, z: 0 }, sourceCrs: 'EPSG:6697', sourcePosition: { ...g, altitude: g.altitude ?? 0 }, verticalDatum: 'JGD2011' })
  }

  const buildings: CityGmlBuilding[] = []
  let skipped = 0
  const max = options.maxBuildings ?? Infinity
  for (const b of buildingsRaw) {
    if (buildings.length >= max) break
    // LOD2 があればそれを、無ければ LOD1 を使う
    const lod2 = collect(b, 'lod2Solid')
    const lod1 = collect(b, 'lod1Solid')
    const lod2Multi = collect(b, 'lod2MultiSurface')
    const source = lod2.length ? lod2 : lod2Multi.length ? lod2Multi : lod1
    const posLists = collect(source, 'posList')
    if (posLists.length === 0) {
      skipped++
      continue
    }
    const polygons: Vec3[][] = []
    for (const pl of posLists) {
      const text = textOf(pl)
      if (!text) continue
      const pts = parsePosList(text).map((p) => transformer!.toGame(toGeodetic(p)))
      if (pts.length >= 3) polygons.push(pts)
    }
    if (polygons.length === 0) {
      skipped++
      continue
    }
    const mesh = buildMesh(polygons)
    // 底面中心: 最も低い頂点群の平均
    let minY = Infinity
    for (let i = 1; i < mesh.positions.length; i += 3) minY = Math.min(minY, mesh.positions[i])
    let cx = 0, cz = 0, cnt = 0
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (mesh.positions[i + 1] - minY < 0.5) {
        cx += mesh.positions[i]; cz += mesh.positions[i + 2]; cnt++
      }
    }
    const center = { x: cnt ? cx / cnt : 0, y: minY, z: cnt ? cz / cnt : 0 }
    if (options.maxDistance !== undefined && Math.hypot(center.x, center.z) > options.maxDistance) {
      skipped++
      continue
    }
    // 底面積: 最下面ポリゴンの面積（近似: 最低高さの面）
    let footprintArea = 0
    for (const poly of polygons) {
      if (poly.every((p) => p.y - minY < 0.5)) {
        let a = 0
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i], q = poly[(i + 1) % poly.length]
          a += p.x * q.z - q.x * p.z
        }
        footprintArea = Math.max(footprintArea, Math.abs(a) / 2)
      }
    }
    const heightText = textOf(collect(b, 'measuredHeight')[0])
    buildings.push({
      id: attrOf(b, 'gml:id') ?? `building-${buildings.length}`,
      name: textOf(collect(b, 'name')[0]),
      measuredHeight: heightText !== undefined ? Number(heightText) : undefined,
      usage: textOf(collect(b, 'usage')[0]),
      mesh,
      center,
      footprintArea,
    })
  }
  return { buildings, merged: mergeMeshData(buildings.map((b) => b.mesh)), transformer, skipped }
}
