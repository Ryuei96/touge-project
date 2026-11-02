import { describe, expect, it } from 'vitest'
import { Drivetrain, type DrivetrainInput, GEAR_RATIOS, IDLE_RPM, REDLINE_RPM, gearLabel, rpmForSpeed, torqueFactor } from '../vehicle/drivetrain'

const base: DrivetrainInput = { throttle: 0, brake: 0, clutch: 0, shiftUp: false, shiftDown: false, gearSelect: null, speedMs: 0, maxSpeedMs: 52, dt: 1 / 60 }

function run(d: Drivetrain, input: Partial<typeof base>, steps = 1) {
  let s = d.update({ ...base, ...input })
  for (let k = 1; k < steps; k++) s = d.update({ ...base, ...input })
  return s
}

describe('drivetrain', () => {
  it('maps speed to rpm per gear and hits the limiter in a low gear', () => {
    expect(rpmForSpeed(0, 1, 52)).toBe(IDLE_RPM)
    expect(rpmForSpeed(52, GEAR_RATIOS.length, 52)).toBeCloseTo(REDLINE_RPM * 0.96, 0)
    expect(rpmForSpeed(20, 1, 52)).toBeGreaterThan(REDLINE_RPM)
    expect(torqueFactor(REDLINE_RPM)).toBe(0)
    expect(torqueFactor(IDLE_RPM)).toBeCloseTo(0.62)
    expect(torqueFactor(IDLE_RPM + (REDLINE_RPM - IDLE_RPM) * 0.72)).toBeCloseTo(1)
  })

  it('auto mode shifts up near the redline and down when lugging', () => {
    const d = new Drivetrain()
    expect(run(d, { throttle: 1, speedMs: 5 }).gear).toBe(1)
    const s = run(d, { throttle: 1, speedMs: 14 }, 2)
    expect(s.gear).toBe(2)
    run(d, { throttle: 1, speedMs: 14 }, 12) // シフトカットが明ける
    run(d, { throttle: 1, speedMs: 45 }, 60)
    expect(d.gear).toBeGreaterThanOrEqual(5)
    run(d, { speedMs: 4 }, 120)
    expect(d.gear).toBe(1)
  })

  it('auto mode reverses on brake when stopped and returns to first on throttle', () => {
    const d = new Drivetrain()
    const r = run(d, { brake: 1, speedMs: 0 })
    expect(r.gear).toBe(-1)
    expect(r.reverseByBrake).toBe(true)
    expect(gearLabel(r.gear)).toBe('R')
    expect(run(d, { throttle: 1, speedMs: -2 }).gear).toBe(1)
  })

  it('manual mode follows paddles, blocks reverse at speed and cuts drive on clutch', () => {
    const d = new Drivetrain()
    d.mode = 'manual'
    expect(run(d, { shiftUp: true, speedMs: 10 }).gear).toBe(2)
    run(d, { speedMs: 10 }, 12)
    expect(run(d, { shiftDown: true, speedMs: 10 }).gear).toBe(1)
    run(d, { speedMs: 10 }, 12)
    expect(run(d, { shiftDown: true, speedMs: 10 }).gear).toBe(0)
    run(d, { speedMs: 10 }, 12)
    expect(run(d, { shiftDown: true, speedMs: 10 }).gear).toBe(0) // 走行中は R に入らない
    expect(run(d, { shiftDown: true, speedMs: 0 }).gear).toBe(-1)
    run(d, { speedMs: 0 }, 12)
    expect(run(d, { gearSelect: 3, speedMs: 0 }).gear).toBe(3)
    run(d, { speedMs: 20 }, 12)
    expect(run(d, { throttle: 1, speedMs: 20 }).driveFactor).toBeGreaterThan(0)
    expect(run(d, { throttle: 1, clutch: 1, speedMs: 20 }).driveFactor).toBe(0)
    // 半クラッチ未満は繋がる。シフト直後はカット
    expect(run(d, { throttle: 1, clutch: 0.3, speedMs: 20 }).driveFactor).toBeGreaterThan(0)
    expect(run(d, { shiftUp: true, throttle: 1, speedMs: 20 }).driveFactor).toBe(0)
  })

  it('manual mode never auto-reverses on brake', () => {
    const d = new Drivetrain()
    d.mode = 'manual'
    const s = run(d, { brake: 1, speedMs: 0 }, 5)
    expect(s.gear).toBe(1)
    expect(s.reverseByBrake).toBe(false)
  })
})
