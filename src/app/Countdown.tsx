/** アーケード風カウントダウン 3 → 2 → 1 → GO! */
import { useEffect } from 'react'
import { audioEngine } from '../audio/AudioEngine'
import { useGameStore } from './gameStore'

export function Countdown() {
  const countdown = useGameStore((s) => s.countdown)
  useEffect(() => {
    if (countdown === null) return
    if (countdown > 0) {
      audioEngine.playSfx('beep')
      const t = window.setTimeout(() => useGameStore.getState().patch({ countdown: countdown - 1 }), 1000)
      return () => window.clearTimeout(t)
    }
    audioEngine.playSfx('go')
    const t = window.setTimeout(() => useGameStore.getState().patch({ countdown: null }), 900)
    return () => window.clearTimeout(t)
  }, [countdown])
  if (countdown === null) return null
  return (
    <div className="countdown" key={countdown}>
      <div className={`countdown-number ${countdown === 0 ? 'go' : ''}`}>{countdown === 0 ? 'GO!' : countdown}</div>
    </div>
  )
}
