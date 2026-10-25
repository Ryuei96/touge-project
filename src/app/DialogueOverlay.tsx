import { useEffect } from 'react'
import { SPEAKERS } from '../race/dialogue'
import { useGameStore } from './gameStore'

const LINE_MS = 3200

export function DialogueOverlay() {
  const dialogue = useGameStore((s) => s.dialogue)
  const advance = useGameStore((s) => s.advanceDialogue)
  const key = dialogue?.key
  const index = dialogue?.index
  useEffect(() => {
    if (key === undefined) return
    const t = window.setTimeout(advance, LINE_MS)
    return () => window.clearTimeout(t)
  }, [key, index, advance])
  if (!dialogue) return null
  const line = dialogue.lines[dialogue.index]
  const speaker = SPEAKERS[line.speaker]
  return (
    <div className="dialogue" onClick={advance}>
      <span className="speaker" style={{ color: speaker?.color }}>
        {speaker?.name ?? line.speaker}
      </span>
      <span className="line">{line.text}</span>
    </div>
  )
}
