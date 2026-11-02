/**
 * ハンドルコントローラー（G923 等）の設定・校正パネル。
 * 生の軸・ボタンを表示しながら、「ハンドルを右に切る」「アクセルを踏む」などの操作で軸を学習する。
 */
import { useEffect, useRef, useState } from 'react'
import { gamepad } from '../input/gamepad'
import { DEFAULT_LOGITECH_MAPPING, GEAR_BUTTONS, detectChangedAxis, detectPressedButton, readWheel, type AxisMap, type WheelButton, type WheelMapping } from '../input/wheel'
import { useGarageStore } from './garageStore'
import { runtime } from './runtime'

type AxisTarget = 'steer' | 'throttle' | 'brake' | 'clutch'
type Step = { kind: 'axis'; target: AxisTarget } | { kind: 'button'; target: WheelButton } | null

const AXIS_LABEL: Record<AxisTarget, string> = { steer: 'ハンドルを右いっぱいに切る', throttle: 'アクセルをいっぱいに踏む', brake: 'ブレーキをいっぱいに踏む', clutch: 'クラッチをいっぱいに踏む' }
const BUTTON_LABEL: Record<WheelButton, string> = {
  confirm: '決定（走り出す・会話送り）',
  handbrake: 'サイドブレーキ',
  reset: '復帰',
  camera: 'カメラ切替',
  options: 'セットアップ画面',
  shiftUp: 'シフトアップ（右パドル）',
  shiftDown: 'シフトダウン（左パドル）',
  gear1: 'シフター 1 速',
  gear2: 'シフター 2 速',
  gear3: 'シフター 3 速',
  gear4: 'シフター 4 速',
  gear5: 'シフター 5 速',
  gear6: 'シフター 6 速',
  gearR: 'シフター R',
}
const MAIN_BUTTONS: WheelButton[] = ['confirm', 'handbrake', 'reset', 'camera', 'options', 'shiftUp', 'shiftDown']

export function WheelPanel() {
  const [snap, setSnap] = useState(gamepad.rawSnapshot())
  const [mapping, setMapping] = useState<WheelMapping>(gamepad.wheel.mapping)
  const [force, setForce] = useState(gamepad.wheel.forceWheel)
  const [step, setStep] = useState<Step>(null)
  const [message, setMessage] = useState('')
  const transmission = useGarageStore((g) => g.transmission)
  const setTransmission = useGarageStore((g) => g.setTransmission)
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
            const am: AxisMap = { axis: hit.axis, rest: hit.from, pressed: hit.to, calibrated: true }
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

  const live = snap && gamepad.kind === 'wheel' ? readWheel({ axes: snap.axes, buttons: snap.buttons.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })) } as unknown as Gamepad, mapping, gamepad.observed) : null

  /** 今のペダル位置を「離した状態」として記憶（踏んだ側は反対の端と仮定） */
  const restNow = () => {
    const cur = gamepad.rawSnapshot()
    if (!cur) return
    const fix = (m: AxisMap | null): AxisMap | null => {
      if (!m) return null
      const rest = cur.axes[m.axis] ?? m.rest
      return { axis: m.axis, rest, pressed: rest > 0 ? -1 : 1, calibrated: true }
    }
    setMapping((m) => ({ ...m, throttle: fix(m.throttle)!, brake: fix(m.brake)!, clutch: fix(m.clutch) }))
    setMessage('今の位置をペダルの休止値として記憶しました')
  }

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
            <div className={`small ${live.brake > 0 || live.throttle > 0 ? 'warn' : ''}`}>
              → ゲーム入力: ステア {live.steer.toFixed(2)} ・ アクセル {live.throttle.toFixed(2)} ・ ブレーキ {live.brake.toFixed(2)} ・ クラッチ {(live.clutch ?? 0).toFixed(2)} ・ サイド {live.handbrake ? 'ON' : 'OFF'} ・ ギア {runtime.gear}
              {live.gearSelect !== null && live.gearSelect !== undefined && ` ・ シフター ${live.gearSelect === -1 ? 'R' : live.gearSelect === 0 ? 'N' : live.gearSelect}`}
            </div>
          )}
          <div className="row">
            <button className="mini" onClick={restNow}>
              ペダルから足を離した状態で押す（休止値を記憶）
            </button>
            <span className="small dim">足を離してもアクセル/ブレーキが 0 にならない時に</span>
          </div>
        </div>
      )}

      <div className="subtitle">校正（ボタンを押してから、書いてある操作をする）</div>
      <div className="calib-grid">
        {(Object.keys(AXIS_LABEL) as AxisTarget[]).map((t) => (
          <button key={t} className={`mini ${step?.kind === 'axis' && step.target === t ? 'active' : ''}`} onClick={() => begin({ kind: 'axis', target: t })} disabled={!snap}>
            {AXIS_LABEL[t]}
          </button>
        ))}
        {MAIN_BUTTONS.map((t) => (
          <button key={t} className={`mini ${step?.kind === 'button' && step.target === t ? 'active' : ''}`} onClick={() => begin({ kind: 'button', target: t })} disabled={!snap}>
            {BUTTON_LABEL[t]}（{mapping.buttons[t]}）
          </button>
        ))}
      </div>
      <div className="small calib-msg">{step ? '待機中… 操作してください' : message}</div>

      <div className="subtitle">変速</div>
      <div className="row small">
        {(
          [
            ['manual', 'MT（パドル / シフター / クラッチ）'],
            ['auto', 'AT（停車中にブレーキで後退）'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`mini ${transmission === id ? 'active' : ''}`} onClick={() => setTransmission(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="small dim">MT: 右パドルでアップ、左パドルでダウン（1 → N → R は停車時のみ）。クラッチを踏むと駆動が切れる。レッドラインで駆動カット。</div>
      <div className="subtitle">H パターンシフター（Driving Force Shifter 等。使わなければ未設定のまま）</div>
      <div className="calib-grid">
        {GEAR_BUTTONS.map(({ name }) => (
          <button key={name} className={`mini ${step?.kind === 'button' && step.target === name ? 'active' : ''}`} onClick={() => begin({ kind: 'button', target: name })} disabled={!snap}>
            {BUTTON_LABEL[name]}（{mapping.buttons[name] < 0 ? '未設定' : mapping.buttons[name]}）
          </button>
        ))}
        <button className="mini" onClick={() => setMapping((m) => ({ ...m, buttons: { ...m.buttons, gear1: -1, gear2: -1, gear3: -1, gear4: -1, gear5: -1, gear6: -1, gearR: -1 } }))}>
          シフター設定を消す
        </button>
      </div>

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
      <div className="small dim">G HUB のペダル設定は「分離（Separate）」にしてください。「結合（Combined）」だとアクセルとブレーキが 1 軸になり正しく読めません。フォースフィードバックはブラウザの Gamepad API では扱えません（G HUB のセンタリングスプリングが効きます）。</div>
    </div>
  )
}
