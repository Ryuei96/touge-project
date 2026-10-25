/**
 * Web Audio によるエンジン音・環境音・SE・BGM。外部音源ファイルは使わず全て合成する。
 *
 * 構成
 *   master ─ compressor ─ destination
 *   reverb send（生成したインパルス応答の ConvolverNode）と delay send を共有
 *   engine: 倍音合成（鋸波 + 矩形波 + 正弦波 + 三角波 + 排気ノイズ）→ 歪み → ローパス
 *           5 速の擬似ギア（回転数の上昇とシフト時の落ち込み・スロットルカット）
 *   環境音: 風切り音（速度²）、ロードノイズ（速度）、スキール（横滑り・サイドブレーキ）
 *   SE: 衝突、チェックポイント、ゴール、シフト
 *   BGM: セクション構成（A A B A）のシーケンサー。スーパーソー・パッド・ベース・ドラム + サイドチェイン
 *
 * ブラウザの自動再生制限のため、最初のユーザー操作（キー/クリック）後に start() を呼ぶ。
 */
import { resolveAssetUri } from '../assets/assetUri'
import { ENGINE_WORKLET_SOURCE } from './engineWorklet'

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

/** 'goldrunner' / 'hardcore' は収録トラック、'eurobeat' / 'phonk' は合成 */
export type BgmStyle = 'goldrunner' | 'hardcore' | 'eurobeat' | 'phonk' | 'off'

export const BGM_TRACKS: Record<'goldrunner' | 'hardcore', { uri: string; title: string; artist: string }> = {
  goldrunner: { uri: 'audio/bgm_goldrunner.ogg', title: 'Goldrunner (Maccie Pimp-Me-Up-Mix)', artist: 'Scyphe' },
  hardcore: { uri: 'audio/bgm_hardcore_power.ogg', title: 'Hardcore Power (We Believe In Goa Remix)', artist: 'Dafunk' },
}
export const isTrackStyle = (s: BgmStyle): s is 'goldrunner' | 'hardcore' => s === 'goldrunner' || s === 'hardcore'
export type SfxName = 'collision' | 'bump' | 'checkpoint' | 'finish' | 'shift' | 'start'

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ---------------------------------------------------------------- BGM パターン

interface DrumPattern {
  kick: number[]
  snare: number[]
  hat: number[]
  openHat?: number[]
}

interface Section {
  /** 16 分音符 × 32 ステップ（2 小節）。0 = 休符 */
  lead: number[]
  bass: number[]
  /** 1 小節ごとのコード（MIDI ノート） */
  chords: number[][]
  drums: DrumPattern
}

interface BgmPattern {
  bpm: number
  /** 再生順（セクションのインデックス） */
  order: number[]
  sections: Section[]
  leadType: 'supersaw' | 'cowbell' | 'pluck'
  bassType: 'saw' | '808'
  swing?: number
  leadDelay: boolean
}

const EU_DRUMS: DrumPattern = {
  kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  openHat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
}

// Am - F - C - G（ユーロビート定番進行）
const EU_A: Section = {
  lead: [69, 0, 72, 0, 76, 0, 72, 0, 69, 0, 72, 0, 77, 76, 0, 72, 67, 0, 71, 0, 74, 0, 71, 0, 67, 0, 71, 0, 76, 74, 0, 71],
  bass: [45, 45, 57, 45, 45, 45, 57, 45, 41, 41, 53, 41, 41, 41, 53, 41, 36, 36, 48, 36, 36, 36, 48, 36, 43, 43, 55, 43, 43, 43, 55, 43],
  chords: [
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [48, 52, 55, 60],
    [55, 59, 62, 67],
  ],
  drums: EU_DRUMS,
}
const EU_B: Section = {
  lead: [81, 0, 79, 0, 76, 0, 79, 81, 0, 0, 84, 0, 81, 0, 79, 0, 77, 0, 76, 0, 74, 0, 76, 77, 0, 0, 79, 0, 76, 0, 74, 0],
  bass: [41, 41, 53, 41, 41, 41, 53, 41, 43, 43, 55, 43, 43, 43, 55, 43, 45, 45, 57, 45, 45, 45, 57, 45, 40, 40, 52, 40, 40, 40, 52, 40],
  chords: [
    [53, 57, 60, 65],
    [55, 59, 62, 67],
    [57, 60, 64, 69],
    [52, 56, 59, 64],
  ],
  drums: EU_DRUMS,
}

