/**
 * 駆動系（ギア・回転数・トルク特性）。AT / MT 両対応。
 * アーケード寄りの簡略モデル: 車速とギア比から回転数を決め、回転数に応じたトルク係数と
 * レブリミッター（レッドライン超えで駆動カット）で「ギアを選ぶ意味」を作る。
 * React / Rapier に依存しない。
 */
export type Transmission = 'auto' | 'manual'

/** 前進 6 速のギア比（相対値）。1 速が最も大きい */
export const GEAR_RATIOS = [3.4, 2.2, 1.55, 1.18, 0.95, 0.8]
export const REVERSE_RATIO = 3.2
export const IDLE_RPM = 900
export const REDLINE_RPM = 7400
/** シフト中の駆動カット時間 [s] */
const SHIFT_CUT = 0.15

export interface DrivetrainInput {
  throttle: number
  brake: number
  /** 0..1（1 で駆動が切れる） */
  clutch: number
  shiftUp: boolean
  shiftDown: boolean
  /** H パターンシフターなどの絶対指定（-1 R, 0 N, 1..6）。無ければ null */
  gearSelect: number | null
  /** 前進を正 [m/s] */
  speedMs: number
  maxSpeedMs: number
  dt: number
}

export interface DrivetrainState {
  /** -1 R, 0 N, 1..6 */
  gear: number
  rpm: number
  /** 駆動力に掛ける係数 0..1（トルク特性・クラッチ・シフトカット・レブリミッター込み） */
  driveFactor: number
  /** AT で停車中にブレーキを踏んで後退に入っている（ブレーキ入力を後退アクセルとして扱う） */
  reverseByBrake: boolean
  shifting: boolean
}

export function gearLabel(gear: number): string {
  return gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear)
}

/** 回転数に対するトルク係数。アイドル付近は細く、72% あたりがピーク、レッドラインで 0（リミッター） */
export function torqueFactor(rpm: number): number {
  if (rpm >= REDLINE_RPM) return 0
  const r = Math.max(0, Math.min(1, (rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM)))
  const peak = 0.72
  if (r < peak) return 0.62 + 0.38 * (r / peak)
  return 1 - 0.15 * ((r - peak) / (1 - peak))
}

/** 車速とギアから回転数。トップギアが最高速で 96% レッドラインになるよう係数を決める */
export function rpmForSpeed(speedMs: number, gear: number, maxSpeedMs: number): number {
  if (gear === 0) return IDLE_RPM
  const ratio = gear < 0 ? REVERSE_RATIO : GEAR_RATIOS[Math.min(GEAR_RATIOS.length, gear) - 1]
  const k = (REDLINE_RPM * 0.96) / (Math.max(1, maxSpeedMs) * GEAR_RATIOS[GEAR_RATIOS.length - 1])
  return Math.max(IDLE_RPM, Math.abs(speedMs) * k * ratio)
}

export class Drivetrain {
  mode: Transmission = 'auto'
  gear = 1
  rpm = IDLE_RPM
  private shiftTimer = 0
  private reverseByBrake = false

  setMode(mode: Transmission): void {
    if (mode === this.mode) return
    this.mode = mode
    this.reverseByBrake = false
    if (this.gear <= 0) this.select(1)
  }

  reset(gear = 1): void {
    this.gear = gear
    this.rpm = IDLE_RPM
    this.shiftTimer = 0
    this.reverseByBrake = false
  }

  private select(gear: number): void {
    if (gear === this.gear) return
    this.gear = gear
    this.shiftTimer = SHIFT_CUT
  }

  update(i: DrivetrainInput): DrivetrainState {
    const stopped = Math.abs(i.speedMs) < 0.5
    const wheelRpm = rpmForSpeed(i.speedMs, this.gear, i.maxSpeedMs)
    this.shiftTimer = Math.max(0, this.shiftTimer - i.dt)

    if (this.mode === 'auto') {
      this.autoShift(i, wheelRpm, stopped)
    } else {
      this.reverseByBrake = false
      if (i.gearSelect !== null) {
        this.select(Math.max(-1, Math.min(GEAR_RATIOS.length, Math.round(i.gearSelect))))
      } else {
        if (i.shiftUp) this.select(Math.min(GEAR_RATIOS.length, this.gear + 1))
        if (i.shiftDown) {
          const next = this.gear - 1
          // R には低速時のみ入る
          if (next >= 0 || Math.abs(i.speedMs) < 3) this.select(Math.max(-1, next))
        }
      }
    }

    // 回転数: 駆動が繋がっていれば車速に追従、切れていればアクセルで空ぶかし
    const disengaged = this.gear === 0 || i.clutch > 0.5
    const throttleForRev = this.gear < 0 && this.reverseByBrake ? i.brake : i.throttle
    const target = disengaged ? IDLE_RPM + throttleForRev * (REDLINE_RPM - IDLE_RPM) * 0.92 : rpmForSpeed(i.speedMs, this.gear, i.maxSpeedMs)
    const rate = disengaged ? (target > this.rpm ? 6000 : 3000) : 9000
    const delta = target - this.rpm
    this.rpm += Math.sign(delta) * Math.min(Math.abs(delta), rate * i.dt)
    this.rpm = Math.max(IDLE_RPM, Math.min(REDLINE_RPM, this.rpm))

    let driveFactor = 0
    const shifting = this.shiftTimer > 0
    if (!disengaged && !shifting) {
      const ratio = this.gear < 0 ? 1 : 0.78 + 0.22 * (GEAR_RATIOS[this.gear - 1] / GEAR_RATIOS[0])
      // リミッター: 車速由来の回転がレッドラインに達したら駆動を切る
      driveFactor = wheelRpm >= REDLINE_RPM ? 0 : torqueFactor(this.rpm) * ratio
    }
    return { gear: this.gear, rpm: this.rpm, driveFactor, reverseByBrake: this.reverseByBrake, shifting }
  }

  private autoShift(i: DrivetrainInput, wheelRpm: number, stopped: boolean): void {
    // 停車中にブレーキ（アクセル無し）で後退へ。アクセルで前進へ戻る
    if (this.gear < 0) {
      // アクセルを踏んだら即前進ギアへ（後退中でも前向きの駆動で減速させる）
      if (i.throttle > 0) {
        this.select(1)
        this.reverseByBrake = false
      }
      return
    }
    if (stopped && i.throttle === 0 && i.brake > 0.2) {
      this.select(-1)
      this.reverseByBrake = true
      return
    }
    if (this.gear === 0) {
      if (i.throttle > 0) this.select(1)
      return
    }
    if (this.shiftTimer > 0) return
    if (wheelRpm > REDLINE_RPM * 0.92 && this.gear < GEAR_RATIOS.length) this.select(this.gear + 1)
    else if (wheelRpm < REDLINE_RPM * 0.36 && this.gear > 1) this.select(this.gear - 1)
  }
}
