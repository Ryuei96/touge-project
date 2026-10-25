/**
 * 配置可能な外部モデル（GLB）のカタログ。public/models/ 配下。
 * 追加するにはここに 1 行足す（Blender で作った GLB を public/models に置く）。
 */
export interface ModelCatalogEntry {
  id: string
  name: string
  uri: string
  description: string
  collision: 'trimesh' | 'box' | 'none'
  /** 配置時に路面からどれだけ持ち上げるか [m] */
  placeOffsetY: number
}

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: 'bridge-segment',
    name: '橋梁セグメント（60 m）',
    uri: 'models/bridge-segment.glb',
    description: 'デッキ上面が原点。路面高さに置くとそのまま走れる。',
    collision: 'trimesh',
    placeOffsetY: 0.0,
  },
  {
    id: 'shrine-gate',
    name: '鳥居風ゲート',
    uri: 'models/shrine-gate.glb',
    description: '装飾。柱に衝突あり。',
    collision: 'trimesh',
    placeOffsetY: 0.0,
  },
]

export function findModel(id: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id)
}
