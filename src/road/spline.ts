/**
 * 道路中心線のスプライン補間と等間隔サンプリング。
 * 入力: XYZ 制御点（任意で幅員）。出力: 弧長で等間隔に並んだ RoadSample 列。
 * 補間は centripetal Catmull-Rom（alpha = 0.5）。ヘアピンでもループ・尖りが出にくい。
 */
import { cross, distance, headingFromDirection, lerp, lerpN, normalize, sub, UP, type Vec3 } from '../core/vec3'

export interface CenterlinePoint extends Vec3 {
  /** この点での幅員 [m]。省略時は defaultWidth */
  width?: number
}

export interface RoadSample {
  position: Vec3
  /** 進行方向単位ベクトル */
  tangent: Vec3
  /** 進行方向に対する右向き単位ベクトル（水平） */
  right: Vec3
  /** 路面法線 */
  normal: Vec3
  /** 始点からの弧長 [m] */
  distance: number
  /** 幅員 [m] */
  width: number
  /** 勾配（dy / 水平距離）。+ が上り */
  grade: number
  /** 平面曲率 [1/m]。+ が左カーブ */
  curvature: number
  /** ヨー角 [rad] */
  heading: number
}

export interface SampleOptions {
  /** サンプル間隔 [m] */
  step?: number
  defaultWidth?: number
  /** 制御点間の細分割数（弧長計算用） */
  subdivisions?: number
  /** Catmull-Rom の alpha（0.5 = centripetal） */
  alpha?: number
  closed?: boolean
}

/** Barry–Goldman 形式の Catmull-Rom 補間（p1..p2 間、u ∈ [0,1]） */
export function catmullRomPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number, alpha = 0.5): Vec3 {
  const knot = (a: Vec3, b: Vec3) => Math.max(Math.pow(distance(a, b), alpha), 1e-6)
  const t0 = 0
  const t1 = t0 + knot(p0, p1)
  const t2 = t1 + knot(p1, p2)
  const t3 = t2 + knot(p2, p3)
  const t = lerpN(t1, t2, u)
  const mix = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 => {
    const wa = (tb - t) / (tb - ta)
    const wb = (t - ta) / (tb - ta)
    return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb }
  }
  const a1 = mix(p0, p1, t0, t1)
  const a2 = mix(p1, p2, t1, t2)
  const a3 = mix(p2, p3, t2, t3)
  const b1 = mix(a1, a2, t0, t2)
  const b2 = mix(a2, a3, t1, t3)
  return mix(b1, b2, t1, t2)
}

interface DensePoint {
  p: Vec3
  width: number
  s: number
}

function densify(points: CenterlinePoint[], opts: Required<SampleOptions>): DensePoint[] {
  const n = points.length
  if (n < 2) throw new Error('centerline needs at least 2 control points')
  const w = (i: number) => points[i].width ?? opts.defaultWidth
  const get = (i: number): Vec3 => {
    if (opts.closed) return points[((i % n) + n) % n]
    if (i < 0) {
      const d = sub(points[0], points[1])
      return { x: points[0].x + d.x, y: points[0].y + d.y, z: points[0].z + d.z }
    }
    if (i >= n) {
      const d = sub(points[n - 1], points[n - 2])
      return { x: points[n - 1].x + d.x, y: points[n - 1].y + d.y, z: points[n - 1].z + d.z }
    }
    return points[i]
  }
  const segments = opts.closed ? n : n - 1
  const dense: DensePoint[] = []
  let s = 0
  let prev: Vec3 | null = null
  for (let i = 0; i < segments; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const w1 = w(i)
    const w2 = w((i + 1) % n)
    const last = i === segments - 1
    const kMax = last ? opts.subdivisions : opts.subdivisions - 1
    for (let k = 0; k <= kMax; k++) {
      const u = k / opts.subdivisions
      const p = catmullRomPoint(p0, p1, p2, p3, u, opts.alpha)
      if (prev) s += distance(prev, p)
      dense.push({ p, width: lerpN(w1, w2, u), s })
      prev = p
    }
  }
  return dense
}

