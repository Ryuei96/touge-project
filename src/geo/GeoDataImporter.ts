/**
 * GeoDataImporter: 道路線形（GeoJSON LineString）と DEM（標高グリッド）から
 * CourseDefinition（source = 'geospatial'）を生成する。
 *
 * ゲーム本体には依存しない。ネットワーク取得（国土地理院 DEM タイル・OSM 等）は
 * このモジュールの外（RoadAlignmentSource / DemSource の生成側）で行う前提。
 * 現時点で実装済みなのは以下のオフライン経路のみ:
 *   GeoJSON LineString + 配列 DEM → CourseDefinition
 */
import { distanceXZ, type Vec3 } from '../core/vec3'
import type { Attribution, CourseDefinition, GeodeticPosition, PlacedAsset } from '../course/types'
import type { CenterlinePoint } from '../road/spline'
import { CoordinateTransformer, geodeticToEnu } from './CoordinateTransformer'

// --- 入力型 -------------------------------------------------------------

export interface GeoJsonLineString {
  type: 'LineString'
  /** [lon, lat, (alt)] */
  coordinates: number[][]
}
export interface GeoJsonFeature {
  type: 'Feature'
  geometry: GeoJsonLineString
  properties?: Record<string, unknown> | null
}
export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

export type RoadAlignmentSource =
  | { kind: 'geojson'; data: GeoJsonFeatureCollection | GeoJsonFeature | GeoJsonLineString; attribution: Attribution }
  | { kind: 'gsi-road-api'; bbox: [number, number, number, number]; attribution: Attribution } // 未実装

/** 規則格子 DEM（行 = 北→南, 列 = 西→東） */
export interface DemGrid {
  originLat: number // 北西コーナーの緯度
  originLon: number // 北西コーナーの経度
  dLat: number // 行あたりの緯度差（負）
  dLon: number // 列あたりの経度差（正）
  rows: number
  cols: number
  heights: Float32Array
  noData?: number
  attribution: Attribution
}

export type DemSource =
  | { kind: 'grid'; grid: DemGrid }
  | { kind: 'gsi-dem-tile'; zoom: number; x: number; y: number } // 未実装（国土地理院標高タイル）

export interface ImportedRoad {
  points: GeodeticPosition[]
  widths?: number[]
  attribution: Attribution
  properties?: Record<string, unknown>
}

export class GeoSourceNotImplementedError extends Error {
  constructor(kind: string) {
    super(`geo source "${kind}" is not implemented (online fetch is out of scope for v0.3)`)
    this.name = 'GeoSourceNotImplementedError'
  }
}

// --- DEM ---------------------------------------------------------------

/** 双一次補間で標高を取得。範囲外は最近傍にクランプ */
export function sampleDem(dem: DemGrid, lat: number, lon: number): number {
  const fr = (lat - dem.originLat) / dem.dLat
  const fc = (lon - dem.originLon) / dem.dLon
  const r0 = Math.min(dem.rows - 1, Math.max(0, Math.floor(fr)))
  const c0 = Math.min(dem.cols - 1, Math.max(0, Math.floor(fc)))
  const r1 = Math.min(dem.rows - 1, r0 + 1)
  const c1 = Math.min(dem.cols - 1, c0 + 1)
  const tr = Math.min(1, Math.max(0, fr - r0))
  const tc = Math.min(1, Math.max(0, fc - c0))
  const h = (r: number, c: number) => dem.heights[r * dem.cols + c]
  const top = h(r0, c0) + (h(r0, c1) - h(r0, c0)) * tc
  const bottom = h(r1, c0) + (h(r1, c1) - h(r1, c0)) * tc
  return top + (bottom - top) * tr
}

// --- インポート ------------------------------------------------------------

function lineStringOf(data: RoadAlignmentSource & { kind: 'geojson' }): GeoJsonLineString {
  const d = data.data
  if (d.type === 'LineString') return d
  if (d.type === 'Feature') return d.geometry
  const f = d.features.find((f) => f.geometry.type === 'LineString')
  if (!f) throw new Error('FeatureCollection has no LineString feature')
  return f.geometry
}

export class GeoDataImporter {
  async importRoadAlignment(source: RoadAlignmentSource): Promise<ImportedRoad> {
    if (source.kind !== 'geojson') throw new GeoSourceNotImplementedError(source.kind)
    const line = lineStringOf(source)
    if (line.coordinates.length < 2) throw new Error('LineString needs at least 2 coordinates')
    const points: GeodeticPosition[] = line.coordinates.map(([lon, lat, alt]) => ({ latitude: lat, longitude: lon, altitude: alt }))
    const props = source.data.type === 'Feature' ? source.data.properties ?? undefined : undefined
    const width = typeof props?.width === 'number' ? (props.width as number) : undefined
    return { points, widths: width !== undefined ? points.map(() => width) : undefined, attribution: source.attribution, properties: props }
  }

  async importDem(source: DemSource): Promise<DemGrid> {
    if (source.kind !== 'grid') throw new GeoSourceNotImplementedError(source.kind)
    return source.grid
  }

  /**
   * 線形 + DEM → CourseDefinition。
   * - 原点は線形の始点（緯度経度）。
   * - 標高は DEM があれば DEM から、なければ座標の altitude から取る。
   * - 点間隔が狭すぎる点は間引く（スプラインの安定性のため）。
   */
  buildCourseDefinition(
    road: ImportedRoad,
    dem: DemGrid | undefined,
    options: { id: string; name: string; defaultWidth?: number; minPointSpacing?: number; assets?: PlacedAsset[]; description?: string },
  ): CourseDefinition {
    const origin = road.points[0]
    const originAlt = dem ? sampleDem(dem, origin.latitude, origin.longitude) : origin.altitude ?? 0
    const transformer = new CoordinateTransformer({
      local: { x: 0, y: 0, z: 0 },
      sourceCrs: 'EPSG:4326',
      sourcePosition: { latitude: origin.latitude, longitude: origin.longitude, altitude: originAlt },
      verticalDatum: dem ? 'JGD2011' : 'ellipsoid',
    })
    const minSpacing = options.minPointSpacing ?? 8
    const centerline: CenterlinePoint[] = []
    let last: Vec3 | null = null
    road.points.forEach((p, i) => {
      const alt = dem ? sampleDem(dem, p.latitude, p.longitude) : p.altitude ?? 0
      const g = transformer.toGame({ latitude: p.latitude, longitude: p.longitude, altitude: alt })
      const isLast = i === road.points.length - 1
      if (last && !isLast && distanceXZ(last, g) < minSpacing) return
      centerline.push({ ...g, width: road.widths?.[i] })
      last = g
    })
    const fictional = road.attribution.fictional || (dem?.attribution.fictional ?? false)
    return {
      id: options.id,
      name: options.name,
      description: options.description,
      source: 'geospatial',
      origin: transformer.origin,
      attribution: {
        ...road.attribution,
        fictional,
        notes: [road.attribution.notes, dem ? `DEM: ${dem.attribution.source} (${dem.attribution.license})` : undefined].filter(Boolean).join(' / '),
      },
      centerline,
      defaultWidth: options.defaultWidth ?? 6,
      elevation: { mode: dem ? 'dem' : 'embedded', demSource: dem?.attribution.source },
      assets: options.assets ?? [],
    }
  }
}

/** 緯度経度の折れ線の ENU 上の長さ [m]（検証用） */
export function alignmentLengthMeters(points: GeodeticPosition[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    const e = geodeticToEnu(points[i], points[i - 1])
    len += Math.hypot(e.east, e.north)
  }
  return len
}
