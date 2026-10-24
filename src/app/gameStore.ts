import { create } from 'zustand'

export type CameraMode = 'chase' | 'hood' | 'far'
export const CAMERA_MODES: CameraMode[] = ['chase', 'hood', 'far']
export const CAMERA_LABELS: Record<CameraMode, string> = { chase: '追従', hood: 'ボンネット', far: '俯瞰' }

export interface GameState {
  courseId: string
  courseName: string
  status: 'loading' | 'ready' | 'error'
  errorMessage?: string
  speedKmh: number
  gear: 'D' | 'R' | 'N'
  wheelsOnGround: number
  elapsed: number
  started: boolean
  finished: boolean
  finishTime: number | null
  checkpointIndex: number
  checkpointTotal: number
  progress: number
  cameraMode: CameraMode
  autopilot: boolean
  resets: number
  physicsReady: boolean

  setCourse(id: string): void
  setStatus(status: GameState['status'], message?: string): void
  cycleCamera(): void
  setAutopilot(on: boolean): void
  patch(partial: Partial<GameState>): void
  resetRace(): void
}

const initialQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null

export const useGameStore = create<GameState>((set) => ({
  courseId: initialQuery?.get('course') ?? 'touge01',
  courseName: '',
  status: 'loading',
  speedKmh: 0,
  gear: 'N',
  wheelsOnGround: 0,
  elapsed: 0,
  started: false,
  finished: false,
  finishTime: null,
  checkpointIndex: 0,
  checkpointTotal: 0,
  progress: 0,
  cameraMode: 'chase',
  autopilot: initialQuery?.get('autopilot') === '1',
  resets: 0,
  physicsReady: false,

  setCourse: (id) => set({ courseId: id, status: 'loading', elapsed: 0, started: false, finished: false, finishTime: null, checkpointIndex: 0, progress: 0, resets: 0 }),
  setStatus: (status, message) => set({ status, errorMessage: message }),
  cycleCamera: () => set((s) => ({ cameraMode: CAMERA_MODES[(CAMERA_MODES.indexOf(s.cameraMode) + 1) % CAMERA_MODES.length] })),
  setAutopilot: (on) => set({ autopilot: on }),
  patch: (partial) => set(partial),
  resetRace: () => set({ elapsed: 0, started: false, finished: false, finishTime: null, checkpointIndex: 0, progress: 0 }),
}))
