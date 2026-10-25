/**
 * Rapier の DynamicRayCastVehicleController をラップした FR アーケード車両。
 * React / Three.js に依存しない。コースデータにも依存しない（路面は衝突形状としてのみ見る）。
 */
import type { Collider, DynamicRayCastVehicleController, RigidBody, World } from '@dimforge/rapier3d-compat'
import type { Pose } from '../course/types'
import type { DriveInput } from '../input/keyboard'
import { clamp, lerpN } from '../core/vec3'
import { DEFAULT_VEHICLE_CONFIG, type VehicleConfig } from './vehicleConfig'

export interface WheelState {
  /** シャシーローカル座標 */
  x: number
  y: number
  z: number
  steering: number
  rotation: number
  inContact: boolean
}

/** ホイール順: 0 前左, 1 前右, 2 後左, 3 後右 */
export const WHEEL_FL = 0
export const WHEEL_FR = 1
export const WHEEL_RL = 2
export const WHEEL_RR = 3

/** Rapier の舵角符号（ブラウザ検証で + が左旋回だったため、入力の + 右を反転する） */
const STEER_SIGN = -1
/** 駆動力の符号（+Z 前進） */
const ENGINE_SIGN = 1

export class RaycastVehicle {
  readonly config: VehicleConfig
  readonly chassis: RigidBody
  private readonly controller: DynamicRayCastVehicleController
  private readonly world: World
  private readonly chassisHandle: number
  private steer = 0
  private wheels: WheelState[] = []
  private disposed = false
  gear: 'D' | 'R' | 'N' = 'N'

