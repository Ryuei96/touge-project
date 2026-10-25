import { Game } from './app/Game'
import { HUD } from './app/HUD'
import { SetupScreen } from './app/SetupScreen'
import { useGameStore } from './app/gameStore'

export default function App() {
  const setupDone = useGameStore((s) => s.setupDone)
  return (
    <div className="app">
      <Game />
      <HUD />
      {!setupDone && <SetupScreen />}
    </div>
  )
}
