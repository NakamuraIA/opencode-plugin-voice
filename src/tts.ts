import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import type { TtsSettings } from "./settings"

// Text-to-speech through the free Microsoft Edge Read-Aloud API, server side.
// Long replies are split into sentence-sized chunks by splitForSpeech(); the
// GUI synthesizes them one by one and schedules playback, so nothing is cut
// and the first words start before the whole reply is ready.

export interface TtsVoiceInfo {
  shortName: string
  name: string
  gender: string
  locale: string
}

let voicesCache: TtsVoiceInfo[] | null = null

export async function listVoices(): Promise<TtsVoiceInfo[]> {
  if (voicesCache) return voicesCache
  const engine = new MsEdgeTTS()
  const voices = await engine.getVoices()
  voicesCache = voices
    .filter((voice) => voice.ShortName)
    .map((voice) => ({
      shortName: voice.ShortName,
      name: voice.FriendlyName || voice.ShortName,
      gender: voice.Gender || "",
      locale: voice.Locale || "",
    }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName))
  return voicesCache
}

/** Markdown removal that keeps line breaks, so headings and tables clean per line. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/~~~[\s\S]*?~~~/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, "")
    // Emoji and symbol glyphs are not spoken; Edge can also drop the stream on
    // some of them. Keep only real words and punctuation.
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\uFE0F\u200D]/g, "")
    .replace(/[✅✔✓☑→←↑↓•]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
}

/** Strips Markdown so the engine reads words instead of symbols. */
export function cleanForSpeech(text: string): string {
  return stripMarkdown(text)
    .replace(/\s*\n\s*/g, " ")
    .trim()
}

function splitLongSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence]
  const parts: string[] = []
  let rest = sentence
  while (rest.length > maxChars) {
    let cut = Math.max(
      rest.lastIndexOf(", ", maxChars),
      rest.lastIndexOf("; ", maxChars),
      rest.lastIndexOf(": ", maxChars),
      rest.lastIndexOf(" ", maxChars),
    )
    if (cut < maxChars * 0.4) cut = maxChars
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts.filter(Boolean)
}

/**
 * Splits a reply into speakable chunks with no character limit on the reply:
 * paragraphs, then sentences, then a hard split only for giant sentences.
 * The concatenation of the chunks preserves every spoken word.
 */
