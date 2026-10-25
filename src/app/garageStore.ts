/**
 * ガレージ（車種・チューニング）と配置モデルの永続状態。localStorage に保存する。
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlacedAsset } from '../course/types'
import { DEFAULT_CAR_ID, DEFAULT_TUNING, type CarTuning, type PartCategory } from '../vehicle/carCatalog'
import { DEFAULT_CHARACTERS, DEFAULT_RIVALS, type Character, type RivalEntry } from '../race/characters'

export interface GarageState {
  carId: string
  tuning: CarTuning
  /** コース ID → 配置したモデル */
  placed: Record<string, PlacedAsset[]>
  /** キャラクター（編集可能） */
  characters: Character[]
  playerCharacterId: string
  navigatorCharacterId: string
  rivals: RivalEntry[]
  /** アーケードのプレイヤー登録名（ランキングに残る） */
  playerName: string
  setPlayerName(name: string): void
  setCar(id: string): void
  setTuning(partial: Partial<CarTuning>): void
  setPart(category: PartCategory, id: string): void
  resetTuning(): void
  addPlaced(courseId: string, asset: PlacedAsset): void
  removePlaced(courseId: string, assetId: string): void
  clearPlaced(courseId: string): void
  updateCharacter(id: string, partial: Partial<Omit<Character, 'id'>>): void
  setPlayerCharacter(id: string): void
  setNavigator(id: string): void
  updateRival(id: string, partial: Partial<Omit<RivalEntry, 'id'>>): void
  resetCharacters(): void
}

export const useGarageStore = create<GarageState>()(
  persist(
    (set) => ({
      carId: DEFAULT_CAR_ID,
      tuning: DEFAULT_TUNING,
      placed: {},
      characters: DEFAULT_CHARACTERS,
      playerCharacterId: 'haruto',
      navigatorCharacterId: 'misaki',
      rivals: DEFAULT_RIVALS,
      playerName: 'PLAYER',
      setPlayerName: (name) => set({ playerName: name.slice(0, 10) }),
      updateCharacter: (id, partial) => set((s) => ({ characters: s.characters.map((c) => (c.id === id ? { ...c, ...partial, avatar: { ...c.avatar, ...(partial.avatar ?? {}) } } : c)) })),
      setPlayerCharacter: (id) => set({ playerCharacterId: id }),
      setNavigator: (id) => set({ navigatorCharacterId: id }),
      updateRival: (id, partial) => set((s) => ({ rivals: s.rivals.map((r) => (r.id === id ? { ...r, ...partial } : r)) })),
      resetCharacters: () => set({ characters: DEFAULT_CHARACTERS, rivals: DEFAULT_RIVALS, playerCharacterId: 'haruto', navigatorCharacterId: 'misaki' }),
      setCar: (id) => set({ carId: id }),
      setTuning: (partial) => set((s) => ({ tuning: { ...s.tuning, ...partial } })),
      setPart: (category, id) => set((s) => ({ tuning: { ...s.tuning, parts: { ...s.tuning.parts, [category]: id } } })),
      resetTuning: () => set({ tuning: DEFAULT_TUNING }),
      addPlaced: (courseId, asset) => set((s) => ({ placed: { ...s.placed, [courseId]: [...(s.placed[courseId] ?? []), asset] } })),
      removePlaced: (courseId, assetId) =>
        set((s) => ({ placed: { ...s.placed, [courseId]: (s.placed[courseId] ?? []).filter((a) => a.id !== assetId) } })),
      clearPlaced: (courseId) => set((s) => ({ placed: { ...s.placed, [courseId]: [] } })),
    }),
    {
      name: 'touge-garage-v3',
      // data: URL（デスクトップ版でローカルファイルから配置したモデル）は容量が大きいので保存しない
      partialize: (s) => ({
        ...s,
        placed: Object.fromEntries(Object.entries(s.placed).map(([k, v]) => [k, v.filter((a) => !a.uri?.startsWith('data:'))])),
      }),
    },
  ),
)
