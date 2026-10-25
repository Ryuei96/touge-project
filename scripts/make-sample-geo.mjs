/**
 * GeoJSON サンプルコース（sample-geo）用の合成 CityGML（建物）と PLY 点群を生成する。
 * いずれも架空データ。実在の建物・地形ではない。
 *   node scripts/make-sample-geo.mjs public/samples
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? 'public/samples'
mkdirSync(out, { recursive: true })

// sample-geo と同じ線形（src/course/courses/sampleGeoCourse.ts と一致させる）
const lat0 = 35.0
const lon0 = 138.0
const mPerDegLat = 110_950
const mPerDegLon = 91_300
const road = []
const n = 36
for (let i = 0; i < n; i++) {
  const s = i / (n - 1)
  const north = s * 1200
  const east = Math.sin(s * Math.PI * 2.2) * 140 + s * 60
  road.push({ east, north, height: 300 + north * 0.08 + Math.sin(east / 150) * 6 + Math.cos(north / 220) * 4 })
}
// 原点標高（DEM から）: sampleGeoCourse の makeDem と同じ式
const originAlt = 304 // = 300 + 0 * 0.08 + sin(0) * 6 + cos(0) * 4

let seed = 7
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

// ---- CityGML: 道路沿いに建物を並べる
const buildings = []
for (let i = 2; i < n - 2; i += 2) {
  const p = road[i]
  const q = road[i + 1]
  const tx = q.east - p.east, tn = q.north - p.north
  const l = Math.hypot(tx, tn) || 1
  const rx = tn / l, rn = -tx / l // 右向き
  for (const side of [-1, 1]) {
    if (rnd() < 0.3) continue
    const dist = 14 + rnd() * 10
    const w = 8 + rnd() * 8
    const d = 8 + rnd() * 8
    const h = 5 + rnd() * 12
    const cx = p.east + rx * side * dist
    const cn = p.north + rn * side * dist
    const base = p.height - 0.5
    buildings.push({ id: `bldg-${buildings.length}`, cx, cn, w, d, h, base })
  }
}
const toLat = (north) => lat0 + north / mPerDegLat
const toLon = (east) => lon0 + east / mPerDegLon
const ring = (pts) => `<gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>${pts.map((p) => p.join(' ')).join(' ')}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember>`
const bldgXml = buildings
  .map((b) => {
    const e0 = b.cx - b.w / 2, e1 = b.cx + b.w / 2, n0 = b.cn - b.d / 2, n1 = b.cn + b.d / 2
    const z0 = b.base, z1 = b.base + b.h
    const P = (e, nn, z) => [toLat(nn).toFixed(9), toLon(e).toFixed(9), z.toFixed(2)]
    const floor = ring([P(e0, n0, z0), P(e0, n1, z0), P(e1, n1, z0), P(e1, n0, z0), P(e0, n0, z0)])
    const roof = ring([P(e0, n0, z1), P(e1, n0, z1), P(e1, n1, z1), P(e0, n1, z1), P(e0, n0, z1)])
    const corners = [[e0, n0], [e1, n0], [e1, n1], [e0, n1]]
    const walls = corners.map((a, i) => {
      const b2 = corners[(i + 1) % 4]
      return ring([P(a[0], a[1], z0), P(b2[0], b2[1], z0), P(b2[0], b2[1], z1), P(a[0], a[1], z1), P(a[0], a[1], z0)])
    }).join('')
    return `<core:cityObjectMember><bldg:Building gml:id="${b.id}"><gml:name>合成建物 ${b.id}</gml:name><bldg:measuredHeight uom="m">${b.h.toFixed(1)}</bldg:measuredHeight><bldg:lod1Solid><gml:Solid><gml:exterior><gml:CompositeSurface>${floor}${roof}${walls}</gml:CompositeSurface></gml:exterior></gml:Solid></bldg:lod1Solid></bldg:Building></core:cityObjectMember>`
  })
  .join('\n')
const gml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 合成データ（架空）。PLATEAU CityGML 2.0 の bldg:Building LOD1 と同じ構造。EPSG:6697 相当（緯度 経度 標高） -->
<core:CityModel xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:bldg="http://www.opengis.net/citygml/building/2.0" xmlns:gml="http://www.opengis.net/gml" xmlns:gen="http://www.opengis.net/citygml/generics/2.0">
${bldgXml}
</core:CityModel>
`
writeFileSync(join(out, 'sample-buildings.gml'), gml)

// ---- PLY 点群: 道路の左側 60 m 区間に「地表面スキャン」風の点を撒く（ENU, 色付き）
const pts = []
for (let i = 10; i <= 16; i++) {
  const p = road[i]
  const q = road[i + 1]
  const tx = q.east - p.east, tn = q.north - p.north
  const l = Math.hypot(tx, tn) || 1
  const ux = tx / l, un = tn / l, rx = tn / l, rn = -tx / l
  for (let k = 0; k < 1500; k++) {
    const along = rnd() * l
    const lateral = -(6 + rnd() * 30)
    const e = p.east + ux * along + rx * lateral
    const nn = p.north + un * along + rn * lateral
    const h = p.height - 0.2 + Math.abs(lateral) * 0.08 + Math.sin(e / 7) * 0.4 + rnd() * 0.3
    const g = 90 + rnd() * 60
    pts.push([e, nn, h - originAlt, 70 + rnd() * 30, g, 40 + rnd() * 20])
  }
}
const header = `ply\nformat binary_little_endian 1.0\ncomment synthetic ground scan (fictional), coordinates: east north up [m] relative to course origin\nelement vertex ${pts.length}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`
const body = Buffer.alloc(pts.length * 15)
pts.forEach((p, i) => {
  body.writeFloatLE(p[0], i * 15)
  body.writeFloatLE(p[1], i * 15 + 4)
  body.writeFloatLE(p[2], i * 15 + 8)
  body.writeUInt8(Math.round(p[3]), i * 15 + 12)
  body.writeUInt8(Math.round(p[4]), i * 15 + 13)
  body.writeUInt8(Math.round(p[5]), i * 15 + 14)
})
writeFileSync(join(out, 'sample-scan.ply'), Buffer.concat([Buffer.from(header), body]))
console.log(`wrote ${buildings.length} buildings and ${pts.length} points to ${out}`)
