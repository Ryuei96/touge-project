/**
 * フレーム毎に更新される可変状態（React の再レンダリングを介さずに共有する）。
 * 車両 → カメラ / レース判定 / HUD の低頻度反映に使う。
 */
import { Quaternion, Vector3 } from 'three'
import type { BuiltCourse, Pose } from '../course/types'

export interface VehicleRuntime {
  position: Vector3
  quaternion: Quaternion
  forward: Vector3
  velocity: Vector3
  /** 前進方向の速度 [m/s]（後退は負） */
  speedMs: number
  wheelsOnGround: number
  /** R キーまたは落下時の復帰先 */
  respawn: Pose | null
  /** 復帰要求（物理ステップで消費） */
  resetRequested: boolean
  /** 最後に通過した中心線サンプルのインデックス（オートパイロットのヒント） */
  progressIndex: number
  /** 周回コースでの現在周（0 始まり） */
  lapIndex: number
  /** 直近の入力（サウンド用） */
  throttle: number
  handbrake: boolean
  /** ライバル車（いなければ null） */
  rival: RivalRuntime | null
  /** 現在のコース（HUD のミニマップ用） */
  course: BuiltCourse | null
}

export interface RivalRuntime {
  position: Vector3
  forward: Vector3
  speedMs: number
  progressIndex: number
  lapIndex: number
  finished: boolean
  /** レース距離 = 周回 × コース長 + 弧長 */
  raceDistance: number
}

export const runtime: VehicleRuntime = {
  position: new Vector3(),
  quaternion: new Quaternion(),
  forward: new Vector3(0, 0, 1),
  velocity: new Vector3(),
  speedMs: 0,
  wheelsOnGround: 0,
  respawn: null,
  resetRequested: false,
  progressIndex: 0,
  lapIndex: 0,
  throttle: 0,
  handbrake: false,
  rival: null,
  course: null,
}