const PH_DRUMS: DrumPattern = {
  kick: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1],
}
// Dm 系・半音進行（フォンク定番）
const PH_A: Section = {
  lead: [74, 0, 0, 77, 0, 74, 0, 0, 72, 0, 74, 0, 0, 0, 70, 0, 74, 0, 0, 77, 0, 79, 0, 0, 77, 0, 74, 0, 0, 0, 72, 0],
  bass: [38, 0, 0, 0, 0, 0, 0, 38, 0, 0, 41, 0, 0, 0, 0, 0, 36, 0, 0, 0, 0, 0, 0, 36, 0, 0, 34, 0, 0, 0, 0, 0],
  chords: [
    [50, 53, 57],
    [50, 53, 57],
    [48, 51, 55],
    [46, 50, 53],
  ],
  drums: PH_DRUMS,
}
const PH_B: Section = {
  lead: [81, 0, 79, 0, 77, 0, 0, 74, 0, 0, 77, 0, 79, 0, 0, 0, 81, 0, 84, 0, 81, 0, 0, 79, 0, 0, 77, 0, 74, 0, 0, 0],
  bass: [41, 0, 0, 0, 0, 0, 0, 41, 0, 0, 43, 0, 0, 0, 0, 0, 38, 0, 0, 0, 0, 0, 0, 38, 0, 0, 36, 0, 0, 0, 0, 0],
  chords: [
    [53, 57, 60],
    [55, 58, 62],
    [50, 53, 57],
    [48, 51, 55],
  ],
  drums: PH_DRUMS,
}

export const BGM_STYLES: Record<'eurobeat' | 'phonk', BgmPattern> = {
  eurobeat: { bpm: 158, order: [0, 0, 1, 0], sections: [EU_A, EU_B], leadType: 'supersaw', bassType: 'saw', leadDelay: true },
  phonk: { bpm: 142, order: [0, 0, 1, 0], sections: [PH_A, PH_B], leadType: 'cowbell', bassType: '808', swing: 0.08, leadDelay: false },
}

// ---------------------------------------------------------------- ユーティリティ

function makeImpulse(ctx: AudioContext, seconds: number, decay: number, preDelay = 0.015): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    const pre = Math.floor(rate * preDelay)
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate
      // 初期反射（数本）+ 指数減衰ノイズ
      let v = (Math.random() * 2 - 1) * Math.pow(1 - t / seconds, decay)
      if (i - pre < rate * 0.08 && (i - pre) % Math.floor(rate * 0.011 + ch * 37) === 0) v += 0.6 * (1 - t * 10)
      d[i] = v
    }
  }
  return buf
}

function makeNoise(ctx: AudioContext, seconds = 2, kind: 'white' | 'pink' | 'brown' = 'white'): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (kind === 'white') d[i] = w
    else if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25
    } else {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    }
  }
  return buf
}

function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  return curve
}

interface EngineNodes {
  /** AudioWorklet 版エンジン（利用できない環境では null で、オシレータ版を使う） */
  worklet: AudioWorkletNode | null
  oscs: { osc: OscillatorNode; ratio: number; gain: GainNode }[]
  exhaust: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode }
  shaper: WaveShaperNode
  filter: BiquadFilterNode
  presence: BiquadFilterNode
  pipeMix: GainNode
  gain: GainNode
  wind: { gain: GainNode; filter: BiquadFilterNode }
  road: { gain: GainNode }
  skid: { gain: GainNode; filter: BiquadFilterNode }
}

/** 収録音源（Stunt Rally / VDrift 由来、public/audio/LICENSE.md 参照） */
const SAMPLE_FILES = {
  engineLow: 'audio/engines_engine0.ogg',
  engineHigh: 'audio/engines_engine3.ogg',
  squeal: 'audio/surface_tire_squeal_10.ogg',
  wind: 'audio/vehicle_wind.ogg',
  crash1: 'audio/crash_01.ogg',
  crash2: 'audio/crash_03.ogg',
  crash3: 'audio/crash_06.ogg',
  scrap: 'audio/crash_scrap.ogg',
  bump: 'audio/vehicle_bump_front1.ogg',
} as const
type SampleKey = keyof typeof SAMPLE_FILES

interface SampleEngine {
  low: { src: AudioBufferSourceNode; gain: GainNode }
  high: { src: AudioBufferSourceNode; gain: GainNode }
  squeal: { src: AudioBufferSourceNode; gain: GainNode }
  wind: { src: AudioBufferSourceNode; gain: GainNode }
}

