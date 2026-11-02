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
  /** 画面で校正した値か（false なら観測した端の値を休止値として使う） */
  calibrated?: boolean
}

/** 接続後に観測した各軸の最小・最大値（Chrome は触っていない軸を 0 と報告するため、休止値の推定に使う） */
export interface AxisObserved {
  min: number[]
  max: number[]
}

export type WheelButton = 'confirm' | 'handbrake' | 'reset' | 'camera' | 'options' | 'shiftUp' | 'shiftDown' | 'gear1' | 'gear2' | 'gear3' | 'gear4' | 'gear5' | 'gear6' | 'gearR'

export const GEAR_BUTTONS: { name: WheelButton; gear: number }[] = [
  { name: 'gear1', gear: 1 },
  { name: 'gear2', gear: 2 },
  { name: 'gear3', gear: 3 },
  { name: 'gear4', gear: 4 },
  { name: 'gear5', gear: 5 },
  { name: 'gear6', gear: 6 },
  { name: 'gearR', gear: -1 },
]

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
  buttons: { confirm: 0, handbrake: 1, camera: 2, reset: 3, options: 9, shiftUp: 4, shiftDown: 5, gear1: -1, gear2: -1, gear3: -1, gear4: -1, gear5: -1, gear6: -1, gearR: -1 },
}

const WHEEL_ID_PATTERN = /G923|G29|G920|G27|G25|Driving Force|Racing Wheel|Thrustmaster|T300|T150|T248|T500|TMX|TX Racing|Fanatec|CSL|Moza|Simucube|c24f|c260|c266|c26d|c26e|c29b|c298|c299|c294|c295/i

/** Gamepad.id からハンコンらしいかを判定 */
export function isWheelId(id: string): boolean {
  return WHEEL_ID_PATTERN.test(id)
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * 休止値。校正済みなら設定値、そうでなければ観測した端（休止側）の値を使う。
 * Chrome は一度も動いていない軸を 0 と報告するので、設定値 +1 をそのまま使うと「半分踏んでいる」扱いになり、
 * ブレーキなら停車中に勝手に後退してしまう。観測値を使えば未操作 = 0 = 休止になる。
 */
export function effectiveRest(map: AxisMap, observed?: AxisObserved | null): number {
  if (map.calibrated || !observed) return map.rest
  const restIsHigh = map.rest >= map.pressed
  const v = restIsHigh ? observed.max[map.axis] : observed.min[map.axis]
  return v === undefined ? map.rest : v
}

/** ペダル軸の生値を 0..1 に正規化（rest → 0、pressed → 1） */
export function pedalValue(raw: number, map: AxisMap, observed?: AxisObserved | null): number {
  const rest = effectiveRest(map, observed)
  const span = map.pressed - rest
  if (Math.abs(span) < 1e-6) return 0
  const v = clamp01((raw - rest) / span)
  return v < 0.03 ? 0 : v
}

/** 観測レンジを更新（新しい機器では reset する） */
export function observeAxes(observed: AxisObserved, axes: ArrayLike<number>): void {
  for (let i = 0; i < axes.length; i++) {
    const v = axes[i]
    if (observed.min[i] === undefined || v < observed.min[i]) observed.min[i] = v
    if (observed.max[i] === undefined || v > observed.max[i]) observed.max[i] = v
  }
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

/** H シフターのギアボタンが 1 つでも割り当てられているか */
export function hasGearButtons(m: WheelMapping): boolean {
  return GEAR_BUTTONS.some((g) => m.buttons[g.name] >= 0)
}

/** H シフターの選択ギア。割当が無ければ null、割当があって何も入っていなければ 0 (N) */
export function selectedGear(pad: Gamepad, m: WheelMapping): number | null {
  if (!hasGearButtons(m)) return null
  for (const g of GEAR_BUTTONS) {
    const idx = m.buttons[g.name]
    if (idx >= 0 && buttonDown(pad, idx)) return g.gear
  }
  return 0
}

/** ハンコンの生値から走行入力へ（シフトのエッジは呼び出し側で付ける） */
export function readWheel(pad: Gamepad, m: WheelMapping, observed?: AxisObserved | null): DriveInput {
  const axes = pad.axes
  return {
    throttle: pedalValue(axes[m.throttle.axis] ?? m.throttle.rest, m.throttle, observed),
    brake: pedalValue(axes[m.brake.axis] ?? m.brake.rest, m.brake, observed),
    steer: steerValue(axes[m.steerAxis] ?? 0, m),
    handbrake: buttonDown(pad, m.buttons.handbrake),
    clutch: m.clutch ? pedalValue(axes[m.clutch.axis] ?? m.clutch.rest, m.clutch, observed) : 0,
    gearSelect: selectedGear(pad, m),
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
