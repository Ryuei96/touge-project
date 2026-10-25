/**
 * 簡易オートパイロット（pure pursuit）。
 * 中心線サンプルに沿って走る。ブラウザでの自動走破テストと、
 * 将来の AI ドライバー / ゴースト走行の土台。
 */
import { clamp, type Vec3 } from '../core/vec3'
import type { DriveInput } from '../input/keyboard'
import { nearestSampleIndex, type RoadSample } from '../road/spline'

export interface AutopilotOptions {
  maxSpeed?: number
  /** 許容横加速度 [m/s^2] */
  lateralAccel?: number
  lookaheadBase?: number
  lookaheadPerSpeed?: number
  /** 閉路（周回）コース */
  closed?: boolean
}

export interface AutopilotResult {
  input: DriveInput
  index: number
  targetSpeed: number
}

export function computeAutopilot(
  samples: RoadSample[],
  position: Vec3,
  forward: Vec3,
  speedMs: number,
  hint: number,
  options: AutopilotOptions = {},
): AutopilotResult {
  const maxSpeed = options.maxSpeed ?? 30
  const aLat = options.lateralAccel ?? 5.5
  const n = samples.length
  const closed = options.closed ?? false
  const step = n > 1 ? samples[1].distance - samples[0].distance : 1
  const index = nearestSampleIndex(samples, position, hint, 40, closed)
  const wrap = (i: number) => (closed ? ((i % n) + n) % n : Math.min(n - 1, i))
  const lookahead = (options.lookaheadBase ?? 7) + (options.lookaheadPerSpeed ?? 0.55) * Math.max(0, speedMs)
  const targetIdx = wrap(index + Math.round(lookahead / step))
  const target = samples[targetIdx].position
  const dx = target.x - position.x
  const dz = target.z - position.z
  // 車両前方向に対する目標方向の符号付き角（+ が右: right = cross(forward, up) = (-f.z, 0, f.x)）
  const crossY = forward.x * dz - forward.z * dx
  const dotF = forward.x * dx + forward.z * dz
  const angle = Math.atan2(crossY, dotF)
  const steer = clamp(angle * 1.6, -1, 1)

  // 先読み区間の最大曲率から目標速度を決める
  let maxCurv = 0
  const aheadCount = Math.round((lookahead * 3 + 10) / step)
  for (let k = 0; k <= aheadCount; k++) {
    const i = index + k
    if (!closed && i >= n) break
    maxCurv = Math.max(maxCurv, Math.abs(samples[wrap(i)].curvature))
  }
  const remaining = closed ? Infinity : samples[n - 1].distance - samples[index].distance
  let targetSpeed = maxCurv > 1e-4 ? Math.min(maxSpeed, Math.sqrt(aLat / maxCurv)) : maxSpeed
  if (!closed) targetSpeed = Math.min(targetSpeed, 6 + remaining * 0.25)
  targetSpeed = Math.max(targetSpeed, 7)

  const diff = targetSpeed - speedMs
  const throttle = diff > 0 ? clamp(diff / 3, 0.25, 1) : 0
  const brake = diff < -1.5 ? clamp(-diff / 6, 0.2, 1) : 0
  return { input: { throttle, brake, steer, handbrake: false }, index, targetSpeed }
}

/**
 * 状態付きドライバー: スタック（アクセルを踏んでいるのに進まない）を検出し、
 * 一定時間バックして向きを立て直す。プレイヤーの自動走行とライバル車で共用。
 */
export class AutopilotDriver {
  private stuckTimer = 0
  private reverseTimer = 0
  private reverseSteer = 0

  reset(): void {
    this.stuckTimer = 0
    this.reverseTimer = 0
  }

  update(samples: RoadSample[], position: Vec3, forward: Vec3, speedMs: number, hint: number, dt: number, options: AutopilotOptions = {}): AutopilotResult {
    const r = computeAutopilot(samples, position, forward, speedMs, hint, options)
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt
      return { ...r, input: { throttle: 0, brake: 1, steer: this.reverseSteer, handbrake: false } }
    }
    const pushing = r.input.throttle > 0.2 && Math.abs(speedMs) < 0.6
    this.stuckTimer = pushing ? this.stuckTimer + dt : 0
    if (this.stuckTimer > 1.5) {
      this.stuckTimer = 0
      this.reverseTimer = 1.6
      // 行きたい方向と逆にハンドルを切ってバックすると、前が目標方向を向く
      this.reverseSteer = -Math.sign(r.input.steer || 1)
      return { ...r, input: { throttle: 0, brake: 1, steer: this.reverseSteer, handbrake: false } }
    }
    return r
  }
}
