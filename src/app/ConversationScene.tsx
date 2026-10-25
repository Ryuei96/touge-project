/**
 * レース前・レース後の会話シーン。キャラクターの似顔絵と台詞を順に見せる。
 */
import { useEffect, useMemo, useState } from 'react'
import { getCharacter } from '../race/characters'
import { buildConversation } from '../race/conversation'
import { Avatar } from './Avatar'
import { useGameStore } from './gameStore'
import { useGarageStore } from './garageStore'

export function ConversationScene({ kind, onDone }: { kind: 'pre' | 'post'; onDone: () => void }) {
  const rank = useGameStore((s) => s.rank)
  const characters = useGarageStore((s) => s.characters)
  const lines = useMemo(() => buildConversation(kind, rank === 1), [kind, rank])
  const [i, setI] = useState(0)
  useEffect(() => {
    if (lines.length === 0) onDone()
  }, [lines, onDone])
  useEffect(() => {
    const t = window.setTimeout(() => (i < lines.length - 1 ? setI(i + 1) : onDone()), 4200)
    return () => window.clearTimeout(t)
  }, [i, lines.length, onDone])
  if (lines.length === 0) return null
  const line = lines[Math.min(i, lines.length - 1)]
  const ch = getCharacter(characters, line.speaker)
  const next = () => (i < lines.length - 1 ? setI(i + 1) : onDone())
  return (
    <div className="setup-backdrop conversation" onClick={next}>
      <div className="conversation-card">
        <div className="conversation-title">{kind === 'pre' ? 'スタート前' : rank === 1 ? 'レース後 — 勝利' : 'レース後'}</div>
        <div className="conversation-row">
          <Avatar character={ch} size={112} />
          <div className="conversation-text">
            <div className="speaker" style={{ color: ch.color }}>
              {ch.name}
            </div>
            <div className="big-line">{line.text}</div>
          </div>
        </div>
        <div className="row small conversation-actions">
          <span>
            {i + 1} / {lines.length}
          </span>
          <button
            className="mini"
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
          >
            次へ
          </button>
          <button
            className="primary small-primary"
            onClick={(e) => {
              e.stopPropagation()
              onDone()
            }}
          >
            {kind === 'pre' ? 'スタート' : '閉じる'}
          </button>
        </div>
      </div>
    </div>
  )
}
