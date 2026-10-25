import { useState } from 'react'
import { MODEL_CATALOG, findModel } from '../assets/modelCatalog'
import type { PlacedAsset } from '../course/types'
import { useGameStore } from './gameStore'
import { useGarageStore } from './garageStore'
import { runtime } from './runtime'

export function PlacementPanel() {
  const courseId = useGameStore((s) => s.courseId)
  const placed = useGarageStore((s) => s.placed[courseId] ?? [])
  const addPlaced = useGarageStore((s) => s.addPlaced)
  const removePlaced = useGarageStore((s) => s.removePlaced)
  const clearPlaced = useGarageStore((s) => s.clearPlaced)
  const [modelId, setModelId] = useState(MODEL_CATALOG[0]?.id ?? '')
  const [distance, setDistance] = useState(12)
  const [copied, setCopied] = useState(false)

  const place = () => {
    const m = findModel(modelId)
    if (!m) return
    const f = runtime.forward
    const p = runtime.position
    const heading = Math.atan2(f.x, f.z)
    const asset: PlacedAsset = {
      id: `${m.id}-${Date.now().toString(36)}`,
      kind: 'glb',
      uri: m.uri,
      position: { x: p.x + f.x * distance, y: p.y - 0.6 + m.placeOffsetY, z: p.z + f.z * distance },
      rotation: { x: 0, y: heading, z: 0 },
      collision: m.collision,
    }
    addPlaced(courseId, asset)
  }

  const copyJson = async () => {
    const text = JSON.stringify(placed, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('コース定義の assets に貼り付けてください', text)
    }
  }

  return (
    <div className="subpanel">
      <div className="subtitle">モデル配置</div>
      <label className="row small">
        モデル
        <select id="place-model" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {MODEL_CATALOG.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="row small">
        車の前方
        <input id="place-distance" type="range" min={0} max={60} step={2} value={distance} onChange={(e) => setDistance(Number(e.target.value))} />
        {distance} m
      </label>
      <div className="row">
        <button className="mini" onClick={place}>
          ここに配置
        </button>
        <button className="mini" onClick={copyJson} disabled={placed.length === 0}>
          {copied ? 'コピーしました' : 'JSON をコピー'}
        </button>
        <button className="mini" onClick={() => clearPlaced(courseId)} disabled={placed.length === 0}>
          全消去
        </button>
      </div>
      <div className="small">{findModel(modelId)?.description}</div>
      <ul className="placed-list small">
        {placed.map((a) => (
          <li key={a.id}>
            {a.uri?.split('/').pop()} @ ({a.position.x.toFixed(0)}, {a.position.y.toFixed(1)}, {a.position.z.toFixed(0)})
            <button className="mini" onClick={() => removePlaced(courseId, a.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
