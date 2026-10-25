/**
 * 遠景: 稜線のシルエット（2 層）と雲。コースの中心から離れた所に置き、霧で奥行きを出す。
 */
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute } from 'three'
import { fbm2 } from '../core/noise'
import type { BuiltCourse } from '../course/types'
import { useGameStore } from '../app/gameStore'
import { TIME_PRESETS } from '../app/timePresets'

function ridgeGeometry(cx: number, cz: number, radius: number, baseY: number, amp: number, seed: number, segments = 160): BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const x = cx + Math.cos(a) * radius
    const z = cz + Math.sin(a) * radius
    const h = baseY + amp * (0.35 + fbm2(Math.cos(a) * 3 + seed, Math.sin(a) * 3 + seed, seed, 4) * 1.2)
    pos.push(x, baseY - 60, z, x, h, z)
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.push(a, b, c, b, d, c)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function cloudTexture(): CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  for (let k = 0; k < 14; k++) {
    const x = 40 + Math.random() * 176, y = 70 + Math.random() * 110, r = 30 + Math.random() * 50
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  return new CanvasTexture(canvas)
}

export function Backdrop({ course }: { course: BuiltCourse }) {
  const timeOfDay = useGameStore((s) => s.timeOfDay)
  const tp = TIME_PRESETS[timeOfDay]
  const center = useMemo(() => {
    const f = course.heightField
    if (!f) return { x: 0, z: 0, y: course.bounds.minY }
    return { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2, y: course.bounds.minY }
  }, [course])
  const radius = useMemo(() => {
    const f = course.heightField
    return f ? Math.max(f.maxX - f.minX, f.maxZ - f.minZ) * 0.75 + 300 : 900
  }, [course])
  const far = useMemo(() => ridgeGeometry(center.x, center.z, radius + 500, center.y - 20, 420, 3), [center, radius])
  const near = useMemo(() => ridgeGeometry(center.x, center.z, radius, center.y - 20, 260, 11), [center, radius])
  const cloudTex = useMemo(() => cloudTexture(), [])
  const clouds = useMemo(() => {
    const out: [number, number, number, number][] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2
      const r = radius * (0.4 + rnd() * 0.9)
      out.push([center.x + Math.cos(a) * r, center.y + 260 + rnd() * 120, center.z + Math.sin(a) * r, 160 + rnd() * 220])
    }
    return out
  }, [center, radius])
  useEffect(() => () => {
    far.dispose()
    near.dispose()
    cloudTex.dispose()
  }, [far, near, cloudTex])
  const farColor = useMemo(() => new Color(tp.fog).lerp(new Color('#3a4a5e'), timeOfDay === 'night' ? 0.2 : 0.35), [tp.fog, timeOfDay])
  const nearColor = useMemo(() => new Color(tp.fog).lerp(new Color('#2f4a3a'), timeOfDay === 'night' ? 0.25 : 0.5), [tp.fog, timeOfDay])
  const cloudOpacity = timeOfDay === 'night' ? 0.12 : timeOfDay === 'dusk' ? 0.5 : 0.7
  return (
    <group>
      <mesh geometry={far}>
        <meshBasicMaterial color={farColor} side={DoubleSide} fog />
      </mesh>
      <mesh geometry={near}>
        <meshBasicMaterial color={nearColor} side={DoubleSide} fog />
      </mesh>
      {clouds.map(([x, y, z, s], i) => (
        <sprite key={i} position={[x, y, z]} scale={[s, s * 0.45, 1]}>
          <spriteMaterial map={cloudTex} transparent opacity={cloudOpacity} depthWrite={false} blending={timeOfDay === 'night' ? AdditiveBlending : undefined} fog />
        </sprite>
      ))}
    </group>
  )
}
