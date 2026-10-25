/**
 * 車体の見た目。車種カタログの CarLook とシャシー寸法から、角の丸いボックスで組み立てる。
 * 下半分 / 上半分（ツートン）、キャビン（ガラス）、フェンダー、バンパー、ミラー、ランプ、
 * エアロパーツ（リアウィング）に対応。
 */
import { RoundedBox } from '@react-three/drei'
import type { CarLook } from './carCatalog'
import type { VehicleConfig } from './vehicleConfig'

export interface CarBodyProps {
  look: CarLook
  config: VehicleConfig
  bodyColor?: string
  /** リアウィングを付ける */
  wing?: boolean
  /** ブレーキランプ点灯 */
  braking?: boolean
}

export function CarBody({ look, config, bodyColor, wing, braking }: CarBodyProps) {
  const [hx, hy, hz] = config.chassisHalfExtents
  const body = bodyColor ?? look.body
  const upper = look.upper ?? body
  const sil = look.silhouette
  const cabinLen = sil === 'sedan' ? hz * 1.05 : sil === 'hatch' ? hz * 0.95 : hz * 0.85
  const cabinH = sil === 'coupe' ? 0.4 : 0.52
  const cabinZ = sil === 'hatch' ? -0.3 : sil === 'sedan' ? -0.1 : -0.2
  const lowerH = hy * 1.1
  const upperH = hy * 0.9
  const paint = { roughness: 0.28, metalness: 0.55 }
  return (
    <group>
      {/* 下半分（サイドシル・バンパー高さ） */}
      <RoundedBox args={[hx * 2, lowerH, hz * 2]} radius={0.08} smoothness={3} position={[0, -hy + lowerH / 2, 0]} castShadow>
        <meshStandardMaterial color={body} {...paint} />
      </RoundedBox>
      {/* 上半分（ボンネット・トランク・フェンダー上面） */}
      <RoundedBox args={[hx * 2 - 0.04, upperH, hz * 2 - 0.1]} radius={0.1} smoothness={3} position={[0, -hy + lowerH + upperH / 2 - 0.02, 0]} castShadow>
        <meshStandardMaterial color={upper} {...paint} />
      </RoundedBox>
      {/* フェンダーの張り出し */}
      {[-1, 1].flatMap((sx) =>
        [config.wheelbaseHalf, -config.wheelbaseHalf].map((wz) => (
          <RoundedBox key={`${sx}-${wz}`} args={[0.12, hy * 1.2, config.wheelRadius * 2.4]} radius={0.05} smoothness={2} position={[sx * (hx - 0.02), -hy * 0.2, wz]}>
            <meshStandardMaterial color={body} {...paint} />
          </RoundedBox>
        )),
      )}
      {/* キャビン: ピラー枠（ボディ色）とガラス */}
      <RoundedBox args={[hx * 1.62, cabinH, cabinLen]} radius={0.12} smoothness={3} position={[0, hy + cabinH / 2 - 0.02, cabinZ]} castShadow>
        <meshStandardMaterial color={upper} {...paint} />
      </RoundedBox>
      <RoundedBox args={[hx * 1.66, cabinH * 0.62, cabinLen * 1.02]} radius={0.08} smoothness={2} position={[0, hy + cabinH * 0.42, cabinZ]}>
        <meshPhysicalMaterial color={look.cabin} roughness={0.08} metalness={0.1} transparent opacity={0.85} clearcoat={1} />
      </RoundedBox>
      {/* ミラー */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (hx * 1.62) / 2 + sx * 0.12, hy + cabinH * 0.35, cabinZ + cabinLen / 2 - 0.15]}>
          <boxGeometry args={[0.22, 0.1, 0.12]} />
          <meshStandardMaterial color={body} {...paint} />
        </mesh>
      ))}
      {/* フロントバンパー・グリル */}
      <mesh position={[0, -hy + 0.16, hz - 0.02]}>
        <boxGeometry args={[hx * 1.5, 0.22, 0.08]} />
        <meshStandardMaterial color="#15161a" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* ヘッドライト */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * hx * 0.62, -hy + lowerH + 0.02, hz - 0.01]}>
          <boxGeometry args={[0.34, look.popupLights ? 0.09 : 0.15, 0.06]} />
          <meshStandardMaterial color="#fffbe6" emissive="#ffe9a8" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      ))}
      {/* テールランプ（ブレーキで明るく） */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * hx * 0.6, -hy + lowerH + 0.02, -hz + 0.01]}>
          <boxGeometry args={[0.42, 0.14, 0.06]} />
          <meshStandardMaterial color="#6a0a0a" emissive="#ff1a1a" emissiveIntensity={braking ? 3.5 : 0.9} toneMapped={false} />
        </mesh>
      ))}
      {/* マフラー */}
      <mesh position={[hx * 0.55, -hy + 0.08, -hz - 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.18, 12]} />
        <meshStandardMaterial color="#9a9ca0" roughness={0.3} metalness={0.9} />
      </mesh>
      {/* リアウィング */}
      {wing && (
        <group position={[0, hy + 0.22, -hz + 0.25]}>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * hx * 0.7, -0.1, 0]}>
              <boxGeometry args={[0.06, 0.22, 0.18]} />
              <meshStandardMaterial color="#15161a" roughness={0.5} />
            </mesh>
          ))}
          <RoundedBox args={[hx * 1.9, 0.04, 0.26]} radius={0.015} smoothness={2} position={[0, 0.02, 0]}>
            <meshStandardMaterial color={upper} {...paint} />
          </RoundedBox>
        </group>
      )}
    </group>
  )
}
