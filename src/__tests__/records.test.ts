import { describe, expect, it } from 'vitest'
import { createMemoryStorage, formatDelta, formatTime, loadRecords, saveRecord, splitDelta } from '../race/records'

describe('records', () => {
  it('ranks entries and tracks best splits', () => {
    const st = createMemoryStorage()
    const a = saveRecord(st, 'c1', { name: 'A', carId: 'x', time: 100, splits: [30, 60, 100], date: '1' })
    expect(a.rank).toBe(1)
    expect(a.newBestSplits).toEqual([true, true, true])
    const b = saveRecord(st, 'c1', { name: 'B', carId: 'x', time: 90, splits: [31, 58, 90], date: '2' })
    expect(b.rank).toBe(1)
    expect(b.newBestSplits).toEqual([false, true, true])
    const rec = loadRecords(st, 'c1')
    expect(rec.entries.map((e) => e.name)).toEqual(['B', 'A'])
    expect(rec.bestSplits).toEqual([30, 58, 90])
    expect(splitDelta(rec, 0, 32)).toBe(2)
    expect(splitDelta(rec, 5, 1)).toBeNull()
    expect(loadRecords(st, 'other').entries).toEqual([])
  })
  it('keeps only the top 10', () => {
    const st = createMemoryStorage()
    for (let i = 0; i < 14; i++) saveRecord(st, 'c', { name: `P${i}`, carId: 'x', time: 200 - i, splits: [], date: String(i) })
    const rec = loadRecords(st, 'c')
    expect(rec.entries.length).toBe(10)
    expect(rec.entries[0].time).toBe(187)
  })
  it('formats times', () => {
    expect(formatTime(65.123)).toBe('1:05.12')
    expect(formatDelta(-0.5)).toBe('-0.50')
    expect(formatDelta(1.234)).toBe('+1.23')
  })
})
