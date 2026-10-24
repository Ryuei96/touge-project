/**
 * CourseManager: 登録済みコース定義をデータソース別のビルダーで BuiltCourse にする。
 * - procedural: 架空の制御点から生成
 * - geospatial: GeoDataImporter が生成した CourseDefinition（中心線は既にゲーム座標）
 * - bim: 未実装（GLB/FBX の道路・橋梁モデルを読み込む将来機能）
 */
import { buildCourseFromCenterline } from './buildCourse'
import type { BuiltCourse, CourseDefinition, CourseSource } from './types'

export type CourseBuilder = (def: CourseDefinition) => Promise<BuiltCourse> | BuiltCourse

export class CourseSourceNotImplementedError extends Error {
  constructor(source: CourseSource) {
    super(`course source "${source}" is not implemented yet`)
    this.name = 'CourseSourceNotImplementedError'
  }
}

export interface CourseSummary {
  id: string
  name: string
  source: CourseSource
  fictional: boolean
}

export class CourseManager {
  private definitions = new Map<string, CourseDefinition>()
  private builders = new Map<CourseSource, CourseBuilder>()
  private cache = new Map<string, Promise<BuiltCourse>>()

  registerBuilder(source: CourseSource, builder: CourseBuilder): this {
    this.builders.set(source, builder)
    return this
  }

  register(def: CourseDefinition): this {
    if (this.definitions.has(def.id)) throw new Error(`course "${def.id}" already registered`)
    this.definitions.set(def.id, def)
    return this
  }

  has(id: string): boolean {
    return this.definitions.has(id)
  }

  list(): CourseSummary[] {
    return [...this.definitions.values()].map((d) => ({ id: d.id, name: d.name, source: d.source, fictional: d.attribution.fictional }))
  }

  getDefinition(id: string): CourseDefinition {
    const def = this.definitions.get(id)
    if (!def) throw new Error(`unknown course "${id}"`)
    return def
  }

  load(id: string): Promise<BuiltCourse> {
    const cached = this.cache.get(id)
    if (cached) return cached
    const def = this.getDefinition(id)
    const builder = this.builders.get(def.source)
    const p = (async () => {
      if (!builder) throw new CourseSourceNotImplementedError(def.source)
      return builder(def)
    })()
    this.cache.set(id, p)
    p.catch(() => this.cache.delete(id))
    return p
  }

  invalidate(id?: string): void {
    if (id) this.cache.delete(id)
    else this.cache.clear()
  }
}

/** 標準ビルダーを備えた CourseManager を作る */
export function createCourseManager(): CourseManager {
  return new CourseManager()
    .registerBuilder('procedural', buildCourseFromCenterline)
    .registerBuilder('geospatial', buildCourseFromCenterline)
    .registerBuilder('bim', () => {
      throw new CourseSourceNotImplementedError('bim')
    })
}
