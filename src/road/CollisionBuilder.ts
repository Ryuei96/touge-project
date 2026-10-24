/**
 * CollisionBuilder: MeshData から物理エンジン用の衝突形状記述を作る。
 * Rapier 自体には依存せず、記述（CollisionShape）だけを返す。
 * 実際のコライダー生成は描画側（CourseScene）で行う。
 */
import type { CollisionShape, MeshData } from '../course/types'

export interface TrimeshCollisionOptions {
  friction?: number
}

export function buildTrimeshCollision(mesh: MeshData, label: string, options: TrimeshCollisionOptions = {}): CollisionShape {
  if (mesh.indices.length % 3 !== 0) throw new Error(`${label}: index count must be a multiple of 3`)
  const maxIndex = mesh.positions.length / 3 - 1
  for (let i = 0; i < mesh.indices.length; i++) {
    if (mesh.indices[i] > maxIndex) throw new Error(`${label}: index ${mesh.indices[i]} out of range (${maxIndex})`)
  }
  return {
    kind: 'trimesh',
    label,
    vertices: mesh.positions,
    indices: mesh.indices,
    friction: options.friction,
  }
}

export interface CourseCollisionInput {
  road: MeshData
  terrain?: MeshData
  guardrails: MeshData[]
}

export function buildCourseCollision(input: CourseCollisionInput): CollisionShape[] {
  const shapes: CollisionShape[] = [buildTrimeshCollision(input.road, 'road', { friction: 1.0 })]
  if (input.terrain) shapes.push(buildTrimeshCollision(input.terrain, 'terrain', { friction: 0.8 }))
  input.guardrails.forEach((g, i) => shapes.push(buildTrimeshCollision(g, `guardrail-${i}`, { friction: 0.3 })))
  return shapes
}

/** 三角形数の合計（デバッグ・テスト用） */
export function countTriangles(shapes: CollisionShape[]): number {
  return shapes.reduce((acc, s) => acc + (s.kind === 'trimesh' ? s.indices.length / 3 : (s.rows - 1) * (s.cols - 1) * 2), 0)
}
