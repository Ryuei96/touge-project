/**
 * ハンドルコントローラー（Logitech G923 / G29 / G920、Thrustmaster など）の入力。
 *
 * ハンコンはブラウザの Gamepad API では「標準マッピング」にならず、軸の並びや
 * ペダルの休止値（踏んでいない時に +1 か -1 か）が OS・ドライバ設定で変わる。
 * そのため、既定のマッピング（Logitech 向け）に加えて、画面上で
 * 「ハンドルを切る」「アクセルを踏む」とやってもらい、動いた軸を学習する校正を持つ。
 */
import type { DriveInput } from './keyboard'

export interface AxisMap {
  /** Gamepad.axes のインデックス */
  axis: number
  /** 離している時の値 */
  rest: number
  /** いっぱいに踏んだ時の値 */
  pressed: number
}

export type WheelButton = 'confirm' | 'handbrake' | 'reset' | 'camera' | 'options' | 'shiftUp' | 'shiftDown'

export interface WheelMapping {
  /** ステア軸 */
  steerAxis: number
  steerInvert: boolean
  /** ハンドル全体の回転角 [deg]（G923 の既定 900）。表示用 */
  wheelRotationDeg: number
  /** フルロック（ゲーム内の最大舵角）に対応するハンドルの切れ角 [deg]。小さいほどクイック */
  lockToLockDeg: number
  /** 1 = 線形、>1 で中立付近が穏やか */
  linearity: number
  throttle: AxisMap
  brake: AxisMap
  clutch: AxisMap | null
  buttons: Record<WheelButton, number>
}

/** Logitech G923 / G29（DirectInput 配列）の既定値。ペダルは離すと +1、踏むと -1 */
export const DEFAULT_LOGITECH_MAPPING: WheelMapping = {
  steerAxis: 0,
  steerInvert: false,
  wheelRotationDeg: 900,
  lockToLockDeg: 360,
  linearity: 1.0,
  throttle: { axis: 1, rest: 1, pressed: -1 },
  brake: { axis: 2, rest: 1, pressed: -1 },
  clutch: { axis: 3, rest: 1, pressed: -1 },
  buttons: { confirm: 0, handbrake: 1, camera: 2, reset: 3, options: 9, shiftUp: 4, shiftDown: 5 },
}

const WHEEL_ID_PATTERN = /G923|G29|G920|G27|G25|Driving Force|Racing Wheel|Thrustmaster|T300|T150|T248|T500|TMX|TX Racing|Fanatec|CSL|Moza|Simucube|c24f|c260|c266|c26d|c26e|c29b|c298|c299|c294|c295/i

/** Gamepad.id からハンコンらしいかを判定 */
export function isWheelId(id: string): boolean {
  return WHEEL_ID_PATTERN.test(id)
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** ペダル軸の生値を 0..1 に正規化（rest → 0、pressed → 1） */
export function pedalValue(raw: number, map: AxisMap): number {
  const span = map.pressed - map.rest
  if (Math.abs(span) < 1e-6) return 0
  const v = clamp01((raw - map.rest) / span)
  return v < 0.03 ? 0 : v
}

/** ステア軸の生値（-1..1 = 全回転）を、ロック角に合わせてゲームの -1..1 へ */
export function steerValue(raw: number, m: WheelMapping): number {
  const half = m.wheelRotationDeg / 2
  const lockHalf = Math.max(10, m.lockToLockDeg / 2)
  let v = (raw * half) / lockHalf
  if (m.steerInvert) v = -v
  v = Math.max(-1, Math.min(1, v))
  const dead = 0.01
  if (Math.abs(v) < dead) return 0
  const n = (Math.abs(v) - dead) / (1 - dead)
  return Math.sign(v) * Math.pow(n, m.linearity)
}

export function buttonDown(pad: Gamepad, index: number): boolean {
  const b = pad.buttons[index]
  if (!b) return false
  return b.pressed || b.value > 0.5
}

/** ハンコンの生値から走行入力へ */
export function readWheel(pad: Gamepad, m: WheelMapping): DriveInput {
  const axes = pad.axes
  return {
    throttle: pedalValue(axes[m.throttle.axis] ?? m.throttle.rest, m.throttle),
    brake: pedalValue(axes[m.brake.axis] ?? m.brake.rest, m.brake),
    steer: steerValue(axes[m.steerAxis] ?? 0, m),
    handbrake: buttonDown(pad, m.buttons.handbrake),
  }
}

/** 校正: 基準値から最も大きく動いた軸を返す（閾値未満なら null） */
export function detectChangedAxis(baseline: number[], current: number[], threshold = 0.35): { axis: number; from: number; to: number } | null {
  let best: { axis: number; from: number; to: number } | null = null
  let bestDelta = threshold
  const n = Math.max(baseline.length, current.length)
  for (let i = 0; i < n; i++) {
    const from = baseline[i] ?? 0
    const to = current[i] ?? 0
    const d = Math.abs(to - from)
    if (d > bestDelta) {
      bestDelta = d
      best = { axis: i, from, to }
    }
  }
  return best
}

/** 校正: 新しく押されたボタンのインデックス */
export function detectPressedButton(baseline: boolean[], current: boolean[]): number | null {
  for (let i = 0; i < current.length; i++) if (current[i] && !baseline[i]) return i
  return null
}

const STORAGE_KEY = 'touge-wheel-v1'

export interface WheelSettings {
  mapping: WheelMapping
  /** 認識されない機器もハンコンとして扱う */
  forceWheel: boolean
}

export function loadWheelSettings(storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): WheelSettings {
  const fallback: WheelSettings = { mapping: DEFAULT_LOGITECH_MAPPING, forceWheel: false }
  if (!storage) return fallback
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<WheelSettings>
    return {
      mapping: { ...DEFAULT_LOGITECH_MAPPING, ...(parsed.mapping ?? {}), buttons: { ...DEFAULT_LOGITECH_MAPPING.buttons, ...(parsed.mapping?.buttons ?? {}) } },
      forceWheel: parsed.forceWheel ?? false,
    }
  } catch {
    return fallback
  }
}

export function saveWheelSettings(settings: WheelSettings, storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* 容量超過などは無視 */
  }
}
