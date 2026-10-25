import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GlbParseError, parseGlb, splitGlb } from '../bim/GlbReader'

/** テスト用: 最小の GLB（四角形 1 枚 + ノード階層）を組み立てる */
function buildGlb(opts: { translation?: number[]; childScale?: number[] } = {}): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, -1, 0, 0, -1])
  const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2])
  const binParts = [positions.buffer, normals.buffer, indices.buffer]
  const binLen = binParts.reduce((a, b) => a + Math.ceil(b.byteLength / 4) * 4, 0)
  const bin = new Uint8Array(binLen)
  let off = 0
  const views: { byteOffset: number; byteLength: number }[] = []
  for (const part of binParts) {
    bin.set(new Uint8Array(part), off)
    views.push({ byteOffset: off, byteLength: part.byteLength })
    off += Math.ceil(part.byteLength / 4) * 4
  }
  const json = {
    asset: { version: '2.0', generator: 'test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'Root', translation: opts.translation ?? [0, 0, 0], children: [1] },
      { name: 'Deck_Road', mesh: 0, scale: opts.childScale ?? [1, 1, 1] },
    ],
    meshes: [{ name: 'quad', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'Asphalt', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.2, 0.2, 1] } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    bufferViews: views.map((v) => ({ buffer: 0, ...v })),
    buffers: [{ byteLength: binLen }],
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonLen = Math.ceil(jsonBytes.length / 4) * 4
  const total = 12 + 8 + jsonLen + 8 + binLen
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, 0x4e4f534a, true)
  u8.set(jsonBytes, 20)
  for (let i = 20 + jsonBytes.length; i < 20 + jsonLen; i++) u8[i] = 0x20
  dv.setUint32(20 + jsonLen, binLen, true)
  dv.setUint32(24 + jsonLen, 0x004e4942, true)
  u8.set(bin, 28 + jsonLen)
  return out
}

describe('GlbReader', () => {
  it('parses a hand-built GLB and applies node transforms', () => {
    const model = parseGlb(buildGlb({ translation: [10, 2, -5], childScale: [2, 1, 3] }))
    expect(model.generator).toBe('test')
    expect(model.instances.length).toBe(1)
    const inst = model.instances[0]
    expect(inst.name).toBe('Deck_Road')
    expect(inst.materialName).toBe('Asphalt')
    expect(inst.baseColor).toEqual([0.2, 0.2, 0.2, 1])
    expect(Array.from(inst.mesh.positions.slice(0, 3))).toEqual([10, 2, -5])
    expect(Array.from(inst.mesh.positions.slice(3, 6))).toEqual([12, 2, -5]) // x スケール 2
    expect(Array.from(inst.mesh.positions.slice(6, 9))).toEqual([12, 2, -8]) // z スケール 3
    expect(inst.mesh.indices.length).toBe(6)
    expect(inst.mesh.normals[1]).toBeCloseTo(1, 6)
    expect(model.bounds.min).toEqual([10, 2, -8])
    expect(model.bounds.max).toEqual([12, 2, -5])
  })

  it('rejects non-GLB data', () => {
    expect(() => splitGlb(new ArrayBuffer(8))).toThrow(GlbParseError)
    const bad = new Uint8Array(32)
    expect(() => parseGlb(bad.buffer)).toThrow(/bad magic/)
  })

  it('reads the Blender-generated bridge segment (Y-up, deck top at y=0)', () => {
    const buf = readFileSync('public/models/bridge-segment.glb')
    const model = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const names = model.instances.map((i) => i.name)
    expect(names).toContain('Deck_Road')
    expect(names.some((n) => n.startsWith('Pier_'))).toBe(true)
    const deck = model.instances.find((i) => i.name === 'Deck_Road')!
    let maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity
    for (let i = 0; i < deck.mesh.positions.length; i += 3) {
      maxY = Math.max(maxY, deck.mesh.positions[i + 1])
      minZ = Math.min(minZ, deck.mesh.positions[i + 2]); maxZ = Math.max(maxZ, deck.mesh.positions[i + 2])
      minX = Math.min(minX, deck.mesh.positions[i]); maxX = Math.max(maxX, deck.mesh.positions[i])
    }
    expect(maxY).toBeCloseTo(0, 3) // デッキ上面
    expect(maxZ - minZ).toBeCloseTo(60, 3) // 長手方向は Z（Blender の Y → glTF の -Z）
    expect(maxX - minX).toBeCloseTo(8, 3)
    expect(model.bounds.min[1]).toBeLessThan(-10) // 橋脚が下へ伸びる
  })

  it('reads the BIM course model with drivable nodes', () => {
    const buf = readFileSync('public/models/bim-bridge-course.glb')
    const model = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const drivable = model.instances.filter((i) => /^(Road_|Deck_)/.test(i.name))
    expect(drivable.map((d) => d.name).sort()).toEqual(['Deck_Bridge', 'Road_Approach_North', 'Road_Approach_South'])
    expect(model.bounds.min[2]).toBeLessThan(-400)
  })
})
