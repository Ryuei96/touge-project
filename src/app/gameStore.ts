import { create } from 'zustand'
import type { BgmStyle } from '../audio/AudioEngine'


export type CameraMode = 'chase' | 'hood' | 'far'
export type TimeOfDay = 'day' | 'dusk' | 'night'

export interface DialogueLine {
  /** キャラクター ID */
  speaker: string
  text: string
}
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
  /** 走行前セットアップ完了 */
  setupDone: boolean
  lap: number
  lapTotal: number
  /** ライバル（セットアップのロスターで有効な台数） */
  rivalEnabled: boolean
  rivalSkill: 'easy' | 'normal' | 'hard'
  /** 1 = 先頭 */
  rank: number
  rankTotal: number
  rivalFinished: boolean
  /** レース前会話（セットアップ後）とレース後会話 */
  intro: boolean
  outroShown: boolean
  timeOfDay: TimeOfDay
  /** 掛け合い */
  dialogue: { lines: DialogueLine[]; index: number; key: number } | null
  /** サウンド */
  muted: boolean
  bgmStyle: BgmStyle
  /** ポストプロセス（Bloom / Vignette / SMAA） */
  postEffects: boolean
  gamepadConnected: boolean
  gamepadId?: string

  setCourse(id: string): void
  setStatus(status: GameState['status'], message?: string): void
  cycleCamera(): void
  setAutopilot(on: boolean): void
  patch(partial: Partial<GameState>): void
  resetRace(): void
  startRun(): void
  showDialogue(lines: DialogueLine[]): void
  advanceDialogue(): void
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
  setupDone: initialQuery?.get('autopilot') === '1' || initialQuery?.get('skipSetup') === '1',
  lap: 1,
  lapTotal: 1,
  rivalEnabled: initialQuery?.get('rival') === '1',
  rivalSkill: 'normal',
  rank: 1,
  rankTotal: 1,
  rivalFinished: false,
  intro: false,
  outroShown: false,
  timeOfDay: (initialQuery?.get('time') as TimeOfDay | null) ?? 'day',
  dialogue: null,
  muted: initialQuery?.get('mute') === '1',
  bgmStyle: (initialQuery?.get('bgm') as BgmStyle | null) ?? 'goldrunner',
  postEffects: initialQuery?.get('fx') !== '0',
  gamepadConnected: false,

  setCourse: (id) => set({ courseId: id, status: 'loading', elapsed: 0, started: false, finished: false, finishTime: null, checkpointIndex: 0, progress: 0, resets: 0, lap: 1, rank: 1, rivalFinished: false, dialogue: null, outroShown: false }),
  setStatus: (status, message) => set({ status, errorMessage: message }),
  cycleCamera: () => set((s) => ({ cameraMode: CAMERA_MODES[(CAMERA_MODES.indexOf(s.cameraMode) + 1) % CAMERA_MODES.length] })),
  setAutopilot: (on) => set({ autopilot: on }),
  patch: (partial) => set(partial),
  resetRace: () => set({ elapsed: 0, started: false, finished: false, finishTime: null, checkpointIndex: 0, progress: 0, lap: 1, rank: 1, rivalFinished: false, dialogue: null, outroShown: false }),
  startRun: () => set({ setupDone: true }),
  showDialogue: (lines) => set((s) => ({ dialogue: { lines, index: 0, key: (s.dialogue?.key ?? 0) + 1 } })),
  advanceDialogue: () =>
    set((s) => {
      if (!s.dialogue) return {}
      const next = s.dialogue.index + 1
      return next >= s.dialogue.lines.length ? { dialogue: null } : { dialogue: { ...s.dialogue, index: next } }
    }),
}))
