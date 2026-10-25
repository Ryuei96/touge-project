/**
 * 車体の見た目（簡易プリミティブ）。車種カタログの CarLook とシャシー寸法から組み立てる。
 */
import type { CarLook } from './carCatalog'
import type { VehicleConfig } from './vehicleConfig'

export function CarBody({ look, config, bodyColor }: { look: CarLook; config: VehicleConfig; bodyColor?: string }) {
  const [hx, hy, hz] = config.chassisHalfExtents
  const body = bodyColor ?? look.body
  const upper = look.upper ?? body
  const cabinLen = look.silhouette === 'sedan' ? hz * 1.1 : look.silhouette === 'hatch' ? hz * 0.95 : hz * 0.85
  const cabinH = look.silhouette === 'coupe' ? 0.42 : 0.55
  const cabinZ = look.silhouette === 'hatch' ? -0.35 : -0.25
  return (
    <group>
      {/* 下半分（ボディ色） */}
      <mesh position={[0, -0.02, 0]} castShadow>
        <boxGeometry args={[hx * 2, hy * 1.6, hz * 2]} />
        <meshStandardMaterial color={body} roughness={0.35} metalness={0.3} />
      </mesh>
      {/* 上半分（ツートンのときは別色）: ボンネット・トランクの面 */}
      <mesh position={[0, hy * 0.8 - 0.01, 0]}>
        <boxGeometry args={[hx * 2 - 0.02, hy * 0.4, hz * 2 - 0.02]} />
        <meshStandardMaterial color={upper} roughness={0.35} metalness={0.3} />
      </mesh>
      {/* キャビン */}
      <mesh position={[0, hy + cabinH / 2, cabinZ]} castShadow>
        <boxGeometry args={[hx * 1.6, cabinH, cabinLen]} />
        <meshStandardMaterial color={look.cabin} roughness={0.2} metalness={0.4} />
      </mesh>
      {/* ルーフ（ツートン色） */}
      <mesh position={[0, hy + cabinH + 0.02, cabinZ]}>
        <boxGeometry args={[hx * 1.62, 0.04, cabinLen + 0.02]} />
        <meshStandardMaterial color={upper} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* ヘッドライト */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * hx * 0.65, 0.08, hz]}>
          <boxGeometry args={[0.3, look.popupLights ? 0.1 : 0.14, 0.06]} />
          <meshStandardMaterial color="#fff8d0" emissive="#fff2a8" emissiveIntensity={1.5} />
        </mesh>
      ))}
      {/* テールランプ */}
      <mesh position={[0, 0.08, -hz]}>
        <boxGeometry args={[hx * 1.6, 0.12, 0.06]} />
        <meshStandardMaterial color="#5a0000" emissive="#ff2020" emissiveIntensity={0.8} />
      </mesh>
    </group>
  )
}
