/**
 * 車種カタログ。見た目（簡易プリミティブの配色・シルエット）と物理パラメータのプリセット。
 * 実在車種の名称・商標は使わず、雰囲気を寄せたオリジナル車種として定義する。
 */
import type { VehicleConfig } from './vehicleConfig'

export interface CarLook {
  /** ボディ下半分の色 */
  body: string
  /** 上半分（ボンネット・ルーフ・トランク）の色。未指定なら body と同じ */
  upper?: string
  /** キャビン（ウィンドウ）色 */
  cabin: string
  /** ホイール色 */
  wheel: string
  /** シルエット: hatch = 短いノッチ, coupe = 低く長い, sedan = 大きめ */
  silhouette: 'hatch' | 'coupe' | 'sedan'
  /** リトラクタブル風のヘッドライト（コープ用の小さな造形） */
  popupLights?: boolean
}

export interface CarPreset {
  id: string
  name: string
  tagline: string
  look: CarLook
  /** DEFAULT_VEHICLE_CONFIG への上書き */
  config: Partial<VehicleConfig>
}

export const CAR_PRESETS: CarPreset[] = [
  {
    id: 'panda-hatch',
    name: 'パンダ・ハッチ',
    tagline: '白黒ツートンの軽量 FR ハッチ。非力だがコーナーで粘る。',
    look: { body: '#141414', upper: '#f4f4f2', cabin: '#1b1b1b', wheel: '#d9d9d9', silhouette: 'hatch' },
    config: { massKg: 960, maxEngineForce: 2600, maxSpeed: 46, frictionSlip: 2.9, maxSteerLow: 0.66, chassisHalfExtents: [0.82, 0.27, 2.0], wheelbaseHalf: 1.2 },
  },
  {
    id: 'yellow-rotary',
    name: 'イエロー・ロータリー',
    tagline: '黄色のロータリークーペ。伸びのある加速とシャープな回頭性。',
    look: { body: '#f2c500', cabin: '#202020', wheel: '#2a2a2a', silhouette: 'coupe', popupLights: true },
    config: { massKg: 1250, maxEngineForce: 3900, maxSpeed: 58, frictionSlip: 2.7, maxSteerLow: 0.6, chassisHalfExtents: [0.88, 0.26, 2.15], wheelbaseHalf: 1.32 },
  },
  {
    id: 'black-gt',
    name: 'ブラック・GT',
    tagline: '黒の重量級ハイパワー GT。直線は速いが重さを感じる。',
    look: { body: '#111214', cabin: '#2a2d33', wheel: '#9a9a9a', silhouette: 'sedan' },
    config: { massKg: 1480, maxEngineForce: 4600, maxSpeed: 62, frictionSlip: 2.5, maxSteerLow: 0.55, angularDamping: 0.8, chassisHalfExtents: [0.9, 0.3, 2.25], wheelbaseHalf: 1.36 },
  },
  {
    id: 'red-coupe',
    name: 'レッド・クーペ',
    tagline: 'v0.3 の標準車。バランス型。',
    look: { body: '#d8362f', cabin: '#2b2f36', wheel: '#1a1a1a', silhouette: 'coupe' },
    config: {},
  },
]

export const DEFAULT_CAR_ID = CAR_PRESETS[0].id

/** カスタマイズ（0..1 のスライダー値）。プリセットの上に重ねる */
export interface CarTuning {
  /** 出力: 駆動力 ±30% */
  power: number
  /** グリップ: frictionSlip ±35% */
  grip: number
  /** 足回り: サスペンション硬さ ±40% */
  suspension: number
  /** ステア応答: 低速最大舵角 ±25% */
  steering: number
  /** ボディ色の上書き */
  bodyColor?: string
}

export const DEFAULT_TUNING: CarTuning = { power: 0.5, grip: 0.5, suspension: 0.5, steering: 0.5 }

export function getCarPreset(id: string): CarPreset {
  return CAR_PRESETS.find((c) => c.id === id) ?? CAR_PRESETS[0]
}

/** プリセット + チューニング → 物理パラメータ */
export function resolveVehicleConfig(base: VehicleConfig, preset: CarPreset, tuning: CarTuning): VehicleConfig {
  const cfg: VehicleConfig = { ...base, ...preset.config }
  const f = (v: number, range: number) => 1 + (v - 0.5) * 2 * range
  cfg.maxEngineForce = cfg.maxEngineForce * f(tuning.power, 0.3)
  cfg.reverseEngineForce = cfg.reverseEngineForce * f(tuning.power, 0.3)
  cfg.frictionSlip = cfg.frictionSlip * f(tuning.grip, 0.35)
  cfg.handbrakeFrictionSlip = cfg.handbrakeFrictionSlip * f(tuning.grip, 0.2)
  cfg.suspensionStiffness = cfg.suspensionStiffness * f(tuning.suspension, 0.4)
  cfg.maxSteerLow = cfg.maxSteerLow * f(tuning.steering, 0.25)
  return cfg
}
