/**
 * 軽量な 3D ベクトルユーティリティ。
 * Three.js に依存しない純粋関数群で、Node（テスト）とブラウザの両方で動作する。
 * ゲーム座標系: X = 東, Y = 上, Z = 南（-Z = 北 = 既定の進行方向）。右手系・Y-up。
 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const UP: Readonly<Vec3> = Object.freeze({ x: 0, y: 1, z: 0 })

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b))
export const distanceXZ = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z)

export function normalize(a: Vec3, fallback: Vec3 = { x: 0, y: 0, z: -1 }): Vec3 {
  const l = length(a)
  if (l < 1e-9) return { ...fallback }
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
})

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
export const lerpN = (a: number, b: number, t: number): number => a + (b - a) * t
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Y 軸まわりのヨー角（ラジアン）。+Z 前方向を 0 とし、ゲーム座標の -Z（北）向きは π。 */
export const headingFromDirection = (d: Vec3): number => Math.atan2(d.x, d.z)
