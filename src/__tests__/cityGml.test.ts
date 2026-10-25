import { describe, expect, it } from 'vitest'
import { CityGmlParseError, importCityGml, parsePosList, triangulatePolygon } from '../geo/CityGmlImporter'

/** 緯度経度で四角い建物（LOD1 ソリッド）を書く。lat/lon は小さなオフセット（m 換算） */
function buildingXml(id: string, lat0: number, lon0: number, w: number, d: number, h: number, height?: number): string {
  const mLat = 1 / 110_950
  const mLon = 1 / 91_300
  const lat1 = lat0 + d * mLat
  const lon1 = lon0 + w * mLon
  const z0 = 10
  const z1 = 10 + h
  const ring = (pts: number[][]) => `<gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>${pts.map((p) => p.join(' ')).join(' ')}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember>`
  const floor = ring([[lat0, lon0, z0], [lat0, lon1, z0], [lat1, lon1, z0], [lat1, lon0, z0], [lat0, lon0, z0]])
  const roof = ring([[lat0, lon0, z1], [lat1, lon0, z1], [lat1, lon1, z1], [lat0, lon1, z1], [lat0, lon0, z1]])
  const walls = [
    [[lat0, lon0], [lat1, lon0]],
    [[lat1, lon0], [lat1, lon1]],
    [[lat1, lon1], [lat0, lon1]],
    [[lat0, lon1], [lat0, lon0]],
  ]
    .map(([a, b]) => ring([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], [a[0], a[1], z0]]))
    .join('')
  return `<core:cityObjectMember><bldg:Building gml:id="${id}">${height !== undefined ? `<bldg:measuredHeight uom="m">${height}</bldg:measuredHeight>` : ''}<bldg:lod1Solid><gml:Solid><gml:exterior><gml:CompositeSurface>${floor}${roof}${walls}</gml:CompositeSurface></gml:exterior></gml:Solid></bldg:lod1Solid></bldg:Building></core:cityObjectMember>`
}

const wrap = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><core:CityModel xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:gml="http://www.opengis.net/gml">${inner}</core:CityModel>`

describe('CityGmlImporter', () => {
  it('parses posList and triangulates concave polygons', () => {
    expect(parsePosList('1 2 3 4 5 6 1 2 3')).toEqual([[1, 2, 3], [4, 5, 6]])
    // L 字（凹）多角形 → 4 三角形
    const L = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }]
    const tris = triangulatePolygon(L)
    expect(tris.length).toBe((L.length - 2) * 3)
  })

  it('imports two LOD1 buildings into game coordinates', () => {
    const xml = wrap(buildingXml('b1', 35.0, 138.0, 10, 20, 12, 12.3) + buildingXml('b2', 35.0, 138.0 + 100 / 91_300, 8, 8, 6))
    const r = importCityGml(xml)
    expect(r.buildings.length).toBe(2)
    expect(r.skipped).toBe(0)
    const b1 = r.buildings[0]
    expect(b1.id).toBe('b1')
    expect(b1.measuredHeight).toBe(12.3)
    expect(b1.mesh.indices.length).toBe(6 * 2 * 3) // 6 面 × 2 三角形
    expect(b1.center.y).toBeCloseTo(0, 3) // 原点は最初の点（標高 10）→ 底面 y=0
    expect(b1.footprintArea).toBeCloseTo(200, 0)
    const b2 = r.buildings[1]
    expect(b2.center.x).toBeGreaterThan(90) // 東へ約 100 m + 4 m
    expect(b2.center.z).toBeLessThan(0) // 北側（-Z）に奥行きの半分
    expect(r.merged.indices.length).toBe(b1.mesh.indices.length + b2.mesh.indices.length)
    // 屋根の法線は上向き、床は下向き
    let up = 0, down = 0
    for (let i = 1; i < b1.mesh.normals.length; i += 3) {
      if (b1.mesh.normals[i] > 0.9) up++
      if (b1.mesh.normals[i] < -0.9) down++
    }
    expect(up).toBe(4)
    expect(down).toBe(4)
  })

  it('rejects documents without buildings', () => {
    expect(() => importCityGml(wrap(''))).toThrow(CityGmlParseError)
  })
})
