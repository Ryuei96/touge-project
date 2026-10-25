import { useState } from 'react'
import { courseManager } from '../course'
import { CAMERA_LABELS, useGameStore } from './gameStore'
import { GaragePanel } from './GaragePanel'
import { PlacementPanel } from './PlacementPanel'
import { Minimap } from './Minimap'
import { DialogueOverlay } from './DialogueOverlay'
import type { BuiltCourse } from '../course/types'
import { runtime } from './runtime'

function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

type Panel = 'none' | 'garage' | 'place'

export function HUD() {
  const s = useGameStore()
  const course: BuiltCourse | null = s.status === 'ready' ? runtime.course : null
  const courses = courseManager.list()
  const [panel, setPanel] = useState<Panel>('none')
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p))
  return (
    <div className="hud">
      <div className="hud-top-left panel">
        <div className="title">TOUGE DRIVE WEB <span className="ver">v0.3</span></div>
        <label className="row">
          コース
          <select value={s.courseId} onChange={(e) => s.setCourse(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} [{c.source}]
              </option>
            ))}
          </select>
        </label>
        <div className="row small">
          {s.status === 'loading' && '読み込み中…'}
          {s.status === 'error' && <span className="err">エラー: {s.errorMessage}</span>}
          {s.status === 'ready' && `CP ${Math.min(s.checkpointIndex, s.checkpointTotal)}/${s.checkpointTotal} ・ 進行 ${(s.progress * 100).toFixed(0)}%`}
          {s.status === 'ready' && s.lapTotal > 1 && ` ・ ${Math.min(s.lap, s.lapTotal)}/${s.lapTotal} 周目`}
        </div>
        {s.rivalEnabled && (
          <div className="row small">
            順位 <b className={s.rank === 1 ? 'rank-first' : 'rank-second'}>{s.rank} 位</b> / 2 {s.rivalFinished && !s.finished && '（ライバルはゴール済み）'}
          </div>
        )}
        <div className="row small">カメラ: {CAMERA_LABELS[s.cameraMode]} (C) ・ 復帰 {s.resets} 回 (R)</div>
        <label className="row small">
          <input type="checkbox" checked={s.autopilot} onChange={(e) => s.setAutopilot(e.target.checked)} /> オートパイロット (P)
        </label>
        <div className="row">
          <button className={`mini ${panel === 'garage' ? 'active' : ''}`} onClick={() => toggle('garage')}>
            ガレージ
          </button>
          <button className={`mini ${panel === 'place' ? 'active' : ''}`} onClick={() => toggle('place')}>
            モデル配置
          </button>
          <button className="mini" onClick={() => s.patch({ setupDone: false })}>
            セットアップ
          </button>
          <button className={`mini ${s.muted ? '' : 'active'}`} onClick={() => s.patch({ muted: !s.muted })} title="M キー">
            {s.muted ? '音: OFF' : '音: ON'}
          </button>
        </div>
        {panel === 'garage' && <GaragePanel />}
        {panel === 'place' && <PlacementPanel />}
      </div>

      <div className="hud-top-right panel">
        <div className="time">{formatTime(s.finished && s.finishTime !== null ? s.finishTime : s.elapsed)}</div>
        <div className="small">{s.finished ? 'FINISH' : s.started ? 'RUNNING' : 'READY'}</div>
        <Minimap course={course} />
        <div className="progress-bar" aria-label="進行度">
          <div className="progress-fill" style={{ width: `${(s.progress * 100).toFixed(1)}%` }} />
        </div>
      </div>

      <DialogueOverlay />

      <div className="hud-bottom-right panel">
        <div className="speed">
          {s.speedKmh.toFixed(0)}
          <span className="unit"> km/h</span>
        </div>
        <div className="small">
          {s.gear} ・ 接地 {s.wheelsOnGround}/4
        </div>
      </div>

      <div className="hud-bottom-left panel small">
        <div>W/S アクセル・ブレーキ(後退)　A/D ステア</div>
        <div>Space サイドブレーキ　R 復帰　C カメラ切替</div>
      </div>

      {s.finished && (
        <div className="finish-banner">
          <div className="finish-title">{s.rivalEnabled ? (s.rank === 1 ? 'WIN!' : 'LOSE…') : 'GOAL!'}</div>
          <div className="finish-time">{s.finishTime !== null ? formatTime(s.finishTime) : ''}</div>
          <div className="small">R で最終チェックポイントから再開 / コース選択で再走</div>
        </div>
      )}
    </div>
  )
}
