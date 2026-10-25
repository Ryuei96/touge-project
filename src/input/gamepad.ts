/**
 * ゲームパッド入力（Gamepad API、標準マッピング）。PS5 DualSense / Xbox 両対応。
 *
 *   左スティック X : ステア        R2 (buttons[7]) : アクセル（アナログ）
 *   L2 (buttons[6]) : ブレーキ     □ / X (buttons[2]) : サイドブレーキ
 *   △ / Y (buttons[3]) : 復帰      ○ / B (buttons[1]) : カメラ切替
 *   × / A (buttons[0]) : 決定（走り出す・会話を進める）
 *   OPTIONS / Menu (buttons[9]) : セットアップ画面
 *   十字キー左右 (14/15) : ステア（デジタル）
 */
import type { DriveInput } from './keyboard'

export type PadButton = 'confirm' | 'camera' | 'handbrake' | 'reset' | 'options' | 'share' | 'dpadUp' | 'dpadDown' | 'dpadLeft' | 'dpadRight' | 'l1' | 'r1'

const BUTTON_INDEX: Record<PadButton, number> = {
  confirm: 0,
  camera: 1,
  handbrake: 2,
  reset: 3,
  l1: 4,
  r1: 5,
  share: 8,
  options: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
}

const DEADZONE = 0.12

function applyDeadzone(v: number): number {
  const a = Math.abs(v)
  if (a < DEADZONE) return 0
  const n = (a - DEADZONE) / (1 - DEADZONE)
  // 中立付近を穏やかに（軽い指数カーブ）
  return Math.sign(v) * Math.pow(n, 1.4)
}

export class GamepadInput {
  private prev = new Map<PadButton, boolean>()
  private pressed = new Set<PadButton>()
  private lastId: string | null = null

  /** 接続中のパッド（標準マッピング優先） */
  get pad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null
    const pads = navigator.getGamepads()
    let best: Gamepad | null = null
    for (const p of pads) {
      if (!p || !p.connected) continue
      if (p.mapping === 'standard') return p
      best ??= p
    }
    return best
  }

  get connected(): boolean {
    return this.pad !== null
  }

  get id(): string | null {
    return this.pad?.id ?? null
  }

  /** 毎フレーム呼ぶ: ボタンのエッジを更新する */
  poll(): void {
    const pad = this.pad
    if (!pad) {
      this.prev.clear()
      this.lastId = null
      return
    }
    if (pad.id !== this.lastId) {
      this.lastId = pad.id
      this.prev.clear()
    }
    for (const [name, idx] of Object.entries(BUTTON_INDEX) as [PadButton, number][]) {
      const down = (pad.buttons[idx]?.pressed ?? false) || (pad.buttons[idx]?.value ?? 0) > 0.5
      if (down && !this.prev.get(name)) this.pressed.add(name)
      this.prev.set(name, down)
    }
  }

  isDown(name: PadButton): boolean {
    return this.prev.get(name) ?? false
  }

  /** 押下エッジを 1 回だけ消費する */
  consume(name: PadButton): boolean {
    if (!this.pressed.has(name)) return false
    this.pressed.delete(name)
    return true
  }

  read(): DriveInput | null {
    const pad = this.pad
    if (!pad) return null
    const axisX = applyDeadzone(pad.axes[0] ?? 0)
    const dpad = (this.isDown('dpadRight') ? 1 : 0) - (this.isDown('dpadLeft') ? 1 : 0)
    const trigger = (i: number) => {
      const b = pad.buttons[i]
      if (!b) return 0
      return b.value > 0 ? b.value : b.pressed ? 1 : 0
    }
    return {
      throttle: trigger(7),
      brake: trigger(6),
      steer: Math.max(-1, Math.min(1, axisX + dpad)),
      handbrake: this.isDown('handbrake') || this.isDown('l1'),
    }
  }

  /** 振動（対応していなければ何もしない） */
  rumble(strong: number, weak: number, durationMs: number): void {
    const pad = this.pad
    const actuator = (pad as Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> } } | null)?.vibrationActuator
    if (!actuator?.playEffect) return
    void actuator.playEffect('dual-rumble', { startDelay: 0, duration: durationMs, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => undefined)
  }
}

export const gamepad = new GamepadInput()

/** キーボードとパッドの入力を合成（それぞれの大きい方） */
export function mergeInputs(a: DriveInput, b: DriveInput | null): DriveInput {
  if (!b) return a
  return {
    throttle: Math.max(a.throttle, b.throttle),
    brake: Math.max(a.brake, b.brake),
    steer: Math.abs(b.steer) > Math.abs(a.steer) ? b.steer : a.steer,
    handbrake: a.handbrake || b.handbrake,
  }
}
