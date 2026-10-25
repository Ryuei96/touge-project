/**
 * Web Audio によるエンジン音・スキール音・BGM。外部音源ファイルは使わず全て合成する。
 * ブラウザの自動再生制限のため、最初のユーザー操作（キー/クリック）後に start() を呼ぶ。
 */
export interface EngineSoundInput {
  /** 0..1 */
  throttle: number
  /** 前進速度 [m/s]（絶対値） */
  speedMs: number
  /** 最高速 [m/s] */
  maxSpeedMs: number
  /** 横滑り・サイドブレーキなどのスキール強度 0..1 */
  skid: number
  /** 接地輪数 */
  wheelsOnGround: number
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

export type BgmStyle = 'eurobeat' | 'phonk' | 'off'

interface BgmPattern {
  bpm: number
  /** 8 分音符 16 ステップ（2 小節）。0 = 休符 */
  bass: number[]
  lead: number[]
  chords: number[][]
  kick: number[]
  snare: number[]
  hat: number[]
  bassType: OscillatorType
  leadType: OscillatorType
  /** 808 風ベース（ピッチ下降・長い減衰） */
  bass808?: boolean
  /** カウベル風リード（短い減衰・倍音） */
  cowbell?: boolean
}

/**
 * オリジナルの短いループ。既存楽曲の再現ではない。
 * eurobeat: 速い BPM・鋸波ベース・明るいリード（高揚感）
 * phonk: 140 BPM・808 ベース・カウベル風メロディ・トラップ系ハイハット
 */
export const BGM_STYLES: Record<Exclude<BgmStyle, 'off'>, BgmPattern> = {
  eurobeat: {
    bpm: 156,
    bass: [45, 45, 57, 45, 48, 48, 60, 48, 43, 43, 55, 43, 47, 47, 59, 47],
    lead: [69, 72, 76, 72, 69, 72, 77, 76, 67, 71, 74, 71, 67, 71, 76, 74],
    chords: [
      [57, 60, 64],
      [60, 64, 67],
      [55, 59, 62],
      [59, 62, 66],
    ],
    kick: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    bassType: 'sawtooth',
    leadType: 'square',
  },
  phonk: {
    bpm: 140,
    bass: [38, 0, 0, 38, 0, 41, 0, 0, 36, 0, 0, 36, 0, 34, 0, 0],
    lead: [74, 0, 77, 74, 0, 79, 77, 0, 72, 0, 74, 72, 0, 70, 72, 0],
    chords: [
      [50, 53, 57],
      [50, 53, 57],
      [48, 51, 55],
      [46, 50, 53],
    ],
    kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    bassType: 'sine',
    leadType: 'square',
    bass808: true,
    cowbell: true,
  },
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineGain: GainNode | null = null
  private osc1: OscillatorNode | null = null
  private osc2: OscillatorNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private skidGain: GainNode | null = null
  private bgmGain: GainNode | null = null
  private bgmTimer: number | null = null
  private bgmStep = 0
  private bgmNextTime = 0
  private _muted = false
  private _style: BgmStyle = 'eurobeat'
  volume = 0.6

  get started(): boolean {
    return this.ctx !== null
  }
  get muted(): boolean {
    return this._muted
  }
  get style(): BgmStyle {
    return this._style
  }

  /** ユーザー操作後に呼ぶ。複数回呼んでも安全 */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = this._muted ? 0 : this.volume
    master.connect(ctx.destination)
    this.master = master

    // エンジン: 2 つの鋸波 + ローパス。回転数で周波数とカットオフを動かす
    const engineGain = ctx.createGain()
    engineGain.gain.value = 0.0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400
    filter.Q.value = 2
    const osc1 = ctx.createOscillator()
    osc1.type = 'sawtooth'
    osc1.frequency.value = 60
    const osc2 = ctx.createOscillator()
    osc2.type = 'square'
    osc2.frequency.value = 30
    const osc2Gain = ctx.createGain()
    osc2Gain.gain.value = 0.35
    osc1.connect(filter)
    osc2.connect(osc2Gain).connect(filter)
    filter.connect(engineGain).connect(master)
    osc1.start()
    osc2.start()
    this.osc1 = osc1
    this.osc2 = osc2
    this.engineFilter = filter
    this.engineGain = engineGain

    // スキール: ホワイトノイズ + バンドパス
    const noiseLen = ctx.sampleRate * 2
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf
    noise.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 6
    const skidGain = ctx.createGain()
    skidGain.gain.value = 0
    noise.connect(bp).connect(skidGain).connect(master)
    noise.start()
    this.skidGain = skidGain

    // BGM
    const bgmGain = ctx.createGain()
    bgmGain.gain.value = this._style === 'off' ? 0 : 0.22
    bgmGain.connect(master)
    this.bgmGain = bgmGain
    this.bgmNextTime = ctx.currentTime + 0.1
    this.bgmStep = 0
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 60)
  }

  setMuted(m: boolean): void {
    this._muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05)
  }

  setStyle(style: BgmStyle): void {
    if (style !== this._style) this.bgmStep = 0
    this._style = style
    if (this.bgmGain && this.ctx) this.bgmGain.gain.setTargetAtTime(style === 'off' ? 0 : 0.22, this.ctx.currentTime, 0.1)
  }

  /** 毎フレーム呼ぶ */
  update(input: EngineSoundInput): void {
    const ctx = this.ctx
    if (!ctx || !this.osc1 || !this.osc2 || !this.engineFilter || !this.engineGain || !this.skidGain) return
    const t = ctx.currentTime
    // 擬似ギア: 速度を 5 段に分けて回転数を往復させる
    const ratio = Math.min(1, input.speedMs / Math.max(1, input.maxSpeedMs))
    const gears = 5
    const gearPos = ratio * gears
    const inGear = gearPos - Math.floor(gearPos)
    const rpm = 0.25 + 0.75 * (input.throttle > 0 ? 0.35 + 0.65 * inGear : inGear * 0.8) // 0..1
    const base = 45 + rpm * 190
    this.osc1.frequency.setTargetAtTime(base, t, 0.03)
    this.osc2.frequency.setTargetAtTime(base / 2, t, 0.03)
    this.engineFilter.frequency.setTargetAtTime(300 + rpm * 1800 + input.throttle * 600, t, 0.05)
    const vol = 0.12 + rpm * 0.12 + input.throttle * 0.1
    this.engineGain.gain.setTargetAtTime(vol, t, 0.05)
    const skid = input.wheelsOnGround > 0 ? Math.min(1, input.skid) : 0
    this.skidGain.gain.setTargetAtTime(skid * 0.25, t, 0.05)
  }

  private scheduleBgm(): void {
    const ctx = this.ctx
    if (!ctx || !this.bgmGain || this._style === 'off') {
      if (ctx) this.bgmNextTime = ctx.currentTime + 0.1
      return
    }
    const pat = BGM_STYLES[this._style]
    const stepDur = 60 / pat.bpm / 2 // 8 分音符
    while (this.bgmNextTime < ctx.currentTime + 0.25) {
      const i = this.bgmStep % 16
      const t = this.bgmNextTime
      if (pat.bass[i]) {
        if (pat.bass808) this.play808(NOTE(pat.bass[i]), t, stepDur * 2.5)
        else this.playTone(NOTE(pat.bass[i]), t, stepDur * 0.9, pat.bassType, 0.35, 500)
      }
      if (pat.lead[i]) {
        if (pat.cowbell) this.playCowbell(NOTE(pat.lead[i]), t)
        else this.playTone(NOTE(pat.lead[i]), t, stepDur * 0.6, pat.leadType, 0.12, 3000)
      }
      if (i % 4 === 0) {
        for (const n of pat.chords[(this.bgmStep >> 2) % 4]) this.playTone(NOTE(n), t, stepDur * 3.6, 'triangle', 0.07, 2000)
      }
      if (pat.kick[i]) this.playKick(t)
      if (pat.snare[i]) this.playSnare(t)
      if (pat.hat[i]) {
        this.playHat(t)
        if (this._style === 'phonk') this.playHat(t + stepDur / 2)
      }
      this.bgmNextTime += stepDur
      this.bgmStep++
    }
  }

  private playTone(freq: number, t: number, dur: number, type: OscillatorType, gain: number, cutoff: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(f).connect(g).connect(this.bgmGain!)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private play808(freq: number, t: number, dur: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq * 2, t)
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08)
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1
      curve[i] = Math.tanh(x * 2.5)
    }
    shaper.curve = curve
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(shaper).connect(g).connect(this.bgmGain!)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private playCowbell(freq: number, t: number): void {
    const ctx = this.ctx!
    for (const ratio of [1, 1.48]) {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = freq * ratio
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = freq * 1.2
      bp.Q.value = 3
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.14, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      o.connect(bp).connect(g).connect(this.bgmGain!)
      o.start(t)
      o.stop(t + 0.25)
    }
  }

  private playSnare(t: number): void {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * 0.12)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    const g = ctx.createGain()
    g.gain.value = 0.3
    src.connect(bp).connect(g).connect(this.bgmGain!)
    src.start(t)
  }

  private playKick(t: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    o.connect(g).connect(this.bgmGain!)
    o.start(t)
    o.stop(t + 0.2)
  }

  private playHat(t: number): void {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * 0.05)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 6000
    const g = ctx.createGain()
    g.gain.value = 0.12
    src.connect(hp).connect(g).connect(this.bgmGain!)
    src.start(t)
  }

  dispose(): void {
    if (this.bgmTimer !== null) window.clearInterval(this.bgmTimer)
    this.bgmTimer = null
    void this.ctx?.close()
    this.ctx = null
  }
}

export const audioEngine = new AudioEngine()
