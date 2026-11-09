// Microphone recording in the window: MediaRecorder -> WAV 16 kHz mono PCM16,
// the one format every STT provider accepts.

export interface RecordingResult {
  audio: Uint8Array
  format: "wav"
  seconds: number
}

const TARGET_RATE = 16000

export class Recorder {
  private stream: MediaStream | null = null
  private object: MediaRecorder | null = null
  private analyser: AnalyserNode | null = null
  private context: AudioContext | null = null
  private chunks: Blob[] = []
  private stopped: Promise<void> = Promise.resolve()
  private startedAt = 0

  get recording(): boolean {
    return this.object?.state === "recording"
  }

  async start(onLevel?: (level: number) => void): Promise<void> {
    if (this.recording) return
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone is not available in this window")

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.context = new AudioContext({ sampleRate: TARGET_RATE })
    const source = this.context.createMediaStreamSource(this.stream)
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 512
    source.connect(this.analyser)

    this.object = new MediaRecorder(this.stream)
    this.chunks = []
    this.object.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    })
    this.stopped = new Promise<void>((resolve) => {
      this.object?.addEventListener("stop", () => resolve(), { once: true })
    })
    this.startedAt = performance.now()
    this.object.start(250)

    const data = new Float32Array(this.analyser.fftSize)
    const loop = () => {
      if (!this.recording || !this.analyser) return
      this.analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (const value of data) sum += value * value
      onLevel?.(Math.sqrt(sum / Math.max(1, data.length)))
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  async stop(): Promise<RecordingResult> {
    if (!this.recording || !this.object) throw new Error("Nothing is recording")
    const stopped = this.stopped
    this.object.stop()
    await stopped
    const seconds = (performance.now() - this.startedAt) / 1000
    const blob = new Blob(this.chunks, { type: this.object.mimeType || "audio/webm" })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    this.release()
    const wav = await convertToWav(bytes)
    return { audio: wav, format: "wav", seconds }
  }

  cancel(): void {
    if (this.recording && this.object) this.object.stop()
    this.release()
  }

  private release(): void {
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.context?.close().catch(() => undefined)
    this.stream = null
    this.object = null
    this.analyser = null
    this.context = null
    this.chunks = []
  }
}

async function convertToWav(bytes: Uint8Array): Promise<Uint8Array> {
  const context = new AudioContext({ sampleRate: TARGET_RATE })
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0).buffer as ArrayBuffer)
    const seconds = decoded.length / Math.max(1, decoded.sampleRate)
    const length = Math.max(1, Math.floor(seconds * TARGET_RATE))
    const pcm = new Int16Array(length)
    const channels = decoded.numberOfChannels
    const ratio = decoded.sampleRate / TARGET_RATE
    for (let i = 0; i < length; i++) {
      let value = 0
      for (let ch = 0; ch < channels; ch++) {
        const channel = decoded.getChannelData(ch)
        value += channel[Math.min(channel.length - 1, Math.floor(i * ratio))] ?? 0
      }
      const mixed = value / channels
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mixed * 32767)))
    }
    return encodeWav(pcm, TARGET_RATE)
  } finally {
    await context.close().catch(() => undefined)
  }
}

function encodeWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length * 2)
  const view = new DataView(bytes.buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  write(0, "RIFF")
  view.setUint32(4, 36 + pcm.length * 2, true)
  write(8, "WAVE")
  write(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, "data")
  view.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i]!, true)
  return bytes
}

export function toBase64(bytes: Uint8Array): string {
  let result = ""
  const slice = 0x8000
  for (let i = 0; i < bytes.length; i += slice) {
    result += String.fromCharCode(...bytes.subarray(i, i + slice))
  }
  return btoa(result)
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
