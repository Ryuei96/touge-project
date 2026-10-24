import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Sky } from '@react-three/drei'
import { Suspense, useEffect, useState } from 'react'
import { FollowCamera } from '../camera/FollowCamera'
import { courseManager } from '../course'
import { CourseScene } from '../course/CourseScene'
import type { BuiltCourse } from '../course/types'
import { Vehicle } from '../vehicle/Vehicle'
import { useGameStore } from './gameStore'
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
      runtime: typeof runtime
      course: BuiltCourse | null
      requestReset(): void
    }
  }
}

export function Game() {
  const courseId = useGameStore((s) => s.courseId)
  const course = useCourse(courseId)

  useEffect(() => {
    window.__touge = {
      store: useGameStore,
      runtime,
      course,
      requestReset: () => {
        runtime.resetRequested = true
      },
    }
  }, [course])

  return (
    <Canvas
      shadows={false}
      dpr={[1, 1.5]}
      camera={{ fov: 62, near: 0.2, far: 2500, position: [0, 5, 20] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#b9cfe0']} />
      <Sky distance={450000} sunPosition={[120, 60, -200]} turbidity={6} rayleigh={1.2} />
      <hemisphereLight args={['#dfe9f5', '#4a5a3a', 0.9]} />
      <directionalLight position={[120, 160, -120]} intensity={1.6} />
      {course && (
        <Suspense fallback={null}>
          <Physics key={course.definition.id} timeStep={1 / 60} gravity={[0, -9.81, 0]} interpolate>
            <CourseScene course={course} />
            <Vehicle course={course} />
            <RaceController course={course} />
          </Physics>
        </Suspense>
      )}
      <FollowCamera />
    </Canvas>
  )
}
