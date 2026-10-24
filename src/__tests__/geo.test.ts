import { describe, expect, it } from 'vitest'
import { createCourseManager } from '../course/CourseManager'
import { sampleGeoCourse } from '../course/courses/sampleGeoCourse'
import type { Attribution } from '../course/types'
import { CoordinateTransformer, enuToGame, gameToEnu, geodeticToEnu } from '../geo/CoordinateTransformer'
import { GeoDataImporter, GeoSourceNotImplementedError, alignmentLengthMeters, sampleDem, type DemGrid } from '../geo/GeoDataImporter'

const attribution: Attribution = { source: 'test', license: 'test', fictional: true }

describe('CoordinateTransformer', () => {
  it('maps ENU to game coordinates (north = -Z)', () => {
    expect(enuToGame({ east: 1, north: 2, up: 3 })).toEqual({ x: 1, y: 3, z: -2 })
    expect(gameToEnu({ x: 1, y: 3, z: -2 })).toEqual({ east: 1, north: 2, up: 3 })
  })

  it('converts one degree of latitude to roughly 111 km', () => {
    const e = geodeticToEnu({ latitude: 36, longitude: 138 }, { latitude: 35, longitude: 138 })
    expect(e.north).toBeGreaterThan(110_000)
    expect(e.north).toBeLessThan(111_500)
    expect(Math.abs(e.east)).toBeLessThan(1e-6)
  })

  it('round-trips through the transformer', () => {
    const t = new CoordinateTransformer({
      local: { x: 0, y: 0, z: 0 },
      sourceCrs: 'EPSG:4326',
      sourcePosition: { latitude: 35.5, longitude: 138.5, altitude: 500 },
    })
    const g = t.toGame({ latitude: 35.51, longitude: 138.49, altitude: 520 })
    expect(g.z).toBeLessThan(0) // 北へ = -Z
    expect(g.x).toBeLessThan(0) // 西へ = -X
    expect(g.y).toBeCloseTo(20, 6)
    const back = t.toGeodetic(g)
    expect(back.latitude).toBeCloseTo(35.51, 9)
    expect(back.longitude).toBeCloseTo(138.49, 9)
  })

  it('supports projected coordinates', () => {
    const t = new CoordinateTransformer({
      local: { x: 0, y: 0, z: 0 },
      sourceCrs: 'EPSG:6677',
      sourcePosition: { easting: 1000, northing: 2000, height: 10 },
    })
    expect(t.toGame({ easting: 1010, northing: 2100, height: 15 })).toEqual({ x: 10, y: 5, z: -100 })
  })
})

describe('GeoDataImporter', () => {
  const dem: DemGrid = {
    originLat: 1,
    originLon: 0,
    dLat: -0.5,
    dLon: 0.5,
    rows: 3,
    cols: 3,
    heights: new Float32Array([0, 10, 20, 100, 110, 120, 200, 210, 220]),
    attribution,
  }

  it('samples DEM bilinearly', () => {
    expect(sampleDem(dem, 1, 0)).toBe(0)
    expect(sampleDem(dem, 0.5, 0.5)).toBe(110)
    expect(sampleDem(dem, 0.75, 0.25)).toBeCloseTo(55, 6)
    expect(sampleDem(dem, 99, -99)).toBe(0) // クランプ
  })

  it('imports a GeoJSON LineString and builds a geospatial CourseDefinition', async () => {
    const importer = new GeoDataImporter()
    const road = await importer.importRoadAlignment({
      kind: 'geojson',
      attribution,
      data: {
        type: 'Feature',
        properties: { width: 5 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [138.0, 35.0, 100],
            [138.0, 35.001, 110],
            [138.001, 35.002, 125],
          ],
        },
      },
    })
    expect(road.points.length).toBe(3)
    expect(road.widths).toEqual([5, 5, 5])
    expect(alignmentLengthMeters(road.points)).toBeGreaterThan(200)

    const def = importer.buildCourseDefinition(road, undefined, { id: 'g', name: 'G' })
    expect(def.source).toBe('geospatial')
    expect(def.origin.sourceCrs).toBe('EPSG:4326')
    expect(def.attribution.fictional).toBe(true)
    expect(def.centerline[0]).toMatchObject({ x: 0, y: 0, z: 0, width: 5 })
    expect(def.centerline[1].z).toBeLessThan(-100)
    expect(def.centerline[2].y).toBeCloseTo(25, 6)
  })

  it('rejects online sources explicitly', async () => {
    const importer = new GeoDataImporter()
    await expect(importer.importDem({ kind: 'gsi-dem-tile', zoom: 14, x: 1, y: 1 })).rejects.toBeInstanceOf(GeoSourceNotImplementedError)
  })

  it('feeds the sample geospatial course through CourseManager', async () => {
    const manager = createCourseManager().register(sampleGeoCourse)
    const course = await manager.load('sample-geo')
    expect(course.definition.source).toBe('geospatial')
    expect(course.definition.elevation.mode).toBe('dem')
    expect(course.length).toBeGreaterThan(1000)
    expect(course.collision.length).toBeGreaterThan(0)
  })
})
