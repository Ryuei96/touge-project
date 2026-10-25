/** 結果画面: タイム・区間・順位・ランキング（ローカル保存） */
import { useMemo } from 'react'
import { formatDelta, formatTime, loadRecords } from '../race/records'
import { getCarPreset } from '../vehicle/carCatalog'
import { useGameStore } from './gameStore'
import { useGarageStore } from './garageStore'
import { runtime } from './runtime'

export function ResultsScreen() {
  const s = useGameStore()
  const playerName = useGarageStore((g) => g.playerName)
  const result = s.result
  const courseId = s.courseId
  const records = useMemo(() => (result ? loadRecords(localStorage, courseId) : { entries: [], bestSplits: [] }), [courseId, result])
  if (!result) return null
  const r = result
  const retry = () => {
    s.resetRace()
    runtime.resetRequested = true
    s.patch({ countdown: 3 })
  }
  return (
    <div className="setup-backdrop">
      <div className="setup panel results">
        <div className="title">RESULT</div>
        <div className="results-head">
          <div className="results-time">{formatTime(r.time)}</div>
          <div className="results-rank">{s.rivalEnabled ? `${r.rank} 位 / ${s.rankTotal}` : 'タイムアタック'}{r.bestRank ? ` ・ ランキング ${r.bestRank} 位` : ''}</div>
          <div className="small">{playerName} ・ {getCarPreset(useGarageStore.getState().carId).name} ・ {s.courseName}</div>
        </div>
        <div className="results-columns">
          <div>
            <div className="subtitle">区間タイム</div>
            <table className="records">
              <tbody>
                {r.splits.map((sp, i) => {
                  const best = records.bestSplits[i]
                  const d = best === undefined ? null : sp - best
                  return (
                    <tr key={i}>
                      <td>{i === r.splits.length - 1 ? 'GOAL' : `区間 ${i + 1}`}</td>
                      <td className="num">{formatTime(sp)}</td>
                      <td className={`num ${d !== null && d <= 0 ? 'good' : 'bad'}`}>{d === null ? '' : d <= 0 ? 'BEST' : formatDelta(d)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div>
            <div className="subtitle">ランキング（このコース）</div>
            <table className="records">
              <tbody>
                {records.entries.slice(0, 8).map((e, i) => (
                  <tr key={i} className={e.rank === r.bestRank && e.name === playerName ? 'me' : ''}>
                    <td>{e.rank}</td>
                    <td>{e.name}</td>
                    <td className="small">{getCarPreset(e.carId).name}</td>
                    <td className="num">{formatTime(e.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="row setup-actions">
          <button className="primary" onClick={retry}>
            もう一回
          </button>
          <button className="mini" onClick={() => s.patch({ setupDone: false, result: null })}>
            セットアップへ
          </button>
          <button className="mini" onClick={() => s.patch({ result: null })}>
            閉じる（走り続ける）
          </button>
        </div>
      </div>
    </div>
  )
}
