/**
 * 車両パラメータ（アーケード寄り FR）。
 * 単位: m, kg, N。座標は車両ローカル（+Z 前, +Y 上, +X 右）。
 */
export interface VehicleConfig {
  /** シャシー衝突ボックスの半径 [x, y, z] */
  chassisHalfExtents: [number, number, number]
  /** シャシーコライダーのローカル Y オフセット */
  chassisColliderOffsetY: number
  massKg: number
  wheelRadius: number
  wheelWidth: number
  /** 前後輪の Z 位置 */
  wheelbaseHalf: number
  /** 左右輪の X 位置 */
  trackHalf: number
  /** ホイール取付点の Y */
  wheelConnectionY: number
  suspensionRestLength: number
  suspensionStiffness: number
  suspensionCompression: number
  suspensionRelaxation: number
  maxSuspensionTravel: number
  maxSuspensionForce: number
  frictionSlip: number
  /** サイドブレーキ中の後輪の frictionSlip */
  handbrakeFrictionSlip: number
  sideFrictionStiffness: number
  /** 後輪 1 輪あたりの最大駆動力 [N]（後輪 2 輪で 2 倍になる） */
  maxEngineForce: number
  /** 後退時の 1 輪あたり駆動力 [N] */
  reverseEngineForce: number
  /** フットブレーキの 1 輪・1 ステップあたりインパルス上限 [N·s] */
  brakeForce: number
  /** サイドブレーキのインパルス上限（後輪） */
  handbrakeForce: number
  /** 低速時の最大舵角 [rad] */
  maxSteerLow: number
  /** 高速時の最大舵角 [rad] */
  maxSteerHigh: number
  /** maxSteerHigh に達する速度 [m/s] */
  steerFalloffSpeed: number
  /** ステア入力の追従速度 [1/s] */
  steerResponse: number
  /** ダウンフォース係数（F = k * v^2） */
  downforce: number
  /** 速度リミット [m/s] */
  maxSpeed: number
  angularDamping: number
}

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  chassisHalfExtents: [0.85, 0.28, 2.05],
  chassisColliderOffsetY: 0.05,
  massKg: 1250,
  wheelRadius: 0.34,
  wheelWidth: 0.24,
  wheelbaseHalf: 1.3,
  trackHalf: 0.8,
  wheelConnectionY: 0.0,
  suspensionRestLength: 0.32,
  suspensionStiffness: 38,
  suspensionCompression: 2.6,
  suspensionRelaxation: 3.0,
  maxSuspensionTravel: 0.3,
  maxSuspensionForce: 60000,
  frictionSlip: 2.6,
  handbrakeFrictionSlip: 0.9,
  sideFrictionStiffness: 1.0,
  maxEngineForce: 3400,
  reverseEngineForce: 1800,
  brakeForce: 45,
  handbrakeForce: 60,
  maxSteerLow: 0.62,
  maxSteerHigh: 0.14,
  steerFalloffSpeed: 42,
  steerResponse: 7,
  downforce: 0.8,
  maxSpeed: 52,
  angularDamping: 0.6,
}
