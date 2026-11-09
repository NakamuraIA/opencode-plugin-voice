import { Plugin } from "@opencode/plugin"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { appendFileSync } from "node:fs"
import { Voice } from "./rpc"
import { loadSettings, saveSettings, lastAssistantText } from "./service"
import { transcribeAudio, listOpenRouterModels, listLocalModels, GROQ_MODELS } from "./stt"
import { listVoices, synthesize, splitForSpeech, streamSpeech, ttsMimeType } from "./tts"
import { normalizeSettings, maskKey, isMaskedKey, type TtsSettings, type VoiceSettings } from "./settings"

// Server part: storage-backed settings, the RPC implementations, and the
// session lookup used by the GUI to read a reply aloud. All audio work
// (network, Edge TTS) happens here; the window only records and plays.

// Saved API keys live in plugin storage (typed into the settings page).
// Resolution order: storage -> environment -> plugin options.

// Small LRU of synthesized chunks: repeating a reply is instant, and the GUI
// asks for the same sentence again when the user replays from the start.
const CHUNK_CACHE_BYTES = 24 * 1024 * 1024
const chunkCache = new Map<string, Buffer>()
let chunkCacheBytes = 0

function cacheGet(key: string): Buffer | undefined {
  const hit = chunkCache.get(key)
  if (!hit) return undefined
  chunkCache.delete(key)
  chunkCache.set(key, hit)
  return hit
}

function cacheSet(key: string, audio: Buffer): void {
  if (chunkCache.has(key)) return
  chunkCache.set(key, audio)
  chunkCacheBytes += audio.length
  while (chunkCacheBytes > CHUNK_CACHE_BYTES) {
    const oldest = chunkCache.keys().next().value as string | undefined
    if (!oldest) break
    const removed = chunkCache.get(oldest)
    chunkCache.delete(oldest)
    chunkCacheBytes -= removed?.length ?? 0
  }
}

