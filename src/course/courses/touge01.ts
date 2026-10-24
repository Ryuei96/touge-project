/**
 * 架空の峠コース「鳴沢峠（仮）」。
 * 制御点は実在の道路とは無関係のデザイン値であり、実測値ではない。
 */
import { LOCAL_ORIGIN } from '../buildCourse'
import type { CourseDefinition } from '../types'

export const touge01: CourseDefinition = {
  id: 'touge01',
  name: '鳴沢峠（架空）',
  description: '約 1.5 km の上り峠。つづら折りのヘアピン 2 箇所と S 字区間を含む架空コース。',
  source: 'procedural',
  origin: LOCAL_ORIGIN,
  attribution: {
    source: 'TOUGE DRIVE WEB 制作チームによるデザインデータ',
    license: 'プロジェクト内利用',
    fictional: true,
    notes: '実在の道路・地形に基づかない架空データ。実測値として扱わないこと。',
  },
  defaultWidth: 7,
  sampleStep: 2,
  elevation: { mode: 'embedded' },
  // x: 東, y: 標高, z: 南（-z が北 = 進行方向）
  // 北向きの斜面を東西に折り返しながら登るつづら折り。区間同士は平面上で 80 m 以上離す。
  centerline: [
    { x: 0, y: 0, z: 80 },
    { x: 0, y: 0, z: 0 },
    { x: 5, y: 2, z: -60 },
    { x: 30, y: 5, z: -100 }, // 右に曲がって東へ
    { x: 80, y: 8, z: -115 },
    { x: 150, y: 13, z: -120 },
    { x: 220, y: 18, z: -115 },
    { x: 260, y: 21, z: -125, width: 6 }, // ヘアピン 1（左）
    { x: 290, y: 24, z: -150, width: 6 },
    { x: 285, y: 27, z: -185, width: 6 },
    { x: 255, y: 29, z: -200, width: 6 },
    { x: 200, y: 33, z: -205 }, // 西へ
    { x: 120, y: 39, z: -195 },
    { x: 50, y: 44, z: -205 },
    { x: 15, y: 47, z: -220, width: 6 }, // ヘアピン 2（右）
    { x: 0, y: 50, z: -255, width: 6 },
    { x: 20, y: 53, z: -285, width: 6 },
    { x: 55, y: 56, z: -295, width: 6 },
    { x: 130, y: 62, z: -295 }, // 東へ
    { x: 200, y: 67, z: -305 },
    { x: 260, y: 72, z: -320 },
    { x: 300, y: 76, z: -350 }, // S 字で北東へ
    { x: 315, y: 80, z: -400 },
    { x: 295, y: 84, z: -450 },
    { x: 270, y: 88, z: -490 },
    { x: 290, y: 92, z: -540 },
    { x: 330, y: 95, z: -580 },
    { x: 380, y: 97, z: -600 }, // 稜線手前の緩い区間
    { x: 430, y: 98, z: -610 },
  ],
  terrain: { enabled: true, margin: 140, resolution: 140, seed: 7, amplitude: 16, blendDistance: 50 },
  guardrails: true,
  checkpoints: { interval: 300 },
  scenery: { seed: 11, treeCount: 700 },
  assets: [
    { id: 'start-sign', kind: 'primitive', primitive: 'box', color: '#f2f2f2', position: { x: -5, y: 1.5, z: 0 }, scale: { x: 0.2, y: 1.2, z: 2.4 }, collision: 'none' },
  ],
}
