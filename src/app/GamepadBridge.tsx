/**
 * ゲームパッドのメニュー操作と接続状態。
 * × で決定（セットアップの「走り出す」、会話の送り）、OPTIONS でセットアップ画面、○ でカメラ、△ で復帰。
 * 走行入力そのものは Vehicle 側で毎物理ステップ読む。
 */
import { useEffect } from 'react'
import { gamepad } from '../input/gamepad'
import { useGameStore } from './gameStore'
import { runtime } from './runtime'

export function GamepadBridge() {
  useEffect(() => {
    let raf = 0
    const tick = () => {
      gamepad.poll()
      const s = useGameStore.getState()
      const connected = gamepad.connected
      if (connected !== s.gamepadConnected) s.patch({ gamepadConnected: connected, gamepadId: gamepad.id ?? undefined })
      if (connected) {
        if (gamepad.consume('confirm')) {
          if (s.intro) document.querySelector<HTMLButtonElement>('.conversation-actions .mini')?.click()
          else if (!s.setupDone) document.querySelector<HTMLButtonElement>('.setup-actions .primary')?.click()
          else if (s.finished && !s.outroShown) document.querySelector<HTMLButtonElement>('.conversation-actions .mini')?.click()
          else if (s.dialogue) s.advanceDialogue()
        }
        if (gamepad.consume('options')) {
          if (s.setupDone && !s.intro) s.patch({ setupDone: false })
          else if (!s.setupDone && !s.intro) document.querySelector<HTMLButtonElement>('.setup-actions .primary')?.click()
        }
        if (s.setupDone) {
          if (gamepad.consume('camera')) s.cycleCamera()
          if (gamepad.consume('reset')) {
            runtime.resetRequested = true
            s.patch({ resets: s.resets + 1 })
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}
