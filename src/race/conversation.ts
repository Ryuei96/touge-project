/** レース前・レース後の会話を、キャラクターの口調テンプレートから組み立てる */
import { useGarageStore } from '../app/garageStore'
import type { DialogueLine } from '../app/gameStore'
import { getCarPreset } from '../vehicle/carCatalog'
import { banterLine, getCharacter, type BanterEvent } from './characters'

export function buildConversation(kind: 'pre' | 'post', won: boolean): DialogueLine[] {
  const g = useGarageStore.getState()
  const player = getCharacter(g.characters, g.playerCharacterId)
  const nav = getCharacter(g.characters, g.navigatorCharacterId)
  const rivals = g.rivals.filter((r) => r.enabled)
  const lines: DialogueLine[] = []
  const seed = kind === 'pre' ? 0 : 1
  const push = (speakerId: string, event: BanterEvent, other = '', carId?: string) => {
    const ch = getCharacter(g.characters, speakerId)
    const text = banterLine(ch.personality, event, { player: player.name, rival: ch.name, other, rivalCar: carId ? getCarPreset(carId).name : undefined }, seed + lines.length)
    if (text) lines.push({ speaker: ch.id, text })
  }
  if (kind === 'pre') {
    for (const r of rivals) push(r.characterId, 'pre-race', player.name, r.carId)
    if (nav.id !== player.id) push(nav.id, 'pre-race')
    push(player.id, 'pre-race')
  } else {
    for (const r of rivals) push(r.characterId, won ? 'post-race-lose' : 'post-race-win', player.name, r.carId)
    if (nav.id !== player.id) push(nav.id, won ? 'post-race-win' : 'post-race-lose')
  }
  return lines
}

