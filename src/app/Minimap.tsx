/**
 * ミニマップ: コース中心線（XZ 平面）・チェックポイント・自車・ライバル車を描く。
 * runtime を直接読み、requestAnimationFrame で更新する（React の再レンダリングを介さない）。
 */
import { useEffect, useRef } from 'react'
import type { BuiltCourse } from '../course/types'
import { runtime } from './runtime'
import { useGameStore } from './gameStore'
import { useGarageStore } from './garageStore'

const SIZE = 180

export function Minimap({ course }: { course: BuiltCourse | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !course) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pts = course.samples.map((s) => s.position)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
    const pad = 14
    const scale = (SIZE - pad * 2) / Math.max(maxX - minX, maxZ - minZ, 1)
    const ox = pad + ((SIZE - pad * 2) - (maxX - minX) * scale) / 2
    const oz = pad + ((SIZE - pad * 2) - (maxZ - minZ) * scale) / 2
    const toCanvas = (x: number, z: number): [number, number] => [ox + (x - minX) * scale, oz + (z - minZ) * scale]
    let raf = 0
    const draw = () => {
      const st = useGameStore.getState()
      ctx.clearRect(0, 0, SIZE, SIZE)
      // 道
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.beginPath()
      pts.forEach((p, i) => {
        const [cx, cz] = toCanvas(p.x, p.z)
        if (i === 0) ctx.moveTo(cx, cz)
        else ctx.lineTo(cx, cz)
      })
      if (course.definition.closed) ctx.closePath()
      ctx.stroke()
      // 走破済み区間
      const idx = Math.min(runtime.progressIndex, pts.length - 1)
      ctx.strokeStyle = '#3ddcff'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      for (let i = 0; i <= idx; i++) {
        const [cx, cz] = toCanvas(pts[i].x, pts[i].z)
        if (i === 0) ctx.moveTo(cx, cz)
        else ctx.lineTo(cx, cz)
      }
      ctx.stroke()
      // チェックポイント・ゴール
      const all = [...course.markers.checkpoints, course.markers.goal]
      all.forEach((m, i) => {
        const [cx, cz] = toCanvas(m.position.x, m.position.z)
        const isGoal = i === all.length - 1
        ctx.fillStyle = isGoal ? '#f5c542' : i < st.checkpointIndex ? '#6c7a89' : '#9ad0ff'
        ctx.beginPath()
        ctx.arc(cx, cz, isGoal ? 4 : 3, 0, Math.PI * 2)
        ctx.fill()
      })
      // ライバル（キャラクター色）
      const chars = useGarageStore.getState().characters
      for (const r of runtime.rivals) {
        const [cx, cz] = toCanvas(r.position.x, r.position.z)
        ctx.fillStyle = chars.find((c) => c.id === r.characterId)?.color ?? '#ffb46a'
        ctx.beginPath()
        ctx.arc(cx, cz, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      // 自車（進行方向を向いた三角形）
      const [px, pz] = toCanvas(runtime.position.x, runtime.position.z)
      const heading = Math.atan2(runtime.forward.x, runtime.forward.z)
      ctx.save()
      ctx.translate(px, pz)
      ctx.rotate(-heading + Math.PI)
      ctx.fillStyle = '#ff5a4a'
      ctx.beginPath()
      ctx.moveTo(0, -7)
      ctx.lineTo(5, 5)
      ctx.lineTo(-5, 5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [course])
  if (!course) return null
  return <canvas ref={ref} width={SIZE} height={SIZE} className="minimap" aria-label="ミニマップ" />
}
