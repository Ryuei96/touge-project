import { courseManager } from '../course'
import { CAMERA_LABELS, useGameStore } from './gameStore'

function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export function HUD() {
  const s = useGameStore()
  const courses = courseManager.list()
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
        </div>
        <div className="row small">カメラ: {CAMERA_LABELS[s.cameraMode]} (C) ・ 復帰 {s.resets} 回 (R)</div>
        <label className="row small">
          <input type="checkbox" checked={s.autopilot} onChange={(e) => s.setAutopilot(e.target.checked)} /> オートパイロット (P)
        </label>
      </div>

      <div className="hud-top-right panel">
        <div className="time">{formatTime(s.finished && s.finishTime !== null ? s.finishTime : s.elapsed)}</div>
        <div className="small">{s.finished ? 'FINISH' : s.started ? 'RUNNING' : 'READY'}</div>
      </div>

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
          <div className="finish-title">GOAL!</div>
          <div className="finish-time">{s.finishTime !== null ? formatTime(s.finishTime) : ''}</div>
          <div className="small">R で最終チェックポイントから再開 / コース選択で再走</div>
        </div>
      )}
    </div>
  )
}
