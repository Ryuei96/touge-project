/**
 * ヘッドライト・テールランプの発光。
 * - 路面を照らすスポットライト（左右）
 * - レンズのグロー（加算合成のスプライト、Bloom で滲む）
 */
import { useMemo } from 'react'
import { AdditiveBlending, CanvasTexture, Object3D } from 'three'

function makeGlowTexture(inner: string, outer: string): CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.25, outer)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new CanvasTexture(canvas)
}

export interface CarLightsProps {
  halfWidth: number
  halfLength: number
  /** ランプの高さ（ローカル） */
  y: number
  braking?: boolean
  /** スポットライトを有効にする（自車のみ推奨） */
  spot?: boolean
}

export function CarLights({ halfWidth, halfLength, y, braking, spot }: CarLightsProps) {
  const headTex = useMemo(() => makeGlowTexture('rgba(255,250,230,1)', 'rgba(255,230,160,0.55)'), [])
  const tailTex = useMemo(() => makeGlowTexture('rgba(255,120,110,1)', 'rgba(255,30,30,0.6)'), [])
  const targets = useMemo(() => [new Object3D(), new Object3D()], [])
  targets[0].position.set(-halfWidth * 0.5, -1.2, halfLength + 14)
  targets[1].position.set(halfWidth * 0.5, -1.2, halfLength + 14)
  return (
    <group>
      {[-1, 1].map((sx, i) => (
        <group key={sx}>
          <sprite position={[sx * halfWidth * 0.62, y, halfLength + 0.05]} scale={[0.6, 0.45, 1]}>
            <spriteMaterial map={headTex} color="#fff6d8" blending={AdditiveBlending} depthWrite={false} transparent opacity={0.9} />
          </sprite>
          {spot && (
            <>
              <primitive object={targets[i]} />
              <spotLight position={[sx * halfWidth * 0.62, y, halfLength]} target={targets[i]} angle={0.42} penumbra={0.6} intensity={120} distance={60} decay={1.6} color="#fff2cc" />
            </>
          )}
          <sprite position={[sx * halfWidth * 0.6, y, -halfLength - 0.05]} scale={braking ? [0.75, 0.5, 1] : [0.45, 0.3, 1]}>
            <spriteMaterial map={tailTex} color="#ff4040" blending={AdditiveBlending} depthWrite={false} transparent opacity={braking ? 1 : 0.55} />
          </sprite>
        </group>
      ))}
    </group>
  )
}
