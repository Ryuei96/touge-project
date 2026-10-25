/**
 * BIM 風モデル（GLB）から走行路を読むコース。
 * モデルは tools/blender/make_sample_assets.py が生成した架空の道路 + 橋梁で、
 * 中心線はそのスクリプトと同じ式（Blender 座標 → ゲーム座標に変換済み）。
 */
import type { CenterlinePoint } from '../../road/spline'
import { LOCAL_ORIGIN } from '../buildCourse'
import type { CourseDefinition } from '../types'

function centerline(): CenterlinePoint[] {
  const pts: CenterlinePoint[] = []
  const n = 42
  for (let i = 0; i <= n; i++) {
    const t = i / n
    // Blender: x = 40 sin(πt) + 25 sin(2.3πt), y_north = 420 t, z_up = 6 + 14 t
    const bx = 40 * Math.sin(Math.PI * t) + 25 * Math.sin(2.3 * Math.PI * t)
    const by = 420 * t
    const bz = 6 + 14 * t
    pts.push({ x: bx, y: bz, z: -by })
  }
  return pts
}

export const bimBridgeCourse: CourseDefinition = {
  id: 'bim-bridge',
  name: '橋梁 BIM サンプル（架空）',
  description: 'GLB モデルのノード名（Road_ / Deck_）から走行路を抽出して走るサンプル。',
  source: 'bim',
  origin: LOCAL_ORIGIN,
  attribution: {
    source: 'tools/blender/make_sample_assets.py による生成モデル',
    license: 'プロジェクト内利用',
    fictional: true,
    notes: '実在の構造物・BIM データではない。',
  },
  model: { uri: 'models/bim-bridge-course.glb' },
  centerline: centerline(),
  defaultWidth: 8,
  sampleStep: 2,
  elevation: { mode: 'embedded' },
  terrain: { enabled: false },
  guardrails: false,
  checkpoints: { interval: 150 },
  scenery: { treeCount: 0 },
  assets: [],
}
