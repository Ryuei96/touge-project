/**
 * ライティング・影・ポストプロセス。
 * 影のカメラは自車に追従させ、半径 ~90 m の範囲に高解像度の影を落とす。
 */
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing'
import { useMemo, useRef } from 'react'
import { DirectionalLight, Object3D, Vector3 } from 'three'
import { runtime } from './runtime'
import { useGameStore } from './gameStore'
import { TIME_PRESETS } from './timePresets'

export function SceneLighting() {
  const lightRef = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const scene = useThree((s) => s.scene)
  const timeOfDay = useGameStore((s) => s.timeOfDay)
  const tp = TIME_PRESETS[timeOfDay]
  const sunDir = useMemo(() => new Vector3(...tp.sunPosition).normalize(), [tp])
  useFrame(() => {
    const light = lightRef.current
    if (!light) return
    if (target.parent !== scene) scene.add(target)
    const p = runtime.playerObject
    const anchor = p ? p.getWorldPosition(target.position) : target.position.copy(runtime.position)
    // 影カメラがテクセル単位で動くようにスナップしてちらつきを減らす
    const snap = 0.5
    anchor.x = Math.round(anchor.x / snap) * snap
    anchor.z = Math.round(anchor.z / snap) * snap
    light.position.copy(anchor).addScaledVector(sunDir, 220)
    light.target = target
    light.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={[tp.hemiSky, tp.hemiGround, tp.hemiIntensity]} />
      <fog attach="fog" args={[tp.fog, timeOfDay === 'night' ? 60 : 220, timeOfDay === 'night' ? 500 : 1100]} />
      <directionalLight
        ref={lightRef}
        intensity={tp.sunIntensity}
        color={tp.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={10}
        shadow-camera-far={500}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
      />
    </>
  )
}

export function PostEffects({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return (
    <EffectComposer multisampling={0}>
      <SMAA />
      <Bloom intensity={0.55} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
      <Vignette eskil={false} offset={0.25} darkness={0.55} />
    </EffectComposer>
  )
}
