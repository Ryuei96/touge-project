/**
 * フレーム毎に更新される可変状態（React の再レンダリングを介さずに共有する）。
 * 車両 → カメラ / レース判定 / HUD の低頻度反映に使う。
 */
import { Quaternion, Vector3 } from 'three'
import type { Pose } from '../course/types'

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
}
