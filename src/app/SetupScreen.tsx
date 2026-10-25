/**
 * 走行前セットアップ画面。コース・ライバル・時間帯・サウンド、ガレージ、キャラクターをタブで切り替える。
 */
import { useState } from 'react'
import { audioEngine } from '../audio/AudioEngine'
import { courseManager } from '../course'
import { CharacterPanel } from './CharacterPanel'
import { GaragePanel } from './GaragePanel'
import { useGameStore, type TimeOfDay } from './gameStore'
import { useGarageStore } from './garageStore'
import { runtime } from './runtime'

type Tab = 'race' | 'garage' | 'characters'

export function SetupScreen() {
  const s = useGameStore()
  const rivals = useGarageStore((st) => st.rivals)
  const courses = courseManager.list()
  const [tab, setTab] = useState<Tab>('race')
  const enabledRivals = rivals.filter((r) => r.enabled).length
  const start = () => {
    audioEngine.start()
    audioEngine.setStyle(s.bgmStyle)
    audioEngine.setMuted(s.muted)
    s.resetRace()
    runtime.resetRequested = true
    s.patch({ rivalEnabled: enabledRivals > 0, intro: true })
  }
  return (
    <div className="setup-backdrop">
      <div className="setup panel">
        <div className="title">
          TOUGE DRIVE WEB <span className="ver">v0.3</span>
        </div>
        <div className="tabs">
          {(
            [
              ['race', 'レース'],
              ['garage', 'ガレージ'],
              ['characters', 'キャラクター'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'race' && (
          <div className="setup-columns">
            <div className="setup-col">
              <div className="subtitle">コース</div>
              <div className="course-list">
                {courses.map((c) => (
                  <button key={c.id} className={`car-card ${c.id === s.courseId ? 'selected' : ''}`} onClick={() => s.setCourse(c.id)}>
                    <span>{c.name}</span>
                    <span className="small">[{c.source}]</span>
                  </button>
                ))}
              </div>
              <div className="small">{s.status === 'loading' ? '読み込み中…' : s.status === 'error' ? `エラー: ${s.errorMessage}` : s.courseName}</div>
            </div>
            <div className="setup-col">
              <div className="subtitle">時間帯</div>
              <div className="row">
                {(
                  [
                    ['day', '昼'],
                    ['dusk', '夕方'],
                    ['night', '夜'],
                  ] as [TimeOfDay, string][]
                ).map(([id, label]) => (
                  <button key={id} className={`mini ${s.timeOfDay === id ? 'active' : ''}`} onClick={() => s.patch({ timeOfDay: id })}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="subtitle">ライバル</div>
              <div className="small">{enabledRivals} 台が出走（キャラクタータブで変更）</div>
              <div className="subtitle">サウンド</div>
              <label className="row small">
                BGM
                <select id="bgm-style" value={s.bgmStyle} onChange={(e) => s.patch({ bgmStyle: e.target.value as typeof s.bgmStyle })}>
                  <option value="eurobeat">ユーロビート風</option>
                  <option value="phonk">ドリフトフォンク風</option>
                  <option value="off">なし</option>
                </select>
                <input id="muted" type="checkbox" checked={s.muted} onChange={(e) => s.patch({ muted: e.target.checked })} /> ミュート (M)
              </label>
              <label className="row small">
                <input id="post-fx" type="checkbox" checked={s.postEffects} onChange={(e) => s.patch({ postEffects: e.target.checked })} /> ポストエフェクト（Bloom / ビネット）
              </label>
            </div>
          </div>
        )}
        {tab === 'garage' && <GaragePanel />}
        {tab === 'characters' && <CharacterPanel />}
        <div className="row setup-actions">
          <button className="primary" onClick={start} disabled={s.status !== 'ready'}>
            走り出す
          </button>
          <span className="small">W/S アクセル・ブレーキ　A/D ステア　Space サイド　R 復帰　C カメラ　M ミュート</span>
        </div>
      </div>
    </div>
  )
}
