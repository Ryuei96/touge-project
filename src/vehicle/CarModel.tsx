/**
 * GLB 車体（tools/blender/make_cars.py が生成）を読み込み、車種の配色でマテリアルを差し替える。
 * マテリアル名: Paint / PaintUpper / Glass / Trim / HeadLamp / TailLamp / Chrome。Wing オブジェクトは表示切替。
 */
import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { Color, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D } from 'three'
import { resolveAssetUri } from '../assets/assetUri'
import { CAR_MODEL_URIS, type CarLook } from './carCatalog'
import { CarLights } from './CarLights'
import type { VehicleConfig } from './vehicleConfig'


export interface CarModelProps {
  look: CarLook
  config: VehicleConfig
  bodyColor?: string
  wing?: boolean
  braking?: boolean
  spotlights?: boolean
  /** シルエットと別のモデルを使う（GT など） */
  modelUri?: string
}

function paintMaterial(color: string): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color: new Color(color), roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 })
}

export function CarModel({ look, config, bodyColor, wing, braking, spotlights, modelUri }: CarModelProps) {
  const uri = modelUri ?? CAR_MODEL_URIS[look.silhouette]
  const gltf = useGLTF(resolveAssetUri(uri))
  const [hx, hy, hz] = config.chassisHalfExtents
  const body = bodyColor ?? look.body
  const upper = look.upper ?? body

  const scene = useMemo(() => {
    const root = gltf.scene.clone(true)
    const paint = paintMaterial(body)
    const paintUpper = paintMaterial(upper)
    const glass = new MeshPhysicalMaterial({ color: new Color(look.cabin), roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 })
    const trim = new MeshStandardMaterial({ color: '#15161a', roughness: 0.7, metalness: 0.2 })
    const chrome = new MeshStandardMaterial({ color: '#c8cacc', roughness: 0.25, metalness: 0.9 })
    const head = new MeshPhysicalMaterial({ color: '#f4f1e6', emissive: new Color('#fff0c0'), emissiveIntensity: 1.6, roughness: 0.1, clearcoat: 1, toneMapped: false })
    const tail = new MeshPhysicalMaterial({ color: '#5a0808', emissive: new Color('#ff1a1a'), emissiveIntensity: braking ? 2.6 : 0.8, roughness: 0.15, clearcoat: 1, toneMapped: false })
    const byName: Record<string, MeshStandardMaterial> = { Paint: paint, PaintUpper: paintUpper, Glass: glass, Trim: trim, Chrome: chrome, HeadLamp: head, TailLamp: tail }
    root.traverse((o: Object3D) => {
      if (o.name === 'Wing' || o.parent?.name === 'Wing') o.visible = !!wing
      if ((o as Mesh).isMesh) {
        const m = o as Mesh
        m.castShadow = true
        m.receiveShadow = false
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        const replaced = mats.map((mat) => byName[(mat.name ?? '').split('.')[0]] ?? mat)
        m.material = Array.isArray(m.material) ? replaced : replaced[0]
        if (m.material === glass) m.renderOrder = 2
      }
    })
    return root
  }, [gltf.scene, body, upper, look.cabin, wing, braking])
  useEffect(
    () => () => {
      scene.traverse((o) => {
        const m = o as Mesh
        if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose())
      })
    },
    [scene],
  )

  // モデルは路面 y=0 が原点。シャシー中心は路面から wheelRadius + 接続点分上にあるので下げる
  const groundOffset = -(config.suspensionRestLength + config.wheelRadius - 0.06)
  const scaleZ = (hz * 2) / 4.3
  const scaleX = (hx * 2) / 1.76
  const scaleY = (scaleX + scaleZ) / 2
  return (
    <group>
      <primitive object={scene} position={[0, groundOffset, 0]} scale={[scaleX, scaleY, scaleZ]} />
      <CarLights halfWidth={hx} halfLength={hz} y={-hy + hy * 1.1 + 0.02} braking={braking} spot={spotlights} />
    </group>
  )
}
