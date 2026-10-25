/**
 * 車種カタログとパーツ。見た目（簡易プリミティブの配色・シルエット）と物理パラメータのプリセット。
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
  /** リトラクタブル風のヘッドライト */
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

// ---------------------------------------------------------------- パーツ

export type PartCategory = 'engine' | 'tires' | 'suspension' | 'weight' | 'aero' | 'brakes'

export interface PartOption {
  id: string
  name: string
  description: string
  /** VehicleConfig への乗算係数（キーごと） */
  multipliers: Partial<Record<keyof VehicleConfig, number>>
  /** 加算（maxSpeed など） */
  adds?: Partial<Record<keyof VehicleConfig, number>>
}

export const PART_OPTIONS: Record<PartCategory, PartOption[]> = {
  engine: [
    { id: 'stock', name: 'ノーマル', description: '純正エンジン。', multipliers: {} },
    { id: 'tuned', name: 'ライトチューン', description: '吸排気 + ECU。出力 +15%。', multipliers: { maxEngineForce: 1.15, reverseEngineForce: 1.15 }, adds: { maxSpeed: 3 } },
    { id: 'full', name: 'フルチューン', description: '腰下から組み直し。出力 +35%、最高速 +8 km/h 相当。', multipliers: { maxEngineForce: 1.35, reverseEngineForce: 1.35 }, adds: { maxSpeed: 8 } },
  ],
  tires: [
    { id: 'eco', name: 'エコタイヤ', description: 'グリップ控えめ。滑らせやすい。', multipliers: { frictionSlip: 0.8, handbrakeFrictionSlip: 0.85 } },
    { id: 'sport', name: 'スポーツ', description: '標準的なハイグリップ。', multipliers: {} },
    { id: 'semi-slick', name: 'セミスリック', description: 'グリップ +25%。サイドブレーキでも流れにくい。', multipliers: { frictionSlip: 1.25, handbrakeFrictionSlip: 1.15 } },
  ],
  suspension: [
    { id: 'stock', name: '純正', description: '柔らかめ。ロールが大きい。', multipliers: { suspensionStiffness: 0.8, suspensionCompression: 0.9 } },
    { id: 'sport', name: 'スポーツサス', description: '標準。', multipliers: {} },
    { id: 'coilover', name: '車高調', description: '硬め。ロールが小さく舵が効く。', multipliers: { suspensionStiffness: 1.35, suspensionCompression: 1.15, suspensionRelaxation: 1.1, maxSteerLow: 1.08 } },
  ],
  weight: [
    { id: 'stock', name: 'ノーマル', description: '内装フル装備。', multipliers: {} },
    { id: 'light', name: '軽量化', description: '内装剥がし。重量 -8%。', multipliers: { massKg: 0.92 } },
    { id: 'race', name: 'レース仕様', description: 'ロールケージ + 軽量パネル。重量 -15%。', multipliers: { massKg: 0.85 } },
  ],
  aero: [
    { id: 'none', name: 'なし', description: '空力パーツなし。', multipliers: {} },
    { id: 'wing', name: 'リアウィング', description: 'ダウンフォース +60%。高速コーナーで安定。', multipliers: { downforce: 1.6 } },
  ],
  brakes: [
    { id: 'stock', name: '純正', description: '標準制動力。', multipliers: {} },
    { id: 'big', name: 'ビッグキャリパー', description: '制動力 +30%。', multipliers: { brakeForce: 1.3, handbrakeForce: 1.15 } },
  ],
}

export const PART_LABELS: Record<PartCategory, string> = {
  engine: 'エンジン',
  tires: 'タイヤ',
  suspension: '足回り',
  weight: '軽量化',
  aero: 'エアロ',
  brakes: 'ブレーキ',
}

export type CarParts = Record<PartCategory, string>

export const DEFAULT_PARTS: CarParts = { engine: 'stock', tires: 'sport', suspension: 'sport', weight: 'stock', aero: 'none', brakes: 'stock' }

export interface CarTuning {
  parts: CarParts
  /** ボディ色の上書き */
  bodyColor?: string
}

export const DEFAULT_TUNING: CarTuning = { parts: DEFAULT_PARTS }

export function getCarPreset(id: string): CarPreset {
  return CAR_PRESETS.find((c) => c.id === id) ?? CAR_PRESETS[0]
}

export function getPartOption(category: PartCategory, id: string): PartOption {
  const list = PART_OPTIONS[category]
  return list.find((p) => p.id === id) ?? list[0]
}

/** プリセット + パーツ → 物理パラメータ */
export function resolveVehicleConfig(base: VehicleConfig, preset: CarPreset, tuning: CarTuning): VehicleConfig {
  const cfg: VehicleConfig = { ...base, ...preset.config }
  const parts = tuning.parts ?? DEFAULT_PARTS
  for (const category of Object.keys(PART_OPTIONS) as PartCategory[]) {
    const opt = getPartOption(category, parts[category])
    for (const [key, mul] of Object.entries(opt.multipliers) as [keyof VehicleConfig, number][]) {
      const cur = cfg[key]
      if (typeof cur === 'number') (cfg as unknown as Record<string, number>)[key] = cur * mul
    }
    for (const [key, add] of Object.entries(opt.adds ?? {}) as [keyof VehicleConfig, number][]) {
      const cur = cfg[key]
      if (typeof cur === 'number') (cfg as unknown as Record<string, number>)[key] = cur + add
    }
  }
  return cfg
}

/** セットアップ画面で表示する要約値 */
export interface CarSummary {
  /** 後輪合計の駆動力 [N] */
  driveForceN: number
  massKg: number
  /** 0-100 km/h 目安 [s]（空気抵抗を無視した概算） */
  zeroToHundredS: number
  maxSpeedKmh: number
  /** グリップ指標（frictionSlip） */
  grip: number
  powerToWeight: number
}

export function summarizeConfig(cfg: VehicleConfig): CarSummary {
  const driveForceN = cfg.maxEngineForce * 2
  const accel = driveForceN / cfg.massKg
  return {
    driveForceN,
    massKg: cfg.massKg,
    zeroToHundredS: (100 / 3.6) / accel,
    maxSpeedKmh: cfg.maxSpeed * 3.6,
    grip: cfg.frictionSlip,
    powerToWeight: driveForceN / cfg.massKg,
  }
}
