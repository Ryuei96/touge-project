import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

/** アスファルト + センターライン + 外側線をキャンバスで生成（ブラウザ専用） */
export function createRoadTexture(): CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#4a4a4c'
  ctx.fillRect(0, 0, size, size)
  // 粒状ノイズ
  const img = ctx.getImageData(0, 0, size, size)
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 28
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  // 外側線（白）
  ctx.fillStyle = '#e8e8e8'
  ctx.fillRect(14, 0, 8, size)
  ctx.fillRect(size - 22, 0, 8, size)
  // センターライン（破線・黄）
  ctx.fillStyle = '#e2c33c'
  for (let y = 0; y < size; y += 128) ctx.fillRect(size / 2 - 5, y, 10, 72)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
