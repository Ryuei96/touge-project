/**
 * ホイールの見た目。タイヤ（黒いシリンダー）+ リム（明るい円盤）+ ハブ。
 * ジオメトリは一度だけ生成して X 軸（車軸）向きに回転させる。
 * （以前は onUpdate で毎レンダー回転が累積し、タイヤが変な向きになっていた）
 */
import { forwardRef, useMemo } from 'react'
import { CylinderGeometry, Mesh } from 'three'

interface WheelMeshProps {
  radius: number
  width: number
  rimColor: string
}

export const WheelMesh = forwardRef<Mesh, WheelMeshProps>(function WheelMesh({ radius, width, rimColor }, ref) {
  const tire = useMemo(() => {
    const g = new CylinderGeometry(radius, radius, width, 28, 1)
    g.rotateZ(Math.PI / 2)
    return g
  }, [radius, width])
  const rim = useMemo(() => {
    const g = new CylinderGeometry(radius * 0.62, radius * 0.62, width * 1.04, 20, 1)
    g.rotateZ(Math.PI / 2)
    return g
  }, [radius, width])
  const spokes = useMemo(() => {
    const g = new CylinderGeometry(radius * 0.58, radius * 0.58, width * 1.08, 5, 1, false)
    g.rotateZ(Math.PI / 2)
    return g
  }, [radius, width])
  return (
    <mesh ref={ref} geometry={tire} castShadow>
      <meshStandardMaterial color="#141414" roughness={0.92} metalness={0.05} />
      <mesh geometry={rim}>
        <meshStandardMaterial color={rimColor} roughness={0.35} metalness={0.75} />
      </mesh>
      <mesh geometry={spokes}>
        <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.6} />
      </mesh>
    </mesh>
  )
})
