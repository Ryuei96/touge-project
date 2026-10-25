/**
 * ライティング・影・ポストプロセス。
 * 影のカメラは自車に追従させ、半径 ~90 m の範囲に高解像度の影を落とす。
 */
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing'
import { useMemo, useRef } from 'react'
import { DirectionalLight, Object3D, Vector3 } from 'three'
import { runtime } from './runtime'

const SUN_DIR = new Vector3(0.45, 0.7, -0.55).normalize()

export function SceneLighting() {
  const lightRef = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const scene = useThree((s) => s.scene)
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
    light.position.copy(anchor).addScaledVector(SUN_DIR, 220)
    light.target = target
    light.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={['#dbe7f6', '#4d5b3c', 0.75]} />
      <directionalLight
        ref={lightRef}
        intensity={2.2}
        color="#fff4e0"
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
