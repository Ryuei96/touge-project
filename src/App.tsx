import { useCallback } from 'react'
import { ConversationScene } from './app/ConversationScene'
import { Game } from './app/Game'
import { GamepadBridge } from './app/GamepadBridge'
import { HUD } from './app/HUD'
import { ResultsScreen } from './app/ResultsScreen'
import { SetupScreen } from './app/SetupScreen'
import { useGameStore } from './app/gameStore'

export default function App() {
  const setupDone = useGameStore((s) => s.setupDone)
  const intro = useGameStore((s) => s.intro)
  const finished = useGameStore((s) => s.finished)
  const outroShown = useGameStore((s) => s.outroShown)
  const rivalEnabled = useGameStore((s) => s.rivalEnabled)
  const finishIntro = useCallback(() => useGameStore.getState().patch({ intro: false, setupDone: true, countdown: 3 }), [])
  const finishOutro = useCallback(() => useGameStore.getState().patch({ outroShown: true }), [])
  return (
    <div className="app">
      <Game />
      <GamepadBridge />
      <HUD />
      {!setupDone && !intro && <SetupScreen />}
      {intro && <ConversationScene kind="pre" onDone={finishIntro} />}
      {setupDone && finished && !outroShown && rivalEnabled && <ConversationScene kind="post" onDone={finishOutro} />}
      {setupDone && finished && (outroShown || !rivalEnabled) && <ResultsScreen />}
    </div>
  )
}
