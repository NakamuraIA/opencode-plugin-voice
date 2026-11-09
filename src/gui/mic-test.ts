// Live microphone level for the settings page test. No recording is kept:
// the stream is only read through an analyser for the meter.

export class MicLevelTest {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private onLevel: (level: number) => void

  constructor(onLevel: (level: number) => void) {
    this.onLevel = onLevel
  }

  get active(): boolean {
    return this.stream !== null
  }

  async start(): Promise<void> {
    if (this.active) return
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone is not available in this window")
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.context = new AudioContext()
    const source = this.context.createMediaStreamSource(this.stream)
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 512
    source.connect(this.analyser)

    const data = new Float32Array(this.analyser.fftSize)
    const loop = () => {
      if (!this.active || !this.analyser) return
      this.analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (const value of data) sum += value * value
      this.onLevel(Math.sqrt(sum / Math.max(1, data.length)))
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.context?.close().catch(() => undefined)
    this.stream = null
    this.context = null
    this.analyser = null
    this.onLevel(0)
  }
}
