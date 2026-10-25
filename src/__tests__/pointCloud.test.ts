import { describe, expect, it } from 'vitest'
import { CoordinateTransformer } from '../geo/CoordinateTransformer'
import { PointCloudParseError, parseLas, parsePly, parsePointCloud, parseXyzText, readLasHeader, toGamePointCloud } from '../geo/PointCloudImporter'

function asciiPly(): ArrayBuffer {
  const text = ['ply', 'format ascii 1.0', 'element vertex 3', 'property float x', 'property float y', 'property float z', 'property uchar red', 'property uchar green', 'property uchar blue', 'end_header', '0 0 0 255 0 0', '1 2 3 0 255 0', '-1 5 2 0 0 255', ''].join('\n')
  return new TextEncoder().encode(text).buffer
}

function binaryPly(): ArrayBuffer {
  const header = new TextEncoder().encode(['ply', 'format binary_little_endian 1.0', 'element vertex 2', 'property float x', 'property float y', 'property float z', 'property uchar red', 'property uchar green', 'property uchar blue', 'end_header', ''].join('\n'))
  const body = new ArrayBuffer(2 * 15)
  const dv = new DataView(body)
  const put = (i: number, x: number, y: number, z: number, r: number, g: number, b: number) => {
    const o = i * 15
    dv.setFloat32(o, x, true); dv.setFloat32(o + 4, y, true); dv.setFloat32(o + 8, z, true)
    dv.setUint8(o + 12, r); dv.setUint8(o + 13, g); dv.setUint8(o + 14, b)
  }
  put(0, 10, 20, 30, 255, 255, 255)
  put(1, -5, 0, 5, 0, 0, 0)
  const out = new Uint8Array(header.length + body.byteLength)
  out.set(header, 0)
  out.set(new Uint8Array(body), header.length)
  return out.buffer
}

function las(pointFormat: number, count: number): ArrayBuffer {
  const headerSize = 227
  const recordLength = pointFormat === 2 ? 26 : 20
  const buf = new ArrayBuffer(headerSize + recordLength * count)
  const dv = new DataView(buf)
  new Uint8Array(buf).set(new TextEncoder().encode('LASF'), 0)
  dv.setUint8(24, 1); dv.setUint8(25, 2)
  dv.setUint16(94, headerSize, true)
  dv.setUint32(96, headerSize, true)
  dv.setUint8(104, pointFormat)
  dv.setUint16(105, recordLength, true)
  dv.setUint32(107, count, true)
  dv.setFloat64(131, 0.01, true); dv.setFloat64(139, 0.01, true); dv.setFloat64(147, 0.01, true)
  dv.setFloat64(155, 1000, true); dv.setFloat64(163, 2000, true); dv.setFloat64(171, 0, true)
  for (let i = 0; i < count; i++) {
    const o = headerSize + i * recordLength
    dv.setInt32(o, i * 100, true); dv.setInt32(o + 4, -i * 100, true); dv.setInt32(o + 8, 500, true)
    if (pointFormat === 2) {
      dv.setUint16(o + 20, 65535, true); dv.setUint16(o + 22, 0, true); dv.setUint16(o + 24, 32768, true)
    }
  }
  return buf
}

describe('PointCloudImporter', () => {
  it('parses ascii PLY with colours', () => {
    const c = parsePly(asciiPly())
    expect(c.count).toBe(3)
    expect(Array.from(c.positions.slice(3, 6))).toEqual([1, 2, 3])
    expect(c.colors?.[0]).toBeCloseTo(1, 6)
    expect(c.colors?.[4]).toBeCloseTo(1, 6)
    expect(c.bounds.min).toEqual([-1, 0, 0])
  })

  it('parses binary PLY', () => {
    const c = parsePly(binaryPly())
    expect(c.count).toBe(2)
    expect(Array.from(c.positions.slice(0, 3))).toEqual([10, 20, 30])
    expect(c.colors?.[2]).toBeCloseTo(1, 6)
    expect(c.colors?.[3]).toBe(0)
  })

  it('parses LAS 1.2 with scale/offset and RGB, and can subsample', () => {
    const h = readLasHeader(las(2, 10))
    expect(h.version).toBe('1.2')
    expect(h.pointCount).toBe(10)
    const c = parseLas(las(2, 10))
    expect(c.count).toBe(10)
    expect(c.positions[3]).toBeCloseTo(1001, 6) // 100 * 0.01 + 1000
    expect(c.positions[4]).toBeCloseTo(1999, 6)
    expect(c.colors?.[0]).toBeCloseTo(1, 6)
    const sub = parseLas(las(0, 10), { maxPoints: 4 })
    expect(sub.count).toBe(4)
    expect(sub.colors).toBeUndefined()
  })

  it('rejects LAZ and unknown formats', () => {
    const laz = las(0, 1)
    new DataView(laz).setUint8(104, 0x80)
    expect(() => parseLas(laz)).toThrow(/LAZ/)
    expect(() => parsePointCloud('a.bin', new ArrayBuffer(4))).toThrow(PointCloudParseError)
  })

  it('parses XYZ text and transforms ENU to game coordinates', () => {
    const c = parseXyzText('# comment\n1 2 3\n4,5,6,255,128,0\n')
    expect(c.count).toBe(2)
    expect(c.colors?.[3]).toBeCloseTo(1, 6)
    const g = toGamePointCloud(c)
    expect(Array.from(g.positions.slice(0, 3))).toEqual([1, 3, -2]) // east, up, -north
    const t = new CoordinateTransformer({ local: { x: 0, y: 0, z: 0 }, sourceCrs: 'EPSG:6677', sourcePosition: { easting: 0, northing: 0, height: 0 } })
    const g2 = toGamePointCloud(c, { transformer: t, swapXY: true })
    expect(Array.from(g2.positions.slice(0, 3))).toEqual([2, 3, -1])
  })
})
