import { useState } from 'react'
import { courseManager } from '../course'
import { CAMERA_LABELS, useGameStore } from './gameStore'
import { GaragePanel } from './GaragePanel'
import { PlacementPanel } from './PlacementPanel'
import { Minimap } from './Minimap'
import { DialogueOverlay } from './DialogueOverlay'
import type { BuiltCourse } from '../course/types'
import { runtime } from './runtime'
import { Countdown } from './Countdown'
import { Speedometer } from './Speedometer'
import { formatDelta } from '../race/records'

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
            順位 <b className={s.rank === 1 ? 'rank-first' : 'rank-second'}>{s.rank} 位</b> / {s.rankTotal} {s.rivalFinished && !s.finished && '（先にゴールした車あり）'}
          </div>
        )}
        <div className="row small">
          カメラ: {CAMERA_LABELS[s.cameraMode]} (C) ・ 復帰 {s.resets} 回 (R)
          {s.gamepadConnected && (
            <span className="pad-badge" title={s.gamepadId}>
              🎮 パッド接続中
            </span>
          )}
        </div>
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

      <div className="hud-bottom-right gauge">
        <Speedometer />
      </div>

      <Countdown />
      {s.nextCorner && s.setupDone && !s.finished && (
        <div className={`corner-guide sev-${s.nextCorner.severity} ${s.nextCorner.distance < 40 ? 'near' : ''}`} aria-label="次のコーナー">
          <span className="corner-arrow">{s.nextCorner.dir === 'left' ? '◀' : '▶'}</span>
          <span className="corner-text">
            <b>{s.nextCorner.dir === 'left' ? 'LEFT' : 'RIGHT'} {s.nextCorner.severity === 3 ? 'ヘアピン' : s.nextCorner.severity === 2 ? '中速' : '高速'}</b>
            <span>{s.nextCorner.distance < 8 ? 'NOW' : `${Math.round(s.nextCorner.distance / 5) * 5} m`}</span>
          </span>
        </div>
      )}
      {s.lastSplit && !s.finished && (
        <div className={`sector-popup ${s.lastSplit.delta !== null && s.lastSplit.delta > 0 ? 'bad' : 'good'}`} key={s.lastSplit.key}>
          <div className="sector-title">SECTION {s.lastSplit.index + 1} 通過</div>
          <div className="sector-time">{formatTime(s.lastSplit.time)}</div>
          <div className="sector-delta">{s.lastSplit.delta === null ? '初記録' : formatDelta(s.lastSplit.delta)}</div>
        </div>
      )}

      <div className="hud-bottom-left panel small">
        {s.gamepadConnected ? (
          <>
            <div>R2 アクセル　L2 ブレーキ(後退)　左スティック ステア</div>
            <div>□ サイドブレーキ　△ 復帰　○ カメラ　× 決定　OPTIONS セットアップ</div>
          </>
        ) : (
          <>
            <div>W/S アクセル・ブレーキ(後退)　A/D ステア</div>
            <div>Space サイドブレーキ　R 復帰　C カメラ切替</div>
          </>
        )}
      </div>

      {s.finished && !s.result && (
        <div className="finish-banner">
          <div className="finish-title">{s.rivalEnabled ? (s.rank === 1 ? 'WIN!' : `${s.rank} 位`) : 'GOAL!'}</div>
          <div className="finish-time">{s.finishTime !== null ? formatTime(s.finishTime) : ''}</div>
          <div className="small">R で最終チェックポイントから再開 / コース選択で再走</div>
        </div>
      )}
    </div>
  )
}
