/**
 * ハンドルコントローラー（G923 等）の設定・校正パネル。
 * 生の軸・ボタンを表示しながら、「ハンドルを右に切る」「アクセルを踏む」などの操作で軸を学習する。
 */
import { useEffect, useRef, useState } from 'react'
import { gamepad } from '../input/gamepad'
import { DEFAULT_LOGITECH_MAPPING, detectChangedAxis, detectPressedButton, readWheel, type WheelButton, type WheelMapping } from '../input/wheel'

type AxisTarget = 'steer' | 'throttle' | 'brake' | 'clutch'
type Step = { kind: 'axis'; target: AxisTarget } | { kind: 'button'; target: WheelButton } | null

const AXIS_LABEL: Record<AxisTarget, string> = { steer: 'ハンドルを右いっぱいに切る', throttle: 'アクセルをいっぱいに踏む', brake: 'ブレーキをいっぱいに踏む', clutch: 'クラッチをいっぱいに踏む' }
const BUTTON_LABEL: Record<WheelButton, string> = { confirm: '決定（走り出す・会話送り）', handbrake: 'サイドブレーキ', reset: '復帰', camera: 'カメラ切替', options: 'セットアップ画面', shiftUp: 'シフトアップ（右パドル）', shiftDown: 'シフトダウン（左パドル）' }

