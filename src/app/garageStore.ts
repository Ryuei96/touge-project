/**
 * ガレージ（車種・チューニング）と配置モデルの永続状態。localStorage に保存する。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlacedAsset } from '../course/types'
import { DEFAULT_CAR_ID, DEFAULT_TUNING, type CarTuning, type PartCategory } from '../vehicle/carCatalog'

export interface GarageState {
  carId: string
  tuning: CarTuning
  /** コース ID → 配置したモデル */
  placed: Record<string, PlacedAsset[]>
  setCar(id: string): void
  setTuning(partial: Partial<CarTuning>): void
  setPart(category: PartCategory, id: string): void
  resetTuning(): void
  addPlaced(courseId: string, asset: PlacedAsset): void
  removePlaced(courseId: string, assetId: string): void
  clearPlaced(courseId: string): void
}

export const useGarageStore = create<GarageState>()(
  persist(
    (set) => ({
      carId: DEFAULT_CAR_ID,
      tuning: DEFAULT_TUNING,
      placed: {},
      setCar: (id) => set({ carId: id }),
      setTuning: (partial) => set((s) => ({ tuning: { ...s.tuning, ...partial } })),
      setPart: (category, id) => set((s) => ({ tuning: { ...s.tuning, parts: { ...s.tuning.parts, [category]: id } } })),
      resetTuning: () => set({ tuning: DEFAULT_TUNING }),
      addPlaced: (courseId, asset) => set((s) => ({ placed: { ...s.placed, [courseId]: [...(s.placed[courseId] ?? []), asset] } })),
      removePlaced: (courseId, assetId) =>
        set((s) => ({ placed: { ...s.placed, [courseId]: (s.placed[courseId] ?? []).filter((a) => a.id !== assetId) } })),
      clearPlaced: (courseId) => set((s) => ({ placed: { ...s.placed, [courseId]: [] } })),
    }),
    { name: 'touge-garage-v2' },
  ),
)
