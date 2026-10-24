/**
 * CoordinateTransformer: 地理座標（緯度経度 / 投影座標）とゲーム座標の相互変換。
 *
 * ゲーム座標: X = 東, Y = 上, Z = 南（m, 右手系 Y-up）。
 * ENU（East-North-Up）とは z = -north の関係。
 *
 * 緯度経度 → ENU は局所的な正距円筒近似（数 km 四方の峠なら誤差は数十 cm 以下）。
 * 本番では proj4js で JGD2011 平面直角座標系（EPSG:6669〜6687）へ投影する想定で、
 * その場合は ProjectedPosition を渡せばよい（このモジュールは proj4 に依存しない）。
 * 注意: 日本の平面直角座標系は X が北、Y が東。ProjectedPosition へ詰めるときは
 * easting = Y, northing = X と読み替えること。
 */
import type { Vec3 } from '../core/vec3'
import type { CourseOrigin, GeodeticPosition, ProjectedPosition } from '../course/types'

export interface Enu {
  east: number
  north: number
  up: number
}

const WGS84_A = 6378137
const WGS84_F = 1 / 298.257223563
const WGS84_E2 = WGS84_F * (2 - WGS84_F)
const DEG = Math.PI / 180

export const enuToGame = (e: Enu): Vec3 => ({ x: e.east, y: e.up, z: -e.north })
export const gameToEnu = (v: Vec3): Enu => ({ east: v.x, up: v.y, north: -v.z })

export function isGeodetic(p: GeodeticPosition | ProjectedPosition): p is GeodeticPosition {
  return (p as GeodeticPosition).latitude !== undefined
}

/** 緯度での子午線・卯酉線曲率半径を使った局所 ENU 変換 */
export function geodeticToEnu(p: GeodeticPosition, origin: GeodeticPosition): Enu {
  const lat0 = origin.latitude * DEG
  const sin0 = Math.sin(lat0)
  const denom = Math.sqrt(1 - WGS84_E2 * sin0 * sin0)
  const rn = WGS84_A / denom // 卯酉線曲率半径
  const rm = (WGS84_A * (1 - WGS84_E2)) / (denom * denom * denom) // 子午線曲率半径
  const dLat = (p.latitude - origin.latitude) * DEG
  const dLon = (p.longitude - origin.longitude) * DEG
  return {
    east: dLon * rn * Math.cos(lat0),
    north: dLat * rm,
    up: (p.altitude ?? 0) - (origin.altitude ?? 0),
  }
}

export function enuToGeodetic(e: Enu, origin: GeodeticPosition): GeodeticPosition {
  const lat0 = origin.latitude * DEG
  const sin0 = Math.sin(lat0)
  const denom = Math.sqrt(1 - WGS84_E2 * sin0 * sin0)
  const rn = WGS84_A / denom
  const rm = (WGS84_A * (1 - WGS84_E2)) / (denom * denom * denom)
  return {
    latitude: origin.latitude + (e.north / rm) / DEG,
    longitude: origin.longitude + (e.east / (rn * Math.cos(lat0))) / DEG,
    altitude: (origin.altitude ?? 0) + e.up,
  }
}

export function projectedToEnu(p: ProjectedPosition, origin: ProjectedPosition): Enu {
  return { east: p.easting - origin.easting, north: p.northing - origin.northing, up: (p.height ?? 0) - (origin.height ?? 0) }
}

export class CoordinateTransformer {
  readonly origin: CourseOrigin
  constructor(origin: CourseOrigin) {
    this.origin = origin
  }

  /** 元データの座標 → ゲーム座標 */
  toGame(p: GeodeticPosition | ProjectedPosition): Vec3 {
    const o = this.origin.sourcePosition
    if (!o) throw new Error('origin.sourcePosition is required for geospatial transforms')
    let enu: Enu
    if (isGeodetic(p)) {
      if (!isGeodetic(o)) throw new Error('origin must be geodetic to transform geodetic points')
      enu = geodeticToEnu(p, o)
    } else {
      if (isGeodetic(o)) throw new Error('origin must be projected to transform projected points')
      enu = projectedToEnu(p, o)
    }
    const g = enuToGame(enu)
    return { x: g.x + this.origin.local.x, y: g.y + this.origin.local.y, z: g.z + this.origin.local.z }
  }

  /** ゲーム座標 → 緯度経度（原点が緯度経度のときのみ） */
  toGeodetic(v: Vec3): GeodeticPosition {
    const o = this.origin.sourcePosition
    if (!o || !isGeodetic(o)) throw new Error('origin must be geodetic')
    const local = { x: v.x - this.origin.local.x, y: v.y - this.origin.local.y, z: v.z - this.origin.local.z }
    return enuToGeodetic(gameToEnu(local), o)
  }
}
