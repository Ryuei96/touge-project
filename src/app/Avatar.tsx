/** 簡易 SVG 似顔絵。髪型・髪色・肌色・アクセント色で描き分ける */
import type { Character } from '../race/characters'

export function Avatar({ character, size = 56 }: { character: Character; size?: number }) {
  const { hair, skin, accent, style } = character.avatar
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label={character.name} className="avatar">
      <circle cx="32" cy="32" r="31" fill="#111722" stroke={accent} strokeWidth="2" />
      {/* 首・服 */}
      <rect x="24" y="44" width="16" height="10" rx="3" fill={skin} />
      <path d="M12 64 Q32 44 52 64 Z" fill={accent} opacity="0.9" />
      {/* 顔 */}
      <ellipse cx="32" cy="32" rx="13" ry="15" fill={skin} />
      {/* 髪 */}
      {style === 'short' && <path d="M19 30 Q20 14 32 14 Q44 14 45 30 Q40 22 32 22 Q24 22 19 30 Z" fill={hair} />}
      {style === 'long' && <path d="M17 44 Q16 12 32 13 Q48 12 47 44 L43 44 Q44 24 32 22 Q20 24 21 44 Z" fill={hair} />}
      {style === 'spiky' && <path d="M18 30 L22 12 L27 22 L32 10 L37 22 L42 12 L46 30 Q40 22 32 23 Q24 22 18 30 Z" fill={hair} />}
      {style === 'cap' && (
        <>
          <path d="M18 28 Q20 14 32 14 Q44 14 46 28 Z" fill={hair} />
          <rect x="14" y="26" width="36" height="5" rx="2" fill={accent} />
          <rect x="18" y="24" width="28" height="4" rx="2" fill={accent} />
        </>
      )}
      {/* 目・口 */}
      <circle cx="26.5" cy="33" r="1.6" fill="#1a1a1a" />
      <circle cx="37.5" cy="33" r="1.6" fill="#1a1a1a" />
      <path d="M28 40 Q32 43 36 40" stroke="#6b3a2a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