export function splitForSpeech(text: string, maxChars = 320): string[] {
  // Clean before splitting so headings, tables and bullets are removed while
  // their lines are still line starts; then split paragraphs on blank lines.
  const cleaned = stripMarkdown(text.replace(/\r\n/g, "\n"))
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const chunks: string[] = []
  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?…])\s+/)
    let current = ""
    for (const sentence of sentences) {
      for (const piece of splitLongSentence(sentence, maxChars)) {
        if (!piece) continue
        if (!current) {
          current = piece
          continue
        }
        if (current.length + 1 + piece.length <= maxChars) {
          current = `${current} ${piece}`
        } else {
          chunks.push(current)
          current = piece
        }
      }
    }
    if (current) chunks.push(current)
  }

  if (!chunks.length) {
    const fallback = cleanForSpeech(text)
    if (fallback) chunks.push(fallback)
  }
  return chunks
}
export async function synthesize(text: string, tts: TtsSettings, signal?: AbortSignal): Promise<Buffer> {
  if (tts.engine === "kitsune") {
    try {
      return await synthesizeKitsune(text, tts, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      // Local Kitsune server missing or offline: fall back to Edge so a first
      // run still speaks instead of failing silently.
      console.warn(
        "[voice] Kitsune local unavailable; falling back to Edge:",
        error instanceof Error ? error.message : error,
      )
      return synthesize(text, { ...tts, engine: "edge" }, signal)
    }
  }
  if (tts.engine === "openai") return synthesizeOpenAI(text, tts, signal)
  const clean = cleanForSpeech(text)
  if (!clean) throw new Error("Nothing to read aloud")

  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new Error("Speech cancelled")
    try {
      return await synthesizeOnce(clean, tts, signal)
    } catch (error) {
      lastError = error
      if (signal?.aborted) throw error
      // Edge occasionally closes the socket mid-synthesis; a fresh engine
      // usually completes the same text.
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Streams one continuous MP3 from a single Edge TTS request through `write`.
 * This is what the local HTTP endpoint uses: no chunk seams, no character
 * limit, and the browser starts playing as soon as the first bytes arrive.
 */
export async function streamSpeech(
  text: string,
  tts: TtsSettings,
  write: (chunk: Buffer) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (tts.engine === "openai") {
    const audio = await synthesizeOpenAI(text, tts, signal)
    write(audio)
    return
  }
  if (tts.engine === "kitsune") {
    try {
      const clean = cleanForSpeech(text)
      if (!clean) throw new Error("Nothing to read aloud")
      const base = await ensureKitsuneServer(tts)
      const response = await fetch(`${base}/tts/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean,
          voice: tts.kitsuneVoice === "hana" ? "hana" : "nyra",
          speed: tts.rate || 1,
        }),
        signal,
      })
      if (!response.ok || !response.body) {
        let detail = ""
        try {
          detail = (await response.text()).slice(0, 300)
        } catch {
          // body unavailable
        }
        throw new Error(`Nyra local (stream) falhou (${response.status}) ${detail}`)
      }
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && value.length) write(Buffer.from(value))
      }
      return
    } catch (error) {
      if (signal?.aborted) throw error
      // Fall through to Edge streaming so read-aloud still works when the local
      // server is not installed or is down.
      console.warn(
        "[voice] Kitsune local unavailable (stream); falling back to Edge:",
        error instanceof Error ? error.message : error,
      )
    }
  }
  const clean = cleanForSpeech(text)
  if (!clean) throw new Error("Nothing to read aloud")

  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new Error("Speech cancelled")
    const engine = new MsEdgeTTS()
    let wrote = false
    try {
      await engine.setMetadata(tts.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      const { audioStream } = engine.toStream(clean, { rate: tts.rate })
      for await (const chunk of audioStream) {
        if (signal?.aborted) throw new Error("Speech cancelled")
        if (!chunk) continue
        write(Buffer.from(chunk as Uint8Array))
        wrote = true
      }
      return
    } catch (error) {
      lastError = error
      // Once bytes reached the player, restarting would create a seam; report.
      if (wrote || signal?.aborted) throw error
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
    } finally {
      engine.close()
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function ttsMimeType(tts: TtsSettings): string {
  if (tts.engine === "openai") return "audio/wav"
  return tts.engine === "kitsune" ? "audio/wav" : "audio/mpeg"
}

/** Synthesizes through a VoiceBox / OpenAI-compatible gateway. */
export async function synthesizeOpenAI(
  text: string,
  tts: TtsSettings,
  signal?: AbortSignal,
): Promise<Buffer> {
  const clean = cleanForSpeech(text)
  if (!clean) throw new Error("Nothing to read aloud")
  const base = (tts.apiUrl || "http://127.0.0.1:8095").replace(/\/+$/, "")
  const response = await fetch(`${base}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: tts.apiModel || undefined,
      input: clean,
      voice: tts.apiVoice || undefined,
      response_format: "wav",
      speed: tts.rate || 1,
      instructions: tts.apiInstructions || undefined,
    }),
    signal,
  })
  if (!response.ok) {
    let detail = ""
    try {
      detail = (await response.text()).slice(0, 300)
    } catch {
      // body unavailable
    }
    throw new Error(`VoiceBox falhou (${response.status}) ${detail}`)
  }
  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length) throw new Error("VoiceBox devolveu áudio vazio")
  return audio
}

const KITSUNE_DEFAULT_URL = "http://127.0.0.1:8091"
let kitsuneStarting: Promise<void> | null = null

function pythonCommand(): string {
  const env = process.env.PYTHON
  if (env && existsSync(env)) return env
  const absolute = "C:\\Program Files\\Python312\\python.exe"
  if (existsSync(absolute)) return absolute
  return "python"
}

async function kitsuneAlive(base: string, timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}/health`, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Returns the base URL, starting the Python sidecar when it is not running. */
async function ensureKitsuneServer(tts: TtsSettings): Promise<string> {
  const base = (tts.kitsuneUrl || KITSUNE_DEFAULT_URL).replace(/\/+$/, "")
  if (await kitsuneAlive(base)) return base
  if (!kitsuneStarting) {
    kitsuneStarting = (async () => {
      const script = tts.kitsuneScript
      if (!script || !existsSync(script)) {
        throw new Error(`Servidor da Nyra fora do ar e script não encontrado: ${script || "(vazio)"}`)
      }
      const parsed = new URL(base)
      const port = parsed.port || "8091"
      const python = pythonCommand()
      const child = spawn(python, [script, "--port", port], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        cwd: script.replace(/[\\/][^\\/]+$/, ""),
      })
      child.unref()
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (await kitsuneAlive(base)) return
      }
      throw new Error("O servidor da Nyra não respondeu em 20 s")
    })().finally(() => {
      kitsuneStarting = null
    })
  }
  await kitsuneStarting
  return base
}

/** Synthesizes the whole text through the local Kitsune ONNX server. */
export async function synthesizeKitsune(
  text: string,
  tts: TtsSettings,
  signal?: AbortSignal,
): Promise<Buffer> {
  const clean = cleanForSpeech(text)
  if (!clean) throw new Error("Nothing to read aloud")
  const base = await ensureKitsuneServer(tts)
  const response = await fetch(`${base}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: clean,
      voice: tts.kitsuneVoice === "hana" ? "hana" : "nyra",
      speed: tts.rate || 1,
    }),
    signal,
  })
  if (!response.ok) {
    let detail = ""
    try {
      detail = (await response.text()).slice(0, 300)
    } catch {
      // body already consumed
    }
    throw new Error(`Nyra local falhou (${response.status}) ${detail}`)
  }
  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length) throw new Error("Nyra local devolveu áudio vazio")
  return audio
}

async function synthesizeOnce(clean: string, tts: TtsSettings, signal?: AbortSignal): Promise<Buffer> {
  const engine = new MsEdgeTTS()
  const abort = (): void => {
    try {
      engine.close()
    } catch {
      // already closed
    }
  }
  signal?.addEventListener("abort", abort, { once: true })

  try {
    await engine.setMetadata(tts.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = engine.toStream(clean, { rate: tts.rate })
    const chunks: Buffer[] = []
    for await (const chunk of audioStream) {
      if (signal?.aborted) throw new Error("Speech cancelled")
      if (chunk) chunks.push(Buffer.from(chunk as Uint8Array))
    }
    if (!chunks.length) throw new Error("Edge TTS returned no audio")
    return Buffer.concat(chunks)
  } finally {
    signal?.removeEventListener("abort", abort)
    engine.close()
  }
}
