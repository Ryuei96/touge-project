/** キャラクター設定: 名前・口調・見た目、プレイヤー/ナビの割り当て、ライバルのロスター */
import { PERSONALITY_LABELS, type Personality } from '../race/characters'
import { CAR_PRESETS } from '../vehicle/carCatalog'
import { Avatar } from './Avatar'
import { useGarageStore } from './garageStore'

const STYLES: { id: 'short' | 'long' | 'cap' | 'spiky'; label: string }[] = [
  { id: 'short', label: 'ショート' },
  { id: 'long', label: 'ロング' },
  { id: 'spiky', label: 'ツンツン' },
  { id: 'cap', label: 'キャップ' },
]

export function CharacterPanel() {
  const g = useGarageStore()
  return (
    <div className="subpanel">
      <div className="subtitle">キャラクター</div>
      <div className="row small">
        <label>
          プレイヤー
          <select id="player-character" value={g.playerCharacterId} onChange={(e) => g.setPlayerCharacter(e.target.value)}>
            {g.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          ナビ（相棒）
          <select id="navigator-character" value={g.navigatorCharacterId} onChange={(e) => g.setNavigator(e.target.value)}>
            {g.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="mini" onClick={g.resetCharacters}>
          初期化
        </button>
      </div>
      <div className="character-list">
        {g.characters.map((c) => (
          <div key={c.id} className="character-card">
            <Avatar character={c} size={56} />
            <div className="character-fields small">
              <input id={`name-${c.id}`} value={c.name} maxLength={10} onChange={(e) => g.updateCharacter(c.id, { name: e.target.value })} />
              <select id={`personality-${c.id}`} value={c.personality} onChange={(e) => g.updateCharacter(c.id, { personality: e.target.value as Personality })}>
                {(Object.keys(PERSONALITY_LABELS) as Personality[]).map((p) => (
                  <option key={p} value={p}>
                    {PERSONALITY_LABELS[p]}
                  </option>
                ))}
              </select>
              <select id={`style-${c.id}`} value={c.avatar.style} onChange={(e) => g.updateCharacter(c.id, { avatar: { ...c.avatar, style: e.target.value as typeof c.avatar.style } })}>
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="color-row">
                <input id={`hair-${c.id}`} type="color" value={c.avatar.hair} title="髪色" onChange={(e) => g.updateCharacter(c.id, { avatar: { ...c.avatar, hair: e.target.value } })} />
                <input id={`accent-${c.id}`} type="color" value={c.avatar.accent} title="アクセント" onChange={(e) => g.updateCharacter(c.id, { avatar: { ...c.avatar, accent: e.target.value }, color: e.target.value })} />
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="subtitle">ライバル（最大 4 台）</div>
      <div className="rival-list small">
        {g.rivals.map((r) => (
          <div key={r.id} className="rival-row">
            <input id={`rival-on-${r.id}`} type="checkbox" checked={r.enabled} onChange={(e) => g.updateRival(r.id, { enabled: e.target.checked })} />
            <select id={`rival-ch-${r.id}`} value={r.characterId} onChange={(e) => g.updateRival(r.id, { characterId: e.target.value })}>
              {g.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select id={`rival-car-${r.id}`} value={r.carId} onChange={(e) => g.updateRival(r.id, { carId: e.target.value })}>
              {CAR_PRESETS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select id={`rival-skill-${r.id}`} value={r.skill} onChange={(e) => g.updateRival(r.id, { skill: e.target.value as typeof r.skill })}>
              <option value="easy">練習</option>
              <option value="normal">普通</option>
              <option value="hard">本気</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