  constructor(world: World, chassis: RigidBody, config: Partial<VehicleConfig> = {}) {
    this.config = { ...DEFAULT_VEHICLE_CONFIG, ...config }
    this.world = world
    this.chassis = chassis
    this.chassisHandle = chassis.handle
    this.controller = world.createVehicleController(chassis)
    this.controller.indexUpAxis = 1
    this.controller.setIndexForwardAxis = 2
    const c = this.config
    const positions: [number, number, number][] = [
      [-c.trackHalf, c.wheelConnectionY, c.wheelbaseHalf],
      [c.trackHalf, c.wheelConnectionY, c.wheelbaseHalf],
      [-c.trackHalf, c.wheelConnectionY, -c.wheelbaseHalf],
      [c.trackHalf, c.wheelConnectionY, -c.wheelbaseHalf],
    ]
    positions.forEach(([x, y, z], i) => {
      this.controller.addWheel({ x, y, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, c.suspensionRestLength, c.wheelRadius)
      this.controller.setWheelSuspensionStiffness(i, c.suspensionStiffness)
      this.controller.setWheelSuspensionCompression(i, c.suspensionCompression)
      this.controller.setWheelSuspensionRelaxation(i, c.suspensionRelaxation)
      this.controller.setWheelMaxSuspensionTravel(i, c.maxSuspensionTravel)
      this.controller.setWheelMaxSuspensionForce(i, c.maxSuspensionForce)
      this.controller.setWheelFrictionSlip(i, c.frictionSlip)
      this.controller.setWheelSideFrictionStiffness(i, c.sideFrictionStiffness)
      this.wheels.push({ x, y: y - c.suspensionRestLength, z, steering: 0, rotation: 0, inContact: false })
    })
    chassis.setAngularDamping(c.angularDamping)
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  /** 前進速度 [m/s]（Rapier の報告値） */
  speed(): number {
    if (this.disposed) return 0
    return this.controller.currentVehicleSpeed()
  }

  wheelStates(): readonly WheelState[] {
    return this.wheels
  }

  /** 物理ステップ直前に呼ぶ */
  update(input: DriveInput, dt: number): void {
    if (this.disposed) return
    const c = this.config
    const speed = this.speed()
    const absSpeed = Math.abs(speed)

    // ステア: 速度感応 + 入力スムージング
    const maxSteer = lerpN(c.maxSteerLow, c.maxSteerHigh, clamp(absSpeed / c.steerFalloffSpeed, 0, 1))
    const target = clamp(input.steer, -1, 1) * maxSteer
    const k = clamp(c.steerResponse * dt, 0, 1)
    this.steer += (target - this.steer) * k
    this.controller.setWheelSteering(WHEEL_FL, this.steer * STEER_SIGN)
    this.controller.setWheelSteering(WHEEL_FR, this.steer * STEER_SIGN)

    // 駆動・制動
    let engine = 0
    let brake = 0
    const movingForward = speed > 0.5
    const movingBackward = speed < -0.5
    if (input.throttle > 0) {
      engine = absSpeed < c.maxSpeed ? c.maxEngineForce * input.throttle : 0
      this.gear = 'D'
    }
    if (input.brake > 0) {
      if (movingForward) brake = c.brakeForce * input.brake
      else if (!movingForward && input.throttle === 0) {
        engine = -c.reverseEngineForce * input.brake
        this.gear = 'R'
      }
    }
    if (input.throttle === 0 && input.brake === 0) {
      if (!movingForward && !movingBackward) this.gear = 'N'
      brake = 2 // 軽いエンジンブレーキ
    }
    this.controller.setWheelEngineForce(WHEEL_RL, engine * ENGINE_SIGN)
    this.controller.setWheelEngineForce(WHEEL_RR, engine * ENGINE_SIGN)

    const rearSlip = input.handbrake ? c.handbrakeFrictionSlip : c.frictionSlip
    this.controller.setWheelFrictionSlip(WHEEL_RL, rearSlip)
    this.controller.setWheelFrictionSlip(WHEEL_RR, rearSlip)
    for (let i = 0; i < 4; i++) {
      const isRear = i >= 2
      const b = input.handbrake && isRear ? Math.max(brake, c.handbrakeForce) : brake
      this.controller.setWheelBrake(i, b)
    }

    // ダウンフォース（アーケード的な安定性）
    if (c.downforce > 0 && absSpeed > 1) {
      const rot = this.chassis.rotation()
      // ローカル -Y をワールドへ
      const qx = rot.x, qy = rot.y, qz = rot.z, qw = rot.w
      const uy = { x: 2 * (qx * qy - qw * qz), y: 1 - 2 * (qx * qx + qz * qz), z: 2 * (qy * qz + qw * qx) }
      // addForce は蓄積されるため、1 ステップ分のインパルスとして与える
      const f = c.downforce * absSpeed * absSpeed * dt
      this.chassis.applyImpulse({ x: -uy.x * f, y: -uy.y * f, z: -uy.z * f }, true)
    }

    this.controller.updateVehicle(dt, undefined, undefined, (collider: Collider) => collider.parent()?.handle !== this.chassisHandle)

    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i]
      const conn = this.controller.wheelChassisConnectionPointCs(i)
      const len = this.controller.wheelSuspensionLength(i) ?? c.suspensionRestLength
      if (conn) {
        w.x = conn.x
        w.y = conn.y - len
        w.z = conn.z
      }
      w.steering = (this.controller.wheelSteering(i) ?? 0) * STEER_SIGN
      w.rotation = this.controller.wheelRotation(i) ?? 0
      w.inContact = this.controller.wheelIsInContact(i)
    }
  }

  wheelsInContact(): number {
    if (this.disposed) return 0
    return this.wheels.filter((w) => w.inContact).length
  }

  /** 指定姿勢へ瞬間移動し速度をゼロにする */
  teleport(pose: Pose): void {
    if (this.disposed) return
    const half = pose.heading / 2
    this.chassis.setTranslation({ x: pose.position.x, y: pose.position.y, z: pose.position.z }, true)
    this.chassis.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true)
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.chassis.resetForces(true)
    this.steer = 0
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelEngineForce(i, 0)
      this.controller.setWheelBrake(i, 0)
      this.controller.setWheelSteering(i, 0)
    }
    this.gear = 'N'
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.world.removeVehicleController(this.controller)
  }
}
