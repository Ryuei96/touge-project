/**
 * 走行前セットアップ画面。コース・車種・パーツ・ライバル・BGM を決めてから走り出す。
 */
import { audioEngine } from '../audio/AudioEngine'
import { courseManager } from '../course'
import { runtime } from './runtime'
import { GaragePanel } from './GaragePanel'
import { useGameStore } from './gameStore'

export function SetupScreen() {
  const s = useGameStore()
  const courses = courseManager.list()
  const start = () => {
    audioEngine.start()
    audioEngine.setStyle(s.bgmStyle)
    audioEngine.setMuted(s.muted)
    s.resetRace()
    runtime.resetRequested = true
    s.startRun()
  }
  return (
    <div className="setup-backdrop">
      <div className="setup panel">
        <div className="title">
          TOUGE DRIVE WEB <span className="ver">v0.3</span>
        </div>
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
            <div className="small">{s.status === 'loading' ? '読み込み中…' : s.status === 'error' ? `エラー: ${s.errorMessage}` : `${s.courseName}`}</div>
            <div className="subtitle">ライバル</div>
            <label className="row small">
              <input id="rival-enabled" type="checkbox" checked={s.rivalEnabled} onChange={(e) => s.patch({ rivalEnabled: e.target.checked })} /> ケンジのブラック・GT と対戦する
            </label>
            <label className="row small">
              強さ
              <select id="rival-skill" value={s.rivalSkill} onChange={(e) => s.patch({ rivalSkill: e.target.value as typeof s.rivalSkill })} disabled={!s.rivalEnabled}>
                <option value="easy">練習</option>
                <option value="normal">普通</option>
                <option value="hard">本気</option>
              </select>
            </label>
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
          </div>
          <div className="setup-col">
            <GaragePanel />
          </div>
        </div>
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
