/**
 * エンジン音の AudioWorklet プロセッサ（文字列として埋め込み、Blob URL で登録する）。
 *
 * 4 気筒 4 ストロークの爆発を 1 発ずつ合成する。各爆発は
 *   共鳴する減衰正弦波（排気の「ドッ」）+ ノイズバースト（吸排気の「シュッ」）
 * で、振幅とタイミングに微小なゆらぎを入れるため同じ波形が繰り返されない。
 * これにクランク回転に同期した低域の唸り（ランブル）と、スロットルに応じた吸気ノイズを足し、
 * tanh でソフトクリップする。
 *
 * パラメータ（a-rate ではなく k-rate で十分なので 128 サンプルごとに読む）
 *   rpm      : エンジン回転数 [rpm]
 *   throttle : 0..1
 *   load     : 0..1（負荷。加速中は高く、惰性走行は低い）
 *   volume   : 全体音量
 */
export const ENGINE_WORKLET_SOURCE = `
class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 9000 },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'volume', defaultValue: 1, minValue: 0, maxValue: 2 },
    ]
  }
  constructor() {
    super()
    this.phase = 0          // 爆発位相（0..1 で 1 発）
    this.pulses = []        // 進行中のパルス
    this.crankPhase = 0
    this.lp1 = 0            // 吸気ノイズ用ローパス
    this.lp2 = 0
    this.brown = 0
    this.seed = 1234567
    this.cyl = 0
  }
  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 4294967296
  }
  process(inputs, outputs, parameters) {
    const out = outputs[0][0]
    if (!out) return true
    const sr = sampleRate
    const rpm = parameters.rpm[0]
    const throttle = parameters.throttle[0]
    const load = parameters.load[0]
    const volume = parameters.volume[0]
    const crankHz = Math.max(0, rpm) / 60
    const fireHz = crankHz * 2 // 4 気筒 4 ストローク: クランク 1 回転で 2 発
    // 爆発の共鳴周波数は回転と負荷で少し上がる
    const resF = 95 + crankHz * 0.9 + load * 40
    const tau = 0.016 - load * 0.006 // 減衰時間 [s]
    const noiseTau = 0.004
    for (let i = 0; i < out.length; i++) {
      // 爆発トリガ
      this.phase += fireHz / sr
      if (this.phase >= 1) {
        this.phase -= 1
        this.cyl = (this.cyl + 1) & 3
        // 気筒ごとの個体差 + ランダムゆらぎ（不等長・燃焼ばらつき）
        const cylGain = [1.0, 0.93, 1.05, 0.9][this.cyl]
        const amp = (0.35 + 0.65 * (0.4 + 0.6 * load)) * cylGain * (0.88 + this.rand() * 0.24)
        const jitter = (this.rand() - 0.5) * 0.0012 * sr // ±0.6 ms
        this.pulses.push({ t: -Math.max(0, jitter), amp, f: resF * (0.97 + this.rand() * 0.06), ph: this.rand() * 6.283 })
        if (this.pulses.length > 10) this.pulses.shift()
      }
      // パルス合成
      let s = 0
      for (let k = 0; k < this.pulses.length; k++) {
        const p = this.pulses[k]
        p.t += 1
        if (p.t < 0) continue
        const t = p.t / sr
        const env = Math.exp(-t / tau)
        if (env < 0.002) { this.pulses.splice(k, 1); k--; continue }
        s += p.amp * env * Math.sin(6.283185 * p.f * t + p.ph)
        // 爆発直後のノイズバースト
        const nenv = Math.exp(-t / noiseTau)
        if (nenv > 0.01) s += p.amp * 0.5 * nenv * (this.rand() * 2 - 1)
      }
      // ランブル（クランク同期）と低域の重み
      this.crankPhase += crankHz / sr
      if (this.crankPhase >= 1) this.crankPhase -= 1
      const ph = this.crankPhase * 6.283185
      s += (0.22 + 0.25 * load) * Math.sin(ph * 2) + (0.12 + 0.18 * load) * Math.sin(ph) + 0.06 * Math.sin(ph * 4)
      // 吸気ノイズ（スロットルで開く）
      const w = this.rand() * 2 - 1
      this.brown = (this.brown + 0.03 * w) / 1.03
      const cutoff = 0.02 + throttle * 0.08
      this.lp1 += cutoff * (w - this.lp1)
      this.lp2 += cutoff * (this.lp1 - this.lp2)
      s += this.lp2 * (0.35 + 0.9 * throttle) * 1.6 + this.brown * 0.4
      // ソフトクリップ（負荷で歪みが増える）
      const drive = 1.4 + load * 1.2
      out[i] = Math.tanh(s * drive) * 0.55 * volume
    }
    return true
  }
}
registerProcessor('touge-engine', EngineProcessor)
`
