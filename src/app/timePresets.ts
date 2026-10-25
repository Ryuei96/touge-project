import type { TimeOfDay } from './gameStore'

export interface TimePreset {
  sunPosition: [number, number, number]
  sunColor: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  background: string
  fog: string
  turbidity: number
  rayleigh: number
  /** 映り込み用環境光の強さ */
  envIntensity: number
}

export const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  day: { sunPosition: [90, 140, -110], sunColor: '#fff4e0', sunIntensity: 1.9, hemiSky: '#dbe7f6', hemiGround: '#4d5b3c', hemiIntensity: 0.55, background: '#b9cfe0', fog: '#b9cfe0', turbidity: 4, rayleigh: 1.6, envIntensity: 0.35 },
  dusk: { sunPosition: [160, 18, -60], sunColor: '#ffb070', sunIntensity: 1.5, hemiSky: '#e9b48c', hemiGround: '#3a3a44', hemiIntensity: 0.5, background: '#e0a27a', fog: '#d9a083', turbidity: 8, rayleigh: 3, envIntensity: 0.25 },
  night: { sunPosition: [60, -8, -120], sunColor: '#8fa6d8', sunIntensity: 0.25, hemiSky: '#1c2740', hemiGround: '#0b0d12', hemiIntensity: 0.22, background: '#0a0f1c', fog: '#0a0f1c', turbidity: 2, rayleigh: 0.2, envIntensity: 0.05 },
}