export function WheelPanel() {
  const [snap, setSnap] = useState(gamepad.rawSnapshot())
  const [mapping, setMapping] = useState<WheelMapping>(gamepad.wheel.mapping)
  const [force, setForce] = useState(gamepad.wheel.forceWheel)
  const [step, setStep] = useState<Step>(null)
  const [message, setMessage] = useState('')
  const baseline = useRef<{ axes: number[]; buttons: boolean[] } | null>(null)
  const stepRef = useRef<Step>(null)
  useEffect(() => {
    stepRef.current = step
  }, [step])

  // 生値を 20 Hz で表示・校正
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = gamepad.rawSnapshot()
      setSnap(s)
      const st = stepRef.current
      if (!st || !s || !baseline.current) return
      if (st.kind === 'axis') {
        const hit = detectChangedAxis(baseline.current.axes, s.axes)
        if (!hit) return
        setMapping((m) => {
          const next = { ...m }
          if (st.target === 'steer') {
            next.steerAxis = hit.axis
            next.steerInvert = hit.to < hit.from // 右に切って負になるなら反転
          } else {
            const am = { axis: hit.axis, rest: hit.from, pressed: hit.to }
            if (st.target === 'throttle') next.throttle = am
            else if (st.target === 'brake') next.brake = am
            else next.clutch = am
          }
          return next
        })
        setMessage(`${AXIS_LABEL[st.target]} → 軸 ${hit.axis}（${hit.from.toFixed(2)} → ${hit.to.toFixed(2)}）`)
        setStep(null)
      } else {
        const idx = detectPressedButton(baseline.current.buttons, s.buttons)
        if (idx === null) return
        setMapping((m) => ({ ...m, buttons: { ...m.buttons, [st.target]: idx } }))
        setMessage(`${BUTTON_LABEL[st.target]} → ボタン ${idx}`)
        setStep(null)
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [])

  // 変更は即保存
  useEffect(() => {
    gamepad.updateWheel({ mapping, forceWheel: force })
  }, [mapping, force])

  const begin = (s: Step) => {
    const cur = gamepad.rawSnapshot()
    if (!cur) return
    baseline.current = { axes: cur.axes, buttons: cur.buttons }
    setMessage('')
    setStep(s)
  }

  const live = snap && gamepad.kind === 'wheel' ? readWheel({ axes: snap.axes, buttons: snap.buttons.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })) } as unknown as Gamepad, mapping) : null

  return (
    <div className="wheel-panel">
      <div className="subtitle">ハンドルコントローラー</div>
      {!snap ? (
        <div className="small">機器が見つかりません。ハンドルを少し回すかボタンを押すとブラウザが認識します（USB 接続・G HUB 起動済みで）。</div>
      ) : (
        <div className="small">
          接続中: <b>{snap.id}</b> ・ マッピング {snap.mapping || '(非標準)'} ・ 扱い: <b>{gamepad.kind === 'wheel' ? 'ハンコン' : 'ゲームパッド'}</b>
        </div>
      )}
      <label className="row small">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> 認識されない機器もハンコンとして扱う
      </label>

      {snap && (
        <div className="wheel-raw">
          <div className="small">軸の生値</div>
          <div className="axis-list">
            {snap.axes.map((v, i) => (
              <div key={i} className="axis-row">
                <span className="axis-name">
                  {i}
                  {i === mapping.steerAxis ? ' ステア' : i === mapping.throttle.axis ? ' アクセル' : i === mapping.brake.axis ? ' ブレーキ' : mapping.clutch && i === mapping.clutch.axis ? ' クラッチ' : ''}
                </span>
                <span className="axis-bar">
                  <span className="axis-fill" style={{ left: `${Math.min(50, 50 + v * 50)}%`, width: `${Math.abs(v) * 50}%` }} />
                </span>
                <span className="axis-val">{v.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="small">
            ボタン: {snap.buttons.map((b, i) => (b ? <span key={i} className="btn-on">{i}</span> : null))}
            {snap.buttons.every((b) => !b) && <span className="dim">（押されていません）</span>}
          </div>
          {live && (
            <div className="small">
              → ゲーム入力: ステア {live.steer.toFixed(2)} ・ アクセル {live.throttle.toFixed(2)} ・ ブレーキ {live.brake.toFixed(2)} ・ サイド {live.handbrake ? 'ON' : 'OFF'}
            </div>
          )}
        </div>
      )}

      <div className="subtitle">校正（ボタンを押してから、書いてある操作をする）</div>
      <div className="calib-grid">
        {(Object.keys(AXIS_LABEL) as AxisTarget[]).map((t) => (
          <button key={t} className={`mini ${step?.kind === 'axis' && step.target === t ? 'active' : ''}`} onClick={() => begin({ kind: 'axis', target: t })} disabled={!snap}>
            {AXIS_LABEL[t]}
          </button>
        ))}
        {(Object.keys(BUTTON_LABEL) as WheelButton[]).map((t) => (
          <button key={t} className={`mini ${step?.kind === 'button' && step.target === t ? 'active' : ''}`} onClick={() => begin({ kind: 'button', target: t })} disabled={!snap}>
            {BUTTON_LABEL[t]}（{mapping.buttons[t]}）
          </button>
        ))}
      </div>
      <div className="small calib-msg">{step ? '待機中… 操作してください' : message}</div>

      <div className="subtitle">ステアリング</div>
      <label className="row small">
        ハンドルの回転角
        <select value={mapping.wheelRotationDeg} onChange={(e) => setMapping({ ...mapping, wheelRotationDeg: Number(e.target.value) })}>
          {[180, 270, 360, 540, 720, 900, 1080].map((d) => (
            <option key={d} value={d}>
              {d}°
            </option>
          ))}
        </select>
        <span className="dim">（G HUB の設定に合わせる。G923 の既定は 900°）</span>
      </label>
      <label className="row small">
        フルロックまでの切れ角 {mapping.lockToLockDeg}°
        <input type="range" min={90} max={900} step={10} value={mapping.lockToLockDeg} onChange={(e) => setMapping({ ...mapping, lockToLockDeg: Number(e.target.value) })} />
        <span className="dim">小さいほどクイック</span>
      </label>
      <label className="row small">
        中立付近の穏やかさ {mapping.linearity.toFixed(1)}
        <input type="range" min={1} max={2.5} step={0.1} value={mapping.linearity} onChange={(e) => setMapping({ ...mapping, linearity: Number(e.target.value) })} />
      </label>
      <label className="row small">
        <input type="checkbox" checked={mapping.steerInvert} onChange={(e) => setMapping({ ...mapping, steerInvert: e.target.checked })} /> ステアを反転
      </label>
      <div className="row">
        <button className="mini" onClick={() => { setMapping(DEFAULT_LOGITECH_MAPPING); setMessage('Logitech の既定値に戻しました') }}>
          既定値に戻す（Logitech）
        </button>
      </div>
      <div className="small dim">フォースフィードバックはブラウザの Gamepad API では扱えません。G HUB 側のセンタリングスプリングが効きます。</div>
    </div>
  )
}
