/**
 * GLB アセットの描画 + 衝突。drei の useGLTF で読み、PlacedAsset の位置・回転・スケールで配置する。
 * 衝突は @react-three/rapier の自動コライダー（trimesh / cuboid）。読み込み失敗時は赤い箱を表示する。
 */
import { RigidBody } from '@react-three/rapier'
import { useGLTF } from '@react-three/drei'
import { Component, Suspense, useMemo, type ReactNode } from 'react'
import type { PlacedAsset } from '../course/types'

class AssetErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[GlbAsset] failed to load', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function GlbScene({ uri }: { uri: string }) {
  const gltf = useGLTF(uri)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  return <primitive object={scene} />
}

function Placeholder({ label }: { label: string }) {
  return (
    <mesh>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#ff3b3b" wireframe />
      <group userData={{ label }} />
    </mesh>
  )
}

export function GlbAsset({ asset }: { asset: PlacedAsset }) {
  if (!asset.uri) return null
  const s = asset.scale ?? { x: 1, y: 1, z: 1 }
  const r = asset.rotation ?? { x: 0, y: 0, z: 0 }
  const content = (
    <AssetErrorBoundary fallback={<Placeholder label={asset.uri} />}>
      <Suspense fallback={null}>
        <GlbScene uri={asset.uri} />
      </Suspense>
    </AssetErrorBoundary>
  )
  const transform = { position: [asset.position.x, asset.position.y, asset.position.z] as [number, number, number], rotation: [r.x, r.y, r.z] as [number, number, number], scale: [s.x, s.y, s.z] as [number, number, number] }
  if (asset.collision === 'trimesh' || asset.collision === 'box') {
    return (
      <RigidBody type="fixed" colliders={asset.collision === 'trimesh' ? 'trimesh' : 'cuboid'} {...transform}>
        {content}
      </RigidBody>
    )
  }
  return <group {...transform}>{content}</group>
}

/** BIM コース本体（GLB）の見た目。衝突は BuiltCourse.collision 側で付ける */
export function BimModelVisual({ uri, offset, yaw, scale, upAxis }: { uri: string; offset?: { x: number; y: number; z: number }; yaw?: number; scale?: number; upAxis?: 'Y' | 'Z' }) {
  const o = offset ?? { x: 0, y: 0, z: 0 }
  const sc = scale ?? 1
  return (
    <group position={[o.x, o.y, o.z]} rotation={[0, yaw ?? 0, 0]} scale={sc}>
      {/* Z-up モデルは X 軸まわりに -90° 回して Y-up にする */}
      <group rotation={[upAxis === 'Z' ? -Math.PI / 2 : 0, 0, 0]}>
        <AssetErrorBoundary fallback={<Placeholder label={uri} />}>
          <Suspense fallback={null}>
            <GlbScene uri={uri} />
          </Suspense>
        </AssetErrorBoundary>
      </group>
    </group>
  )
}