/** 擬似ギア比（最高速に対する各ギアの上限速度の割合） */
const GEAR_TOPS = [0.14, 0.27, 0.45, 0.68, 1.0]

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private reverbSend: GainNode | null = null
  private delaySend: GainNode | null = null
  private bgmBus: GainNode | null = null
  private bgmDuck: GainNode | null = null
  private sfxBus: GainNode | null = null
  private engine: EngineNodes | null = null
  private samples: Partial<Record<SampleKey, AudioBuffer>> = {}
  private trackBuffers: Partial<Record<'goldrunner' | 'hardcore', AudioBuffer>> = {}
  private trackSource: AudioBufferSourceNode | null = null
  private trackGain: GainNode | null = null
  private trackLoading: string | null = null
  private sampleEngine: SampleEngine | null = null
  private analyser: AnalyserNode | null = null
  private analyserBuf: Float32Array<ArrayBuffer> | null = null
  private noiseWhite: AudioBuffer | null = null
  private noisePink: AudioBuffer | null = null

  private bgmTimer: number | null = null
  private bgmStep = 0
  private bgmNextTime = 0
  private _muted = false
  private _style: BgmStyle = 'goldrunner'
  private gear = 0
  private shiftUntil = 0
  private shiftDirection = 0
  /** 回転数 [rpm]（慣性付きの状態） */
  private rpm = 900
  private lastUpdate = 0
  volume = 0.5
  /** 現在の回転数 [rpm]（HUD 用） */
  get currentRpm(): number {
    return this.rpm
  }

  get started(): boolean {
    return this.ctx !== null
  }
  get muted(): boolean {
    return this._muted
  }
  get style(): BgmStyle {
    return this._style
  }
  get currentGear(): number {
    return this.gear + 1
  }
  get engineMode(): 'samples' | 'worklet' | 'oscillator' | 'off' {
    if (!this.engine) return 'off'
    if (this.sampleEngine) return 'samples'
    return this.engine.worklet ? 'worklet' : 'oscillator'
  }
  /** 収録 BGM を再生中か */
  get trackPlaying(): boolean {
    return this.trackSource !== null
  }
  /** 直近の出力ピーク（0..1、クリップ検査用） */
  get outputPeak(): number {
    if (!this.analyser || !this.analyserBuf) return 0
    this.analyser.getFloatTimeDomainData(this.analyserBuf)
    let peak = 0
    for (let i = 0; i < this.analyserBuf.length; i++) peak = Math.max(peak, Math.abs(this.analyserBuf[i]))
    return peak
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
    this.noiseWhite = makeNoise(ctx, 2, 'white')
    this.noisePink = makeNoise(ctx, 2, 'pink')

    const master = ctx.createGain()
    master.gain.value = this._muted ? 0 : this.volume
    // バスコンプ → リミッター（ブリックウォール寄り）→ アナライザ → 出力。音割れ防止のため最終段で必ず頭を抑える
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 12
    comp.ratio.value = 3
    comp.attack.value = 0.006
    comp.release.value = 0.2
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -4
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.08
    const trim = ctx.createGain()
    trim.gain.value = 0.85
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    master.connect(comp).connect(limiter).connect(trim).connect(analyser).connect(ctx.destination)
    this.master = master
    this.analyser = analyser
    this.analyserBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4))

    // リバーブ / ディレイ送り
    const reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(ctx, 2.4, 3.2)
    const reverbSend = ctx.createGain()
    reverbSend.gain.value = 1
    const reverbReturn = ctx.createGain()
    reverbReturn.gain.value = 0.28
    reverbSend.connect(reverb).connect(reverbReturn).connect(master)
    this.reverbSend = reverbSend
    const delay = ctx.createDelay(1.0)
    const delayFb = ctx.createGain()
    delayFb.gain.value = 0.32
    const delayFilter = ctx.createBiquadFilter()
    delayFilter.type = 'lowpass'
    delayFilter.frequency.value = 3200
    const delayReturn = ctx.createGain()
    delayReturn.gain.value = 0.22
    const delaySend = ctx.createGain()
    delaySend.connect(delay).connect(delayFilter).connect(delayFb).connect(delay)
    delayFilter.connect(delayReturn).connect(master)
    delayFilter.connect(reverbSend)
    this.delaySend = delaySend
    this.delayNode = delay

    // バス
    const bgmDuck = ctx.createGain()
    const bgmBus = ctx.createGain()
    bgmBus.gain.value = this._style === 'eurobeat' || this._style === 'phonk' ? 0.32 : 0
    bgmBus.connect(bgmDuck).connect(master)
    this.bgmBus = bgmBus
    this.bgmDuck = bgmDuck
    const sfxBus = ctx.createGain()
    sfxBus.gain.value = 0.6
    sfxBus.connect(master)
    sfxBus.connect(reverbSend)
    this.sfxBus = sfxBus

    this.engine = this.buildEngine(ctx, master, reverbSend)
    void this.attachWorklet(ctx)
    void this.loadSamples(ctx)

    this.bgmNextTime = ctx.currentTime + 0.1
    this.bgmStep = 0
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 50)
    if (isTrackStyle(this._style)) void this.playTrack(this._style)
  }

  private delayNode: DelayNode | null = null

  /** 収録音源を読み込み、揃ったらサンプル再生のエンジンに切り替える */
  private async loadSamples(ctx: AudioContext): Promise<void> {
    const engineAtStart = this.engine
    try {
      const entries = await Promise.all(
        (Object.entries(SAMPLE_FILES) as [SampleKey, string][]).map(async ([key, uri]) => {
          const res = await fetch(resolveAssetUri(uri))
          if (!res.ok) throw new Error(`${uri}: ${res.status}`)
          const buf = await ctx.decodeAudioData(await res.arrayBuffer())
          return [key, buf] as const
        }),
      )
      for (const [k, b] of entries) this.samples[k] = b
      if (this.engine !== engineAtStart || !this.engine) return
      this.buildSampleEngine(ctx, this.engine)
    } catch (err) {
      console.warn('[AudioEngine] sample loading failed, keeping synthesized engine', err)
    }
  }

  private loop(ctx: AudioContext, buffer: AudioBuffer, dest: AudioNode, gain = 0): { src: AudioBufferSourceNode; gain: GainNode } {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(dest)
    src.start()
    return { src, gain: g }
  }

  private buildSampleEngine(ctx: AudioContext, e: EngineNodes): void {
    const s = this.samples
    if (!s.engineLow || !s.engineHigh || !s.squeal || !s.wind || !this.master) return
    const t = ctx.currentTime
    // 合成エンジンを止める
    if (e.worklet) e.worklet.parameters.get('volume')!.setTargetAtTime(0, t, 0.1)
    for (const o of e.oscs) o.gain.gain.setTargetAtTime(0, t, 0.05)
    e.exhaust.gain.gain.setTargetAtTime(0, t, 0.05)
    e.wind.gain.gain.setTargetAtTime(0, t, 0.1)
    e.skid.gain.gain.setTargetAtTime(0, t, 0.1)
    // 排気管コムは実音には不要（金属的な共鳴が付くため）
    e.pipeMix.gain.setTargetAtTime(0, t, 0.1)
    this.sampleEngine = {
      low: this.loop(ctx, s.engineLow, e.shaper, 0),
      high: this.loop(ctx, s.engineHigh, e.shaper, 0),
      squeal: this.loop(ctx, s.squeal, this.master, 0),
      wind: this.loop(ctx, s.wind, this.master, 0),
    }
    this.sampleEngine.squeal.gain.connect(this.reverbSend!)
  }

  /** AudioWorklet 版エンジンを読み込み、成功したらオシレータ版と差し替える */
  private async attachWorklet(ctx: AudioContext): Promise<void> {
    const e = this.engine
    if (!e || !ctx.audioWorklet) return
    try {
      const blob = new Blob([ENGINE_WORKLET_SOURCE], { type: 'application/javascript' })
      const url = URL.createObjectURL(blob)
      await ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      if (this.engine !== e) return
      const node = new AudioWorkletNode(ctx, 'touge-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] })
      node.connect(e.shaper)
      // オシレータ版を止める
      for (const o of e.oscs) o.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
      e.exhaust.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
      e.worklet = node
    } catch (err) {
      console.warn('[AudioEngine] AudioWorklet unavailable, using oscillator engine', err)
    }
  }

  private buildEngine(ctx: AudioContext, master: GainNode, reverbSend: GainNode): EngineNodes {
    const shaper = ctx.createWaveShaper()
    shaper.curve = softClipCurve(1.4)
    shaper.oversample = '2x'
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 700
    filter.Q.value = 1.4
    const gain = ctx.createGain()
    gain.gain.value = 0
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 110
    body.Q.value = 1.0
    body.gain.value = 6
    const presence = ctx.createBiquadFilter()
    presence.type = 'peaking'
    presence.frequency.value = 2400
    presence.Q.value = 1.2
    presence.gain.value = 0
    // 排気管の共鳴（短いフィードバックディレイ = コムフィルタ）
    const pipe = ctx.createDelay(0.05)
    pipe.delayTime.value = 0.0042
    const pipeFb = ctx.createGain()
    pipeFb.gain.value = 0.42
    const pipeLp = ctx.createBiquadFilter()
    pipeLp.type = 'lowpass'
    pipeLp.frequency.value = 1800
    pipe.connect(pipeLp).connect(pipeFb).connect(pipe)
    const pipeMix = ctx.createGain()
    pipeMix.gain.value = 0.5
    shaper.connect(filter)
    filter.connect(body)
    filter.connect(pipe)
    pipeLp.connect(pipeMix).connect(body)
    body.connect(presence).connect(gain)
    gain.connect(master)
    const engineVerb = ctx.createGain()
    engineVerb.gain.value = 0.25
    gain.connect(engineVerb).connect(reverbSend)

    // 倍音: [比率, 波形, 音量]
    const spec: [number, OscillatorType, number][] = [
      [0.5, 'square', 0.22],
      [1, 'sawtooth', 0.5],
      [1.5, 'sawtooth', 0.14],
      [2, 'sine', 0.22],
      [3, 'triangle', 0.12],
      [4, 'sine', 0.06],
    ]
    const oscs = spec.map(([ratio, type, g]) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = 40 * ratio
      const og = ctx.createGain()
      og.gain.value = g
      osc.connect(og).connect(shaper)
      osc.start()
      return { osc, ratio, gain: og }
    })
    // 排気ノイズ（回転に同期したバンドパス）
    const src = ctx.createBufferSource()
    src.buffer = this.noiseWhite
    src.loop = true
    const ef = ctx.createBiquadFilter()
    ef.type = 'bandpass'
    ef.frequency.value = 400
    ef.Q.value = 2.5
    const eg = ctx.createGain()
    eg.gain.value = 0.1
    src.connect(ef).connect(eg).connect(shaper)
    src.start()

    // 風切り音
    const windSrc = ctx.createBufferSource()
    windSrc.buffer = this.noisePink
    windSrc.loop = true
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 600
    const windGain = ctx.createGain()
    windGain.gain.value = 0
    windSrc.connect(windFilter).connect(windGain).connect(master)
    windSrc.start()

    // ロードノイズ
    const roadSrc = ctx.createBufferSource()
    roadSrc.buffer = makeNoise(ctx, 2, 'brown')
    roadSrc.loop = true
    const roadFilter = ctx.createBiquadFilter()
    roadFilter.type = 'lowpass'
    roadFilter.frequency.value = 260
    const roadGain = ctx.createGain()
    roadGain.gain.value = 0
    roadSrc.connect(roadFilter).connect(roadGain).connect(master)
    roadSrc.start()

    // スキール
    const skidSrc = ctx.createBufferSource()
    skidSrc.buffer = this.noiseWhite
    skidSrc.loop = true
    const skidFilter = ctx.createBiquadFilter()
    skidFilter.type = 'bandpass'
    skidFilter.frequency.value = 2100
    skidFilter.Q.value = 9
    const skidLfo = ctx.createOscillator()
    skidLfo.frequency.value = 11
    const skidLfoGain = ctx.createGain()
    skidLfoGain.gain.value = 260
    skidLfo.connect(skidLfoGain).connect(skidFilter.frequency)
    skidLfo.start()
    const skidGain = ctx.createGain()
    skidGain.gain.value = 0
    skidSrc.connect(skidFilter).connect(skidGain).connect(master)
    skidGain.connect(reverbSend)
    skidSrc.start()

    return {
      worklet: null,
      oscs,
      exhaust: { src, filter: ef, gain: eg },
      shaper,
      filter,
      presence,
      pipeMix,
      gain,
      wind: { gain: windGain, filter: windFilter },
      road: { gain: roadGain },
      skid: { gain: skidGain, filter: skidFilter },
    }
  }

  setMuted(m: boolean): void {
    this._muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05)
  }

  setStyle(style: BgmStyle): void {
    if (style !== this._style) this.bgmStep = 0
    this._style = style
    const ctx = this.ctx
    if (!ctx) return
    const synth = style === 'eurobeat' || style === 'phonk'
    if (this.bgmBus) this.bgmBus.gain.setTargetAtTime(synth ? 0.32 : 0, ctx.currentTime, 0.1)
    if (this.delayNode && synth) this.delayNode.delayTime.value = (60 / BGM_STYLES[style].bpm) * 0.75
    if (isTrackStyle(style)) void this.playTrack(style)
    else this.stopTrack()
  }

  private stopTrack(): void {
    const ctx = this.ctx
    if (this.trackSource && ctx && this.trackGain) {
      const src = this.trackSource
      this.trackGain.gain.setTargetAtTime(0, ctx.currentTime, 0.25)
      window.setTimeout(() => {
        try {
          src.stop()
        } catch {
          /* already stopped */
        }
      }, 1200)
      this.trackSource = null
    }
  }

  /** 収録トラックをループ再生（読み込みは初回のみ） */
  private async playTrack(key: 'goldrunner' | 'hardcore'): Promise<void> {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    this.stopTrack()
    if (!this.trackBuffers[key]) {
      if (this.trackLoading === key) return
      this.trackLoading = key
      try {
        const res = await fetch(resolveAssetUri(BGM_TRACKS[key].uri))
        if (!res.ok) throw new Error(`${BGM_TRACKS[key].uri}: ${res.status}`)
        this.trackBuffers[key] = await ctx.decodeAudioData(await res.arrayBuffer())
      } catch (err) {
        console.warn('[AudioEngine] BGM track failed, falling back to synth', err)
        this.trackLoading = null
        this.setStyle('eurobeat')
        return
      }
      this.trackLoading = null
      if (this._style !== key) return
    }
    const src = ctx.createBufferSource()
    src.buffer = this.trackBuffers[key]!
    src.loop = true
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.42, ctx.currentTime + 1.2)
    src.connect(g).connect(this.master)
    src.start()
    this.trackSource = src
    this.trackGain = g
  }

  /** 毎フレーム呼ぶ */
  update(input: EngineSoundInput): void {
    const ctx = this.ctx
    const e = this.engine
    if (!ctx || !e) return
    const t = ctx.currentTime
    const dt = this.lastUpdate ? Math.min(0.1, t - this.lastUpdate) : 1 / 60
    this.lastUpdate = t
    const IDLE = 900
    const REDLINE = 7400
    const v = input.speedMs
    const ratio = clamp01(v / Math.max(1, input.maxSpeedMs))

    // ギア選択（ヒステリシス付き）
    const low = this.gear === 0 ? 0 : GEAR_TOPS[this.gear - 1]
    const top = GEAR_TOPS[this.gear]
    const inGear = clamp01((ratio - low) / (top - low))
    if (t > this.shiftUntil) {
      if (inGear > 0.97 && this.gear < GEAR_TOPS.length - 1 && input.throttle > 0.1) {
        this.gear++
        this.shiftUntil = t + 0.18
        this.shiftDirection = 1
        if (v > 3) this.playSfx('shift')
      } else if (inGear < 0.12 && this.gear > 0) {
        this.gear--
        this.shiftUntil = t + 0.12
        this.shiftDirection = -1
      }
    }
    const low2 = this.gear === 0 ? 0 : GEAR_TOPS[this.gear - 1]
    const inGear2 = clamp01((ratio - low2) / (GEAR_TOPS[this.gear] - low2))
    const shifting = t < this.shiftUntil

    // 目標回転数: 停車中はスロットルで空ぶかし、走行中はギア内位置に比例
    const moving = v > 0.8
    let target: number
    if (!moving) target = IDLE + input.throttle * (REDLINE * 0.62 - IDLE)
    else target = IDLE + (REDLINE - IDLE) * (0.18 + 0.82 * inGear2)
    if (shifting && this.shiftDirection > 0) target *= 0.78
    // 慣性: 吹け上がりは速く、落ちはゆっくり。負荷が高いほど上がりが鈍い
    const rising = target > this.rpm
    const rate = rising ? (moving ? 2400 + input.throttle * 3200 : 5200) : 2600
    const delta = target - this.rpm
    this.rpm += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt)
    this.rpm = Math.max(IDLE * 0.9, Math.min(REDLINE, this.rpm))

    // 負荷: 加速中（スロットル × まだ回転が上がり切っていない）ほど重い。惰性は軽い
    const accelLoad = input.throttle * (0.55 + 0.45 * (1 - inGear2))
    const load = shifting ? 0.15 : moving ? accelLoad : input.throttle * 0.6
    const throttleEff = shifting ? 0 : input.throttle
    const r = (this.rpm - IDLE) / (REDLINE - IDLE)

    if (this.sampleEngine) {
      const se = this.sampleEngine
      // 2 本のループを回転数でクロスフェード。低回転ループは 2600 rpm、高回転ループは 5200 rpm を基準ピッチとする
      const rateLow = this.rpm / 2600
      const rateHigh = this.rpm / 5200
      se.low.src.playbackRate.setTargetAtTime(Math.max(0.35, Math.min(2.4, rateLow)), t, 0.03)
      se.high.src.playbackRate.setTargetAtTime(Math.max(0.4, Math.min(1.8, rateHigh)), t, 0.03)
      const xf = clamp01((this.rpm - 2800) / 2400) // 0 = low のみ, 1 = high のみ
      const loadGain = 0.55 + 0.45 * load
      se.low.gain.gain.setTargetAtTime((1 - xf) * 0.9 * loadGain, t, 0.05)
      se.high.gain.gain.setTargetAtTime(xf * 0.8 * loadGain, t, 0.05)
      se.wind.gain.gain.setTargetAtTime(clamp01((v - 8) / 45) ** 2 * 0.6, t, 0.1)
      se.wind.src.playbackRate.setTargetAtTime(0.8 + clamp01(v / 50) * 0.5, t, 0.2)
      const skidS = input.wheelsOnGround > 0 ? clamp01(input.skid) : 0
      se.squeal.gain.gain.setTargetAtTime(skidS * 0.5, t, 0.04)
      se.squeal.src.playbackRate.setTargetAtTime(0.9 + skidS * 0.25, t, 0.1)
    } else if (e.worklet) {
      const p = e.worklet.parameters
      p.get('rpm')!.setTargetAtTime(this.rpm, t, 0.03)
      p.get('throttle')!.setTargetAtTime(throttleEff, t, 0.05)
      p.get('load')!.setTargetAtTime(load, t, 0.08)
    } else {
      const fundamental = (this.rpm / 60) * 2
      for (const o of e.oscs) o.osc.frequency.setTargetAtTime(fundamental * o.ratio, t, 0.02)
      e.exhaust.filter.frequency.setTargetAtTime(fundamental * 7, t, 0.03)
      e.exhaust.gain.gain.setTargetAtTime(0.05 + throttleEff * 0.16, t, 0.05)
    }
    // トーン: 負荷で明るく・前に出る。惰性は籠る
    e.filter.frequency.setTargetAtTime(380 + r * 2200 + load * 1800, t, 0.06)
    e.presence.gain.setTargetAtTime(load * 7 - 2, t, 0.08)
    e.gain.gain.setTargetAtTime((0.14 + r * 0.1) * (0.6 + 0.4 * load) * (shifting ? 0.7 : 1), t, 0.05)

    // 風・路面（収録音源が無いときはノイズ合成）
    e.road.gain.gain.setTargetAtTime(input.wheelsOnGround > 0 ? clamp01(v / 30) * 0.28 : 0, t, 0.1)
    if (!this.sampleEngine) {
      e.wind.gain.gain.setTargetAtTime(clamp01((v - 8) / 45) ** 2 * 0.4, t, 0.1)
      e.wind.filter.frequency.setTargetAtTime(400 + v * 40, t, 0.1)
      const skid = input.wheelsOnGround > 0 ? clamp01(input.skid) : 0
      e.skid.gain.gain.setTargetAtTime(skid * 0.18, t, 0.05)
      e.skid.filter.frequency.setTargetAtTime(1700 + skid * 900, t, 0.05)
    }
  }

  // ---------------------------------------------------------------- SE

  playSfx(name: SfxName): void {
    const ctx = this.ctx
    const bus = this.sfxBus
    if (!ctx || !bus) return
    const t = ctx.currentTime
    const playSample = (key: SampleKey, gain: number, rate = 1) => {
      const buf = this.samples[key]
      if (!buf) return false
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = rate
      const g = ctx.createGain()
      g.gain.value = gain
      src.connect(g).connect(bus)
      src.start(t)
      return true
    }
    switch (name) {
      case 'bump': {
        if (!playSample('bump', 0.7, 0.9 + Math.random() * 0.2)) this.playSfx('collision')
        break
      }
      case 'collision': {
        const keys: SampleKey[] = ['crash1', 'crash2', 'crash3']
        if (playSample(keys[Math.floor(Math.random() * keys.length)], 0.9, 0.95 + Math.random() * 0.1)) {
          if (Math.random() < 0.35) playSample('scrap', 0.35, 1)
          break
        }
        // 低域のドスン + 金属的なガシャ
        const o = ctx.createOscillator()
        o.frequency.setValueAtTime(140, t)
        o.frequency.exponentialRampToValueAtTime(35, t + 0.25)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.9, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
        o.connect(g).connect(bus)
        o.start(t)
        o.stop(t + 0.4)
        const n = ctx.createBufferSource()
        n.buffer = this.noiseWhite
        const f = ctx.createBiquadFilter()
        f.type = 'bandpass'
        f.frequency.value = 2400
        f.Q.value = 1.2
        const ng = ctx.createGain()
        ng.gain.setValueAtTime(0.5, t)
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
        n.connect(f).connect(ng).connect(bus)
        n.start(t)
        n.stop(t + 0.3)
        break
      }
      case 'checkpoint': {
        for (const [i, f] of [1046.5, 1318.5].entries()) this.bell(f, t + i * 0.09, 0.9, 0.25)
        break
      }
      case 'finish': {
        ;[72, 76, 79, 84].forEach((n, i) => this.bell(NOTE(n), t + i * 0.12, 1.4, 0.3))
        break
      }
      case 'start': {
        this.bell(880, t, 0.5, 0.2)
        break
      }
      case 'shift': {
        const n = ctx.createBufferSource()
        n.buffer = this.noiseWhite
        const f = ctx.createBiquadFilter()
        f.type = 'highpass'
        f.frequency.value = 2500
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.18, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
        n.connect(f).connect(g).connect(bus)
        n.start(t)
        n.stop(t + 0.08)
        break
      }
    }
  }

  private bell(freq: number, t: number, dur: number, gain: number): void {
    const ctx = this.ctx!
    const bus = this.sfxBus!
    for (const [ratio, g] of [
      [1, 1],
      [2.0, 0.35],
      [3.01, 0.18],
      [4.2, 0.08],
    ] as [number, number][]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = freq * ratio
      const og = ctx.createGain()
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(gain * g, t + 0.005)
      og.gain.exponentialRampToValueAtTime(0.0005, t + dur / Math.sqrt(ratio))
      o.connect(og).connect(bus)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }

  // ---------------------------------------------------------------- BGM

  private scheduleBgm(): void {
    const ctx = this.ctx
    if (!ctx || !this.bgmBus || (this._style !== 'eurobeat' && this._style !== 'phonk')) {
      if (ctx) this.bgmNextTime = ctx.currentTime + 0.1
      return
    }
    const pat = BGM_STYLES[this._style]
    const stepDur = 60 / pat.bpm / 4 // 16 分音符
    while (this.bgmNextTime < ctx.currentTime + 0.3) {
      const stepsPerSection = 32
      const sectionIdx = pat.order[Math.floor(this.bgmStep / stepsPerSection) % pat.order.length]
      const sec = pat.sections[sectionIdx]
      const i = this.bgmStep % stepsPerSection
      const swing = pat.swing && i % 2 === 1 ? stepDur * pat.swing : 0
      const t = this.bgmNextTime + swing
      const bar = Math.floor(i / 16)
      const chord = sec.chords[(bar * 2 + Math.floor((i % 16) / 8)) % sec.chords.length]

      if (sec.bass[i]) {
        if (pat.bassType === '808') this.play808(NOTE(sec.bass[i]), t, stepDur * 6)
        else this.playBass(NOTE(sec.bass[i]), t, stepDur * 1.8)
      }
      if (sec.lead[i]) {
        // 次の休符までの長さ
        let len = 1
        while (len < 8 && i + len < stepsPerSection && sec.lead[i + len] === 0) len++
        if (pat.leadType === 'supersaw') this.playSupersaw(NOTE(sec.lead[i]), t, stepDur * (len * 0.9))
        else if (pat.leadType === 'cowbell') this.playCowbell(NOTE(sec.lead[i]), t)
        else this.playPluck(NOTE(sec.lead[i]), t, stepDur * 2)
      }
      if (i % 8 === 0) this.playPad(chord, t, stepDur * 8.2)
      if (sec.drums.kick[i]) {
        this.playKick(t)
        this.duck(t)
      }
      if (sec.drums.snare[i]) this.playSnare(t)
      if (sec.drums.hat[i]) this.playHat(t, false)
      if (sec.drums.openHat?.[i]) this.playHat(t, true)
      this.bgmNextTime += stepDur
      this.bgmStep++
    }
  }

  private duck(t: number): void {
    const d = this.bgmDuck!
    d.gain.cancelScheduledValues(t)
    d.gain.setValueAtTime(1, t)
    d.gain.linearRampToValueAtTime(0.62, t + 0.012)
    d.gain.linearRampToValueAtTime(1, t + 0.22)
  }

  private voice(dest: AudioNode, t: number, dur: number, attack: number, peak: number, release = dur): GainNode {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.setTargetAtTime(0.0001, t + dur, release / 4)
    g.connect(dest)
    return g
  }

  private playSupersaw(freq: number, t: number, dur: number): void {
    const ctx = this.ctx!
    const out = this.voice(this.bgmBus!, t, dur, 0.012, 0.11)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(5200, t)
    f.frequency.exponentialRampToValueAtTime(2200, t + dur)
    f.Q.value = 0.8
    f.connect(out)
    const send = ctx.createGain()
    send.gain.value = 0.5
    out.connect(send)
    send.connect(this.reverbSend!)
    if (this.delaySend) out.connect(this.delaySend)
    const detunes = [-14, -7, -2, 0, 2, 7, 14]
    for (const d of detunes) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = freq
      o.detune.value = d
      const og = ctx.createGain()
      og.gain.value = 1 / detunes.length
      o.connect(og).connect(f)
      o.start(t)
      o.stop(t + dur + 0.6)
    }
  }

  private playPluck(freq: number, t: number, dur: number): void {
    const ctx = this.ctx!
    const out = this.voice(this.bgmBus!, t, dur, 0.004, 0.14)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(4000, t)
    f.frequency.exponentialRampToValueAtTime(600, t + dur)
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = freq
    o.connect(f).connect(out)
    o.start(t)
    o.stop(t + dur + 0.3)
  }

  private playBass(freq: number, t: number, dur: number): void {
    const ctx = this.ctx!
    const out = this.voice(this.bgmBus!, t, dur, 0.005, 0.3)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(1400, t)
    f.frequency.exponentialRampToValueAtTime(320, t + dur)
    f.Q.value = 3
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = freq / 2
    const sg = ctx.createGain()
    sg.gain.value = 0.5
    o.connect(f).connect(out)
    sub.connect(sg).connect(out)
    o.start(t)
    o.stop(t + dur + 0.3)
    sub.start(t)
    sub.stop(t + dur + 0.3)
  }

  private play808(freq: number, t: number, dur: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq * 2.2, t)
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.07)
    const shaper = ctx.createWaveShaper()
    shaper.curve = softClipCurve(3.2)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(shaper).connect(g).connect(this.bgmBus!)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private playCowbell(freq: number, t: number): void {
    const ctx = this.ctx!
    const out = this.voice(this.bgmBus!, t, 0.3, 0.002, 0.16, 0.3)
    out.connect(this.reverbSend!)
    for (const ratio of [1, 1.48, 2.1]) {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = freq * ratio
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = freq * 1.3
      bp.Q.value = 2.5
      const og = ctx.createGain()
      og.gain.value = ratio === 1 ? 0.6 : 0.3
      o.connect(bp).connect(og).connect(out)
      o.start(t)
      o.stop(t + 0.5)
    }
  }

  private playPad(notes: number[], t: number, dur: number): void {
    const ctx = this.ctx!
    const out = this.voice(this.bgmBus!, t, dur, 0.25, 0.05, dur)
    out.connect(this.reverbSend!)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1500
    f.connect(out)
    for (const n of notes) {
      for (const d of [-5, 5]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = NOTE(n)
        o.detune.value = d
        const og = ctx.createGain()
        og.gain.value = 0.5 / notes.length
        o.connect(og).connect(f)
        o.start(t)
        o.stop(t + dur + 1.0)
      }
    }
  }

  private playKick(t: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(160, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.9, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26)
    o.connect(g).connect(this.bgmBus!)
    o.start(t)
    o.stop(t + 0.3)
    // クリック
    const n = ctx.createBufferSource()
    n.buffer = this.noiseWhite
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.25, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02)
    n.connect(hp).connect(ng).connect(this.bgmBus!)
    n.start(t)
    n.stop(t + 0.03)
  }

  private playSnare(t: number): void {
    const ctx = this.ctx!
    const n = ctx.createBufferSource()
    n.buffer = this.noiseWhite
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2200
    bp.Q.value = 0.8
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.45, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    n.connect(bp).connect(g).connect(this.bgmBus!)
    g.connect(this.reverbSend!)
    n.start(t)
    n.stop(t + 0.2)
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(230, t)
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.35, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
    o.connect(og).connect(this.bgmBus!)
    o.start(t)
    o.stop(t + 0.12)
  }

  private playHat(t: number, open: boolean): void {
    const ctx = this.ctx!
    const n = ctx.createBufferSource()
    n.buffer = this.noiseWhite
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7000
    const g = ctx.createGain()
    const dur = open ? 0.18 : 0.045
    g.gain.setValueAtTime(open ? 0.14 : 0.1, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    n.connect(hp).connect(g).connect(this.bgmBus!)
    n.start(t)
    n.stop(t + dur + 0.01)
  }

  dispose(): void {
    this.stopTrack()
    if (this.bgmTimer !== null) window.clearInterval(this.bgmTimer)
    this.bgmTimer = null
    void this.ctx?.close()
    this.ctx = null
    this.engine = null
  }
}

export const audioEngine = new AudioEngine()
