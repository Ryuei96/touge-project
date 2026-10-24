/**
 * キーボード入力。
 * W/S: アクセル・ブレーキ, A/D: ステア, Space: サイドブレーキ, R: 復帰, C: カメラ切替。
 * 矢印キーも同等に扱う。
 */
export interface DriveInput {
  /** 0..1 */
  throttle: number
  /** 0..1 */
  brake: number
  /** -1 (左) .. +1 (右) */
  steer: number
  handbrake: boolean
}

export const EMPTY_INPUT: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false }

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export class KeyboardInput {
  private down = new Set<string>()
  private pressed = new Set<string>()
  private target: Window | null = null

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault()
    if (!this.down.has(e.code)) this.pressed.add(e.code)
    this.down.add(e.code)
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code)
  }
  private onBlur = () => {
    this.down.clear()
  }

  attach(target: Window): void {
    if (this.target) this.detach()
    this.target = target
    target.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('keyup', this.onKeyUp)
    target.addEventListener('blur', this.onBlur)
  }

  detach(): void {
    if (!this.target) return
    this.target.removeEventListener('keydown', this.onKeyDown)
    this.target.removeEventListener('keyup', this.onKeyUp)
    this.target.removeEventListener('blur', this.onBlur)
    this.target = null
    this.down.clear()
  }

  isDown(code: string): boolean {
    return this.down.has(code)
  }

  /** 押下エッジを 1 回だけ消費する */
  consume(code: string): boolean {
    if (!this.pressed.has(code)) return false
    this.pressed.delete(code)
    return true
  }

  /** テスト・外部制御用に押下状態を注入する */
  setKey(code: string, down: boolean): void {
    if (down) {
      if (!this.down.has(code)) this.pressed.add(code)
      this.down.add(code)
    } else this.down.delete(code)
  }

  read(): DriveInput {
    const up = this.isDown('KeyW') || this.isDown('ArrowUp')
    const dn = this.isDown('KeyS') || this.isDown('ArrowDown')
    const lf = this.isDown('KeyA') || this.isDown('ArrowLeft')
    const rt = this.isDown('KeyD') || this.isDown('ArrowRight')
    return {
      throttle: up ? 1 : 0,
      brake: dn ? 1 : 0,
      steer: (rt ? 1 : 0) - (lf ? 1 : 0),
      handbrake: this.isDown('Space'),
    }
  }
}

export const keyboard = new KeyboardInput()
