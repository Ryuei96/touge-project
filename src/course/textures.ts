import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return [canvas, canvas.getContext('2d')!]
}

let seed = 12345
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

/** アスファルト（粒状 + ひび + 轍の汚れ）+ センターライン + 外側線 */
export function createRoadTexture(): CanvasTexture {
  const size = 1024
  const [canvas, ctx] = makeCanvas(size)
  ctx.fillStyle = '#45464a'
  ctx.fillRect(0, 0, size, size)
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 34 + (rnd() - 0.5) * 12
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n + 2
  }
  ctx.putImageData(img, 0, 0)
  // 轍（タイヤが通る位置はやや暗く・滑らか）
  const grad = (x: number) => {
    const g = ctx.createLinearGradient(x - 70, 0, x + 70, 0)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.5, 'rgba(0,0,0,0.22)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    return g
  }
  for (const x of [size * 0.3, size * 0.7]) {
    ctx.fillStyle = grad(x)
    ctx.fillRect(x - 70, 0, 140, size)
  }
  // ひび割れ
  ctx.strokeStyle = 'rgba(20,20,22,0.55)'
  ctx.lineWidth = 1.5
  for (let k = 0; k < 14; k++) {
    ctx.beginPath()
    let x = rnd() * size, y = rnd() * size
    ctx.moveTo(x, y)
    for (let s = 0; s < 12; s++) {
      x += (rnd() - 0.5) * 40
      y += (rnd() - 0.3) * 40
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // 外側線（白・わずかに擦れ）
  ctx.fillStyle = 'rgba(236,236,230,0.92)'
  ctx.fillRect(26, 0, 14, size)
  ctx.fillRect(size - 40, 0, 14, size)
  // センターライン（破線・黄）
  ctx.fillStyle = 'rgba(232,196,70,0.95)'
  for (let y = 0; y < size; y += 256) ctx.fillRect(size / 2 - 9, y, 18, 150)
  // 擦れ: 線の上にランダムな暗点
  for (let k = 0; k < 1200; k++) {
    ctx.fillStyle = `rgba(60,60,62,${0.2 + rnd() * 0.4})`
    const x = rnd() < 0.5 ? 26 + rnd() * 14 : rnd() < 0.5 ? size - 40 + rnd() * 14 : size / 2 - 9 + rnd() * 18
    ctx.fillRect(x, rnd() * size, 2, 2 + rnd() * 6)
  }
  const tex = new CanvasTexture(canvas)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 16
  return tex
}

/** 草地のディテール（頂点色に乗算して使う） */
export function createGrassDetailTexture(): CanvasTexture {
  const size = 512
  const [canvas, ctx] = makeCanvas(size)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 200 + rnd() * 55
    img.data[i] = n
    img.data[i + 1] = n + (rnd() - 0.5) * 20
    img.data[i + 2] = n - 10
  }
  ctx.putImageData(img, 0, 0)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  for (let k = 0; k < 4000; k++) {
    ctx.beginPath()
    const x = rnd() * size, y = rnd() * size
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rnd() - 0.5) * 6, y - 4 - rnd() * 6)
    ctx.stroke()
  }
  const tex = new CanvasTexture(canvas)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** 砂利・土の路肩 */
export function createGravelTexture(): CanvasTexture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size)
  ctx.fillStyle = '#8a8072'
  ctx.fillRect(0, 0, size, size)
  for (let k = 0; k < 2600; k++) {
    const g = 100 + rnd() * 90
    ctx.fillStyle = `rgb(${g + 10},${g},${g - 14})`
    const r = 1 + rnd() * 2.2
    ctx.beginPath()
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new CanvasTexture(canvas)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  return tex
}

export type SignTextureKind = 'curve-left' | 'curve-right' | 'speed-40' | 'chevron-left' | 'chevron-right'

/** 道路標識（日本の警戒標識・規制標識・シェブロン風） */
export function createSignTexture(kind: SignTextureKind): CanvasTexture {
  const size = 256
  const [canvas, ctx] = makeCanvas(size)
  ctx.clearRect(0, 0, size, size)
  if (kind === 'curve-left' || kind === 'curve-right') {
    // 黄色のひし形 + 黒い矢印
    ctx.save()
    ctx.translate(size / 2, size / 2)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = '#f2c021'
    ctx.fillRect(-84, -84, 168, 168)
    ctx.lineWidth = 8
    ctx.strokeStyle = '#111'
    ctx.strokeRect(-78, -78, 156, 156)
    ctx.restore()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
    ctx.beginPath()
    const dir = kind === 'curve-left' ? -1 : 1
    ctx.moveTo(size / 2 - dir * 10, size / 2 + 60)
    ctx.quadraticCurveTo(size / 2 - dir * 10, size / 2 - 20, size / 2 + dir * 40, size / 2 - 40)
    ctx.stroke()
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.moveTo(size / 2 + dir * 62, size / 2 - 52)
    ctx.lineTo(size / 2 + dir * 18, size / 2 - 62)
    ctx.lineTo(size / 2 + dir * 40, size / 2 - 20)
    ctx.closePath()
    ctx.fill()
  } else if (kind === 'speed-40') {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, 110, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 20
    ctx.strokeStyle = '#d02424'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, 98, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#1b3e9e'
    ctx.font = 'bold 110px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('40', size / 2, size / 2 + 6)
  } else {
    // シェブロン: 黒地に黄色の山形
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 48, size, 160)
    ctx.fillStyle = '#f2c021'
    const dir = kind === 'chevron-left' ? -1 : 1
    for (let k = -1; k <= 1; k++) {
      const cx = size / 2 + k * 70
      ctx.beginPath()
      ctx.moveTo(cx - dir * 26, 64)
      ctx.lineTo(cx + dir * 14, 128)
      ctx.lineTo(cx - dir * 26, 192)
      ctx.lineTo(cx - dir * 4, 192)
      ctx.lineTo(cx + dir * 36, 128)
      ctx.lineTo(cx - dir * 4, 64)
      ctx.closePath()
      ctx.fill()
    }
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
