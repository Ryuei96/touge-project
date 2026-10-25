/**
 * GeoDataImporter の動作確認用サンプル。
 * 緯度経度・DEM ともに架空の合成データであり、実在の場所・標高を示すものではない。
 * 将来は実在道路の GeoJSON と国土地理院 DEM をここに差し替える。
 */
import { GeoDataImporter, type DemGrid, type GeoJsonFeature } from '../../geo'
import type { Attribution, CourseDefinition } from '../types'

const attribution: Attribution = {
  source: '合成データ（GeoDataImporter 動作確認用）',
  license: 'プロジェクト内利用',
  fictional: true,
  notes: '緯度経度・標高ともに架空。実在地点とは無関係。',
}

// 架空の線形: 原点から北へ向かい、東へ振れながら折り返す
function makeLine(): GeoJsonFeature {
  const lat0 = 35.0
  const lon0 = 138.0
  const mPerDegLat = 110_950
  const mPerDegLon = 91_300
  const coords: number[][] = []
  const n = 36
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1)
    const north = s * 1200
    const east = Math.sin(s * Math.PI * 2.2) * 140 + s * 60
    coords.push([lon0 + east / mPerDegLon, lat0 + north / mPerDegLat])
  }
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { width: 6, name: 'sample' } }
}

function makeDem(): DemGrid {
  const rows = 64
  const cols = 64
  const heights = new Float32Array(rows * cols)
  const originLat = 35.0 + 1500 / 110_950
  const originLon = 138.0 - 400 / 91_300
  const dLat = -(1800 / 110_950) / rows
  const dLon = (1000 / 91_300) / cols
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const north = (originLat + r * dLat - 35.0) * 110_950
      const east = (originLon + c * dLon - 138.0) * 91_300
      heights[r * cols + c] = 300 + north * 0.08 + Math.sin(east / 150) * 6 + Math.cos(north / 220) * 4
    }
  }
  return { originLat, originLon, dLat, dLon, rows, cols, heights, attribution: { ...attribution, source: '合成 DEM' } }
}

function build(): CourseDefinition {
  const importer = new GeoDataImporter()
  const line = makeLine()
  const dem = makeDem()
  const road = {
    points: line.geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon })),
    widths: line.geometry.coordinates.map(() => 6),
    attribution,
  }
  const def = importer.buildCourseDefinition(road, dem, {
    id: 'sample-geo',
    name: 'GeoJSON サンプル（架空）',
    description: 'GeoDataImporter → CourseManager の経路を確認するための合成データ。',
    defaultWidth: 6,
  })
  def.terrain = { enabled: true, margin: 120, resolution: 120, seed: 3, amplitude: 10, blendDistance: 40 }
  def.checkpoints = { interval: 300 }
  def.scenery = { seed: 5, treeCount: 500 }
  // 合成の周辺環境（scripts/make-sample-geo.mjs が生成）。PLATEAU CityGML と LAS/PLY 点群の読み込み経路の確認用
  def.layers = [
    {
      kind: 'citygml',
      id: 'buildings',
      uri: 'samples/sample-buildings.gml',
      collision: true,
      color: '#d8d0c2',
      attribution: { ...attribution, source: '合成 CityGML（PLATEAU 形式）' },
    },
    {
      kind: 'point-cloud',
      id: 'scan',
      uri: 'samples/sample-scan.ply',
      coordinates: 'enu',
      maxPoints: 20000,
      pointSize: 0.4,
      attribution: { ...attribution, source: '合成点群（PLY）' },
    },
  ]
  return def
}

export const sampleGeoCourse: CourseDefinition = build()