export default Plugin.define({
  id: "nakamura-voice",
  async setup(ctx) {
    const option = (name: string): string => {
      const value = ctx.options[name]
      return typeof value === "string" ? value : ""
    }

    const effectiveKey = async (settings: VoiceSettings, provider: "openrouter" | "groq"): Promise<string> => {
      const field = provider === "openrouter" ? settings.stt.openrouterApiKey : settings.stt.groqApiKey
      if (field) return field
      const env = provider === "openrouter" ? "OPENROUTER_API_KEY" : "GROQ_API_KEY"
      return process.env[env] || option(`${provider}ApiKey`)
    }

    const forGui = async (settings: VoiceSettings): Promise<VoiceSettings> => {
      const [openrouterKey, groqKey] = await Promise.all([
        effectiveKey(settings, "openrouter"),
        effectiveKey(settings, "groq"),
      ])
      return {
        ...settings,
        stt: {
          ...settings.stt,
          openrouterApiKey: maskKey(openrouterKey),
          groqApiKey: maskKey(groqKey),
          hasOpenrouterKey: Boolean(openrouterKey),
          hasGroqKey: Boolean(groqKey),
        },
      }
    }

    // The GUI plays ONE continuous MP3 streamed from a single Edge TTS
    // request. A tiny loopback HTTP server serves that stream so the browser
    // can start playing as soon as the first bytes arrive, without seams.
    interface SpeechStream {
      text: string
      settings: TtsSettings
      abort: AbortController
      started: boolean
      timer: ReturnType<typeof setTimeout>
    }
    const streams = new Map<string, SpeechStream>()
    const token = randomUUID()
    let port = 0

    const server = createServer((request, response) => {
      void (async () => {
        try {
          const url = new URL(request.url ?? "/", "http://127.0.0.1")
          if (url.pathname !== "/voice") {
            response.writeHead(404)
            response.end()
            return
          }
          if (url.searchParams.get("token") !== token) {
            response.writeHead(403)
            response.end()
            return
          }
          const id = url.searchParams.get("id") ?? ""
          const entry = streams.get(id)
          if (!entry || entry.started) {
            response.writeHead(404)
            response.end()
            return
          }
          entry.started = true
          clearTimeout(entry.timer)
          response.writeHead(200, {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          })
          let closed = false
          request.on("close", () => {
            closed = true
            entry.abort.abort()
          })
          try {
            await streamSpeech(
              entry.text,
              entry.settings,
              (chunk) => {
                if (!closed) response.write(chunk)
              },
              entry.abort.signal,
            )
            if (!closed) response.end()
          } catch {
            if (!closed) response.destroy()
          } finally {
            streams.delete(id)
          }
        } catch {
          try {
            response.destroy()
          } catch {
            // already gone
          }
        }
      })()
    })

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", () => resolve())
      })
      const address = server.address()
      port = typeof address === "object" && address ? address.port : 0
    } catch {
      port = 0
    }

    await ctx.rpc.register(Voice, {
      getSettings: async () => forGui(await loadSettings(ctx)),

      setSettings: async (input) => {
        const incoming = normalizeSettings(input)
        const current = await loadSettings(ctx)
        // A masked value is the untouched "saved" marker: keep the stored key.
        // An empty string clears it; anything else replaces it.
        const openrouterApiKey = isMaskedKey(incoming.stt.openrouterApiKey)
          ? current.stt.openrouterApiKey
          : incoming.stt.openrouterApiKey
        const groqApiKey = isMaskedKey(incoming.stt.groqApiKey)
          ? current.stt.groqApiKey
          : incoming.stt.groqApiKey
        await saveSettings(ctx, {
          ...incoming,
          stt: { ...incoming.stt, openrouterApiKey, groqApiKey },
        })
        return {}
      },

      listVoices: async () => ({ voices: await listVoices() }),

      listModels: async (input) => {
        const provider = (input as { provider?: string }).provider ?? "openrouter"
        if (provider === "groq") return { models: GROQ_MODELS }
        if (provider === "local") {
          const settings = await loadSettings(ctx)
          return { models: await listLocalModels(settings.stt.localBaseUrl) }
        }
        return { models: await listOpenRouterModels() }
      },

      transcribe: async (input, call) => {
        const { audioBase64 } = input as { audioBase64: string }
        const settings = await loadSettings(ctx)
        try {
          const key =
            settings.stt.provider === "local"
              ? ""
              : await effectiveKey(settings, settings.stt.provider)
          const text = await transcribeAudio(Buffer.from(audioBase64, "base64"), settings.stt, key)
          return { text }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return call.error("provider_error", message, { message })
        }
      },

      speak: async (input, call) => {
        const { text } = input as { text: string }
        const settings = await loadSettings(ctx)
        try {
          const audio = await synthesize(text, settings.tts, call.signal)
          return {
            audioBase64: audio.toString("base64"),
            voice: settings.tts.voice,
            mimeType: ttsMimeType(settings.tts),
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return call.error("provider_error", message, { message })
        }
      },

      speakPlan: async (input, call) => {
        const { text } = input as { text: string }
        try {
          const chunks = splitForSpeech(text)
          if (!chunks.length) throw new Error("Nothing to read aloud")
          return { chunks }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return call.error("provider_error", message, { message })
        }
      },

      speakChunk: async (input, call) => {
        const { text } = input as { text: string }
        const settings = await loadSettings(ctx)
        const key = `${settings.tts.engine}|${settings.tts.voice}|${settings.tts.kitsuneVoice}|${settings.tts.rate}|${text}`
        const cached = cacheGet(key)
        const mimeType = ttsMimeType(settings.tts)
        if (cached) return { audioBase64: cached.toString("base64"), mimeType }
        try {
          const audio = await synthesize(text, settings.tts, call.signal)
          cacheSet(key, audio)
          return { audioBase64: audio.toString("base64"), mimeType }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return call.error("provider_error", message, { message })
        }
      },

      speakPrepare: async (input, call) => {
        const { text } = input as { text: string }
        if (!port) {
          const message = "The local audio stream server could not start; falling back to a buffered file"
          return call.error("provider_error", message, { message })
        }
        const settings = await loadSettings(ctx)
        const id = randomUUID()
        const entry: SpeechStream = {
          text,
          settings: settings.tts,
          abort: new AbortController(),
          started: false,
          timer: setTimeout(() => {
            streams.delete(id)
            entry.abort.abort()
          }, 60_000),
        }
        streams.set(id, entry)
        return { id, url: `http://127.0.0.1:${port}/voice?id=${id}&token=${token}` }
      },

      speakCancel: async (input) => {
        const { id } = input as { id: string }
        const entry = streams.get(id)
        if (entry) {
          clearTimeout(entry.timer)
          entry.abort.abort()
          streams.delete(id)
        }
        return {}
      },

      lastAssistantText: async (input, call) => {
        const { sessionID } = input as { sessionID: string }
        try {
          const messages = await ctx.session.context({ sessionID })
          const found = lastAssistantText(messages)
          if (!found) return call.error("not_found", "No assistant message yet", { sessionID })
          return found
        } catch {
          return call.error("not_found", "No assistant message yet", { sessionID })
        }
      },

      debugLog: async (input) => {
        try {
          const { message } = input as { message: string }
          appendFileSync(
            "E:/Kitsune-TTS-resume/_plugin_debug.log",
            `${new Date().toISOString()} ${message}\n`,
            "utf8",
          )
        } catch {
          // logging must never break audio
        }
        return { ok: true }
      },
    })

    return () => {
      server.close()
      for (const entry of streams.values()) {
        clearTimeout(entry.timer)
        entry.abort.abort()
      }
      streams.clear()
    }
  },
})
