/** アーケード風の計器: 速度の針メーター、回転計バー、ギア */
import { useEffect, useRef } from 'react'
import { audioEngine } from '../audio/AudioEngine'
import { runtime } from './runtime'

const MAX_KMH = 240

export function Speedometer() {
  const needle = useRef<SVGLineElement>(null)
  const rpmBar = useRef<SVGRectElement>(null)
  const speedText = useRef<SVGTextElement>(null)
  const gearText = useRef<SVGTextElement>(null)
  useEffect(() => {
    let raf = 0
    let shown = 0
    const tick = () => {
      const kmh = Math.abs(runtime.speedMs) * 3.6
      shown += (kmh - shown) * 0.2
      const t = Math.min(1, shown / MAX_KMH)
      const angle = -120 + t * 240
      if (needle.current) needle.current.setAttribute('transform', `rotate(${angle} 100 100)`)
      if (speedText.current) speedText.current.textContent = String(Math.round(shown))
      const rpm = audioEngine.currentRpm
      const r = Math.max(0, Math.min(1, (rpm - 800) / 6800))
      if (rpmBar.current) {
        rpmBar.current.setAttribute('width', String(Math.round(r * 150)))
        rpmBar.current.setAttribute('fill', r > 0.9 ? '#ff4d4d' : r > 0.75 ? '#ffb84d' : '#3ddcff')
      }
      if (gearText.current) gearText.current.textContent = runtime.speedMs < -0.5 ? 'R' : Math.abs(runtime.speedMs) < 0.3 && runtime.throttle === 0 ? 'N' : String(audioEngine.currentGear)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const ticks = []
  for (let v = 0; v <= MAX_KMH; v += 20) {
    const a = ((-120 + (v / MAX_KMH) * 240) * Math.PI) / 180
    const major = v % 40 === 0
    const r0 = major ? 70 : 76
    const x0 = 100 + Math.sin(a) * r0, y0 = 100 - Math.cos(a) * r0
    const x1 = 100 + Math.sin(a) * 84, y1 = 100 - Math.cos(a) * 84
    ticks.push(<line key={v} x1={x0} y1={y0} x2={x1} y2={y1} stroke={v >= 180 ? '#ff6a6a' : '#dfe6ee'} strokeWidth={major ? 2.5 : 1.2} />)
    if (major) ticks.push(<text key={`t${v}`} x={100 + Math.sin(a) * 58} y={100 - Math.cos(a) * 58 + 4} fontSize="11" fill="#cfd6de" textAnchor="middle">{v}</text>)
  }
  return (
    <svg viewBox="0 0 200 150" className="speedo" aria-label="スピードメーター">
      <defs>
        <radialGradient id="dial" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#1b2230" />
          <stop offset="100%" stopColor="#0a0d14" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="92" fill="url(#dial)" stroke="#3a4454" strokeWidth="2" />
      <path d="M 100 100 L 100 10" stroke="none" />
      {ticks}
      <line ref={needle} x1="100" y1="112" x2="100" y2="24" stroke="#ff5a4a" strokeWidth="3" strokeLinecap="round" transform="rotate(-120 100 100)" />
      <circle cx="100" cy="100" r="6" fill="#e9eef3" />
      <text ref={speedText} x="100" y="128" fontSize="26" fontWeight="700" fill="#ffffff" textAnchor="middle" fontFamily="'Segoe UI', system-ui, sans-serif">0</text>
      <text x="100" y="140" fontSize="9" fill="#9aa6b2" textAnchor="middle">km/h</text>
      <rect x="25" y="143" width="150" height="5" rx="2" fill="#2a3240" />
      <rect ref={rpmBar} x="25" y="143" width="0" height="5" rx="2" fill="#3ddcff" />
      <text ref={gearText} x="176" y="126" fontSize="18" fontWeight="700" fill="#f5c542" textAnchor="middle">N</text>
      <text x="176" y="136" fontSize="8" fill="#9aa6b2" textAnchor="middle">GEAR</text>
    </svg>
  )
}
