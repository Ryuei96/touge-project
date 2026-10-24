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
  const step = samples.length > 1 ? samples[1].distance - samples[0].distance : 1
  const index = nearestSampleIndex(samples, position, hint)
  const lookahead = (options.lookaheadBase ?? 7) + (options.lookaheadPerSpeed ?? 0.55) * Math.max(0, speedMs)
  const targetIdx = Math.min(samples.length - 1, index + Math.round(lookahead / step))
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
  const aheadEnd = Math.min(samples.length - 1, index + Math.round((lookahead * 3 + 10) / step))
  for (let i = index; i <= aheadEnd; i++) maxCurv = Math.max(maxCurv, Math.abs(samples[i].curvature))
  const remaining = samples[samples.length - 1].distance - samples[index].distance
  let targetSpeed = maxCurv > 1e-4 ? Math.min(maxSpeed, Math.sqrt(aLat / maxCurv)) : maxSpeed
  targetSpeed = Math.min(targetSpeed, 6 + remaining * 0.25)
  targetSpeed = Math.max(targetSpeed, 7)

  const diff = targetSpeed - speedMs
  const throttle = diff > 0 ? clamp(diff / 3, 0.25, 1) : 0
  const brake = diff < -1.5 ? clamp(-diff / 6, 0.2, 1) : 0
  return { input: { throttle, brake, steer, handbrake: false }, index, targetSpeed }
}
