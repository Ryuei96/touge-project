/**
 * タイム記録（ローカル保存）。コースごとのランキングと区間ベストタイム。
 * 純粋関数 + ストレージの薄い層。Node のテストでは in-memory ストレージを渡す。
 */
export interface RaceRecord {
  name: string
  carId: string
  /** 総合タイム [s] */
  time: number
  /** 各区間の通過タイム（累積）[s] */
  splits: number[]
  date: string
  rank?: number
}

export interface CourseRecords {
  entries: RaceRecord[]
  /** 区間ごとのベスト通過タイム（累積） */
  bestSplits: number[]
}

export interface RecordStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const KEY = 'touge-records-v1'
const MAX_ENTRIES = 10

export function createMemoryStorage(): RecordStorage {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

function readAll(storage: RecordStorage): Record<string, CourseRecords> {
  try {
    const raw = storage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, CourseRecords>) : {}
  } catch {
    return {}
  }
}

export function loadRecords(storage: RecordStorage, courseId: string): CourseRecords {
  return readAll(storage)[courseId] ?? { entries: [], bestSplits: [] }
}

/** 記録を追加し、順位（1 始まり）を返す。上位 MAX_ENTRIES 件だけ保存 */
export function saveRecord(storage: RecordStorage, courseId: string, record: Omit<RaceRecord, 'rank'>): { rank: number; records: CourseRecords; newBestSplits: boolean[] } {
  const all = readAll(storage)
  const course = all[courseId] ?? { entries: [], bestSplits: [] }
  const entries = [...course.entries, { ...record }].sort((a, b) => a.time - b.time).slice(0, MAX_ENTRIES)
  entries.forEach((e, i) => (e.rank = i + 1))
  const newBestSplits = record.splits.map((s, i) => course.bestSplits[i] === undefined || s < course.bestSplits[i])
  const bestSplits = record.splits.map((s, i) => (course.bestSplits[i] === undefined ? s : Math.min(course.bestSplits[i], s)))
  const saved: CourseRecords = { entries, bestSplits }
  all[courseId] = saved
  try {
    storage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* 容量超過などは無視 */
  }
  const rank = entries.findIndex((e) => e.date === record.date && e.name === record.name && e.time === record.time) + 1
  return { rank: rank > 0 ? rank : entries.length + 1, records: saved, newBestSplits }
}

/** 区間タイムの差分（負ならベストより速い）。ベストが無ければ null */
export function splitDelta(records: CourseRecords, index: number, split: number): number | null {
  const best = records.bestSplits[index]
  return best === undefined ? null : split - best
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export function formatDelta(d: number): string {
  return `${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(2)}`
}
