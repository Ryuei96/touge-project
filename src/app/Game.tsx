import { Canvas, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Environment, Lightformer, Sky } from '@react-three/drei'
import { PostEffects, SceneLighting } from './SceneEffects'
import { Suspense, useEffect, useState } from 'react'
import { FollowCamera } from '../camera/FollowCamera'
import { courseManager } from '../course'
import { CourseScene } from '../course/CourseScene'
import type { BuiltCourse } from '../course/types'
import { RivalVehicle } from '../vehicle/RivalVehicle'
import { Vehicle } from '../vehicle/Vehicle'
import { audioEngine } from '../audio/AudioEngine'
import { keyboard } from '../input/keyboard'
import { useGameStore } from './gameStore'
import { useGarageStore } from './garageStore'
import { TIME_PRESETS } from './timePresets'
import { RaceController } from './RaceController'
import { runtime } from './runtime'

function useCourse(id: string): BuiltCourse | null {
  const [loaded, setLoaded] = useState<{ id: string; course: BuiltCourse } | null>(null)
  const setStatus = useGameStore((s) => s.setStatus)
  useEffect(() => {
    let cancelled = false
    courseManager
      .load(id)
      .then((c) => {
        if (cancelled) return
        setLoaded({ id, course: c })
        setStatus('ready')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setStatus('error', e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [id, setStatus])
  return loaded?.id === id ? loaded.course : null
}

declare global {
  interface Window {
    __touge?: {
      store: typeof useGameStore
      garage: typeof useGarageStore
      runtime: typeof runtime
      course: BuiltCourse | null
      scene?: unknown
      camera?: unknown
      audio: typeof audioEngine
      requestReset(): void
    }
  }
}

/** デバッグ用: Three.js シーンを window.__touge に公開 */
function ExposeScene() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (window.__touge) {
      window.__touge.scene = scene
      window.__touge.camera = camera
    }
  }, [scene, camera])
  return null
}

export function Game() {
  const courseId = useGameStore((s) => s.courseId)
  const course = useCourse(courseId)
  const rivalEnabled = useGameStore((s) => s.rivalEnabled)
  const rivals = useGarageStore((s) => s.rivals)
  const timeOfDay = useGameStore((s) => s.timeOfDay)
  const tp = TIME_PRESETS[timeOfDay]
  const setupDone = useGameStore((s) => s.setupDone)
  const muted = useGameStore((s) => s.muted)
  const bgmStyle = useGameStore((s) => s.bgmStyle)
  const postEffects = useGameStore((s) => s.postEffects)

  // サウンド: 最初の操作で開始。M でミュート切替
  useEffect(() => {
    const onFirst = () => {
      audioEngine.start()
      audioEngine.setStyle(useGameStore.getState().bgmStyle)
      audioEngine.setMuted(useGameStore.getState().muted)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) useGameStore.getState().patch({ muted: !useGameStore.getState().muted })
    }
    window.addEventListener('keydown', onFirst, { once: true })
    window.addEventListener('pointerdown', onFirst, { once: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onFirst)
      window.removeEventListener('pointerdown', onFirst)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  useEffect(() => {
    audioEngine.setMuted(muted)
  }, [muted])
  useEffect(() => {
    audioEngine.setStyle(bgmStyle)
  }, [bgmStyle])
  useEffect(() => {
    void keyboard
  }, [setupDone])

  useEffect(() => {
    runtime.course = course
    window.__touge = {
      store: useGameStore,
      garage: useGarageStore,
      runtime,
      course,
      audio: audioEngine,
      requestReset: () => {
        runtime.resetRequested = true
      },
    }
  }, [course])

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 62, near: 0.2, far: 2500, position: [0, 5, 20] }}
      gl={{ antialias: !postEffects, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[tp.background]} />
      <Sky distance={450000} sunPosition={tp.sunPosition} turbidity={tp.turbidity} rayleigh={tp.rayleigh} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <SceneLighting />
      {/* 塗装・ガラスの映り込み用の簡易環境（空のグラデーション + 太陽）。背景には使わない */}
      <Environment resolution={128} frames={1} background={false} environmentIntensity={tp.envIntensity}>
        <Lightformer form="rect" intensity={1.6} color="#dfeaf7" position={[0, 12, 0]} scale={[40, 40, 1]} rotation={[Math.PI / 2, 0, 0]} />
        <Lightformer form="rect" intensity={0.5} color="#6f8a5a" position={[0, -8, 0]} scale={[40, 40, 1]} rotation={[-Math.PI / 2, 0, 0]} />
        <Lightformer form="circle" intensity={6} color="#fff2d0" position={[8, 10, -6]} scale={[3, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.9} color="#bcd0e6" position={[-12, 4, 0]} scale={[8, 6, 1]} rotation={[0, Math.PI / 2, 0]} />
      </Environment>
      {course && (
        <Suspense fallback={null}>
          <Physics key={course.definition.id} timeStep={1 / 60} gravity={[0, -9.81, 0]} interpolate updatePriority={-1}>
            <CourseScene course={course} />
            <Vehicle course={course} />
            {rivalEnabled && rivals.filter((r) => r.enabled).map((r, i) => <RivalVehicle key={r.id} course={course} entry={r} index={i} />)}
            <RaceController course={course} />
          </Physics>
        </Suspense>
      )}
      <FollowCamera />
      <ExposeScene />
      <PostEffects enabled={postEffects} />
    </Canvas>
  )
}
