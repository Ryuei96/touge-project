/**
 * 周回用の架空ショートコース（閉路）。3 周でゴール。
 */
import { LOCAL_ORIGIN } from '../buildCourse'
import type { CourseDefinition } from '../types'

export const loop01: CourseDefinition = {
  id: 'loop01',
  name: '湖畔サーキット（架空・3 周）',
  description: '約 1.1 km の周回コース。周回数とミニマップの確認用。',
  source: 'procedural',
  origin: LOCAL_ORIGIN,
  attribution: { source: 'デザインデータ', license: 'プロジェクト内利用', fictional: true, notes: '架空データ。' },
  defaultWidth: 9,
  sampleStep: 2,
  closed: true,
  laps: 3,
  elevation: { mode: 'embedded' },
  centerline: [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: -120 },
    { x: 20, y: 3, z: -200 },
    { x: 70, y: 6, z: -240 },
    { x: 130, y: 8, z: -230 },
    { x: 170, y: 9, z: -180 },
    { x: 180, y: 8, z: -110 },
    { x: 230, y: 6, z: -60 },
    { x: 260, y: 4, z: 10 },
    { x: 230, y: 2, z: 70 },
    { x: 160, y: 1, z: 90 },
    { x: 90, y: 0, z: 70 },
    { x: 40, y: 0, z: 40 },
  ],
  terrain: { enabled: true, margin: 100, resolution: 110, seed: 21, amplitude: 6, blendDistance: 40 },
  guardrails: true,
  checkpoints: { interval: 280 },
  scenery: { seed: 8, treeCount: 350 },
  assets: [],
}
