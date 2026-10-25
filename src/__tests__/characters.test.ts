import { describe, expect, it } from 'vitest'
import { DEFAULT_CHARACTERS, DEFAULT_RIVALS, banterLine, fillTemplate, getCharacter } from '../race/characters'

describe('characters', () => {
  it('fills placeholders', () => {
    expect(fillTemplate('{player} vs {rival} ({rivalCar}) / {other}', { player: 'A', rival: 'B', rivalCar: 'C', other: 'D' })).toBe('A vs B (C) / D')
  })
  it('returns personality-specific lines deterministically', () => {
    const a = banterLine('hot', 'pre-race', { player: 'ハルト' }, 0)
    const b = banterLine('hot', 'pre-race', { player: 'ハルト' }, 0)
    expect(a).toBe(b)
    expect(banterLine('joker', 'post-race-lose', { player: 'ハルト' }, 3)).toContain('ハルト')
    expect(banterLine('cool', 'checkpoint', { player: 'x' }, 0)).toBeUndefined()
  })
  it('has a valid default roster', () => {
    for (const r of DEFAULT_RIVALS) expect(DEFAULT_CHARACTERS.some((c) => c.id === r.characterId)).toBe(true)
    expect(getCharacter(DEFAULT_CHARACTERS, 'nope').id).toBe(DEFAULT_CHARACTERS[0].id)
  })
})