/** 制御点列から等間隔の RoadSample 列を生成する */
export function sampleCenterline(points: CenterlinePoint[], options: SampleOptions = {}): RoadSample[] {
  const opts: Required<SampleOptions> = {
    step: options.step ?? 2,
    defaultWidth: options.defaultWidth ?? 7,
    subdivisions: options.subdivisions ?? 24,
    alpha: options.alpha ?? 0.5,
    closed: options.closed ?? false,
  }
  const dense = densify(points, opts)
  const total = dense[dense.length - 1].s
  const count = Math.max(2, Math.floor(total / opts.step) + 1)
  const positions: Vec3[] = []
  const widths: number[] = []
  const dists: number[] = []
  let j = 0
  for (let i = 0; i < count; i++) {
    const target = i === count - 1 ? total : i * opts.step
    while (j < dense.length - 2 && dense[j + 1].s < target) j++
    const a = dense[j]
    const b = dense[j + 1]
    const span = Math.max(b.s - a.s, 1e-9)
    const t = Math.min(1, Math.max(0, (target - a.s) / span))
    positions.push(lerp(a.p, b.p, t))
    widths.push(lerpN(a.width, b.width, t))
    dists.push(target)
  }

  const samples: RoadSample[] = []
  for (let i = 0; i < count; i++) {
    const prev = positions[Math.max(0, i - 1)]
    const next = positions[Math.min(count - 1, i + 1)]
    const tangent = normalize(sub(next, prev))
    const right = normalize(cross(tangent, UP), { x: 1, y: 0, z: 0 })
    const normal = normalize(cross(right, tangent), { x: 0, y: 1, z: 0 })
    const horiz = Math.hypot(tangent.x, tangent.z)
    const grade = horiz > 1e-6 ? tangent.y / horiz : 0
    samples.push({
      position: positions[i],
      tangent,
      right,
      normal,
      distance: dists[i],
      width: widths[i],
      grade,
      curvature: 0,
      heading: headingFromDirection(tangent),
    })
  }
  // 曲率: 前後のサンプルの水平方向ヘディング差分
  for (let i = 0; i < count; i++) {
    const a = samples[Math.max(0, i - 1)]
    const b = samples[Math.min(count - 1, i + 1)]
    const ds = Math.max(b.distance - a.distance, 1e-6)
    const ax = a.tangent.x, az = a.tangent.z
    const bx = b.tangent.x, bz = b.tangent.z
    const crossY = az * bx - ax * bz
    const dotP = ax * bx + az * bz
    const angle = Math.atan2(crossY, dotP)
    samples[i].curvature = angle / ds
  }
  return samples
}

/** 弧長 d に最も近いサンプルのインデックス */
export function sampleIndexAtDistance(samples: RoadSample[], d: number): number {
  if (samples.length === 0) return 0
  const step = samples.length > 1 ? samples[1].distance - samples[0].distance : 1
  const i = Math.round(d / step)
  return Math.min(samples.length - 1, Math.max(0, i))
}

/** 位置 p に最も近いサンプルのインデックス（hint 周辺を優先探索）。closed のときは端を跨いで探索する */
export function nearestSampleIndex(samples: RoadSample[], p: Vec3, hint?: number, window = 40, closed = false): number {
  const n = samples.length
  let best = -1
  let bestD = Infinity
  const check = (i: number) => {
    const s = samples[i].position
    const dx = s.x - p.x
    const dz = s.z - p.z
    const dy = (s.y - p.y) * 0.5
    const d = dx * dx + dz * dz + dy * dy
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (hint !== undefined) {
    for (let k = -window; k <= window; k++) {
      const i = hint + k
      if (closed) check(((i % n) + n) % n)
      else if (i >= 0 && i < n) check(i)
    }
  }
  if (best < 0 || bestD > 400) for (let i = 0; i < n; i++) check(i)
  return best
}

/**
 * 弧長で minGap 以上離れたサンプル同士の最小水平距離 [m]。
 * コースが平面上で自己交差・近接していないかの検証に使う（橋・立体交差は別途扱う）。
 */
export function minSelfSeparation(samples: RoadSample[], minGapMeters = 60): { distance: number; i: number; j: number } {
  const step = samples.length > 1 ? samples[1].distance - samples[0].distance : 1
  const gap = Math.max(1, Math.round(minGapMeters / step))
  let best = { distance: Infinity, i: -1, j: -1 }
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i].position
    for (let j = i + gap; j < samples.length; j++) {
      const b = samples[j].position
      const d = Math.hypot(a.x - b.x, a.z - b.z)
      if (d < best.distance) best = { distance: d, i, j }
    }
  }
  return best
}
