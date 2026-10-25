import { useEffect } from 'react'
import { getCharacter } from '../race/characters'
import { Avatar } from './Avatar'
import { useGameStore } from './gameStore'
import { useGarageStore } from './garageStore'

const LINE_MS = 3400

export function DialogueOverlay() {
  const dialogue = useGameStore((s) => s.dialogue)
  const advance = useGameStore((s) => s.advanceDialogue)
  const characters = useGarageStore((s) => s.characters)
  const key = dialogue?.key
  const index = dialogue?.index
  useEffect(() => {
    if (key === undefined) return
    const t = window.setTimeout(advance, LINE_MS)
    return () => window.clearTimeout(t)
  }, [key, index, advance])
  if (!dialogue) return null
  const line = dialogue.lines[dialogue.index]
  const ch = getCharacter(characters, line.speaker)
  return (
    <div className="dialogue" onClick={advance} key={`${dialogue.key}-${dialogue.index}`}>
      <Avatar character={ch} size={48} />
      <div className="dialogue-body">
        <span className="speaker" style={{ color: ch.color }}>
          {ch.name}
        </span>
        <span className="line">{line.text}</span>
      </div>
    </div>
  )
}
