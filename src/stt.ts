import type { SttSettings } from "./settings"

// Speech-to-text through three providers:
// - OpenRouter: JSON body with base64 audio (`input_audio`)
// - Groq: OpenAI-compatible multipart, `prompt` works as-is
// - Local: any OpenAI-compatible server (faster-whisper-server, whisper.cpp…)

export class SttError extends Error {}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/audio/transcriptions"
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

function toError(status: number, body: string): SttError {
  let message = body.slice(0, 400)
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const nested = parsed.error as Record<string, unknown> | undefined
    if (typeof nested?.message === "string") message = nested.message
    else if (typeof parsed.message === "string") message = parsed.message
  } catch {
    // keep the raw body
  }
  return new SttError(`STT request failed (${status}): ${message}`)
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ""
  }
}

export async function transcribeAudio(audio: Buffer, stt: SttSettings, apiKey: string): Promise<string> {
  if (!apiKey && stt.provider !== "local") {
    const env = stt.provider === "openrouter" ? "OPENROUTER_API_KEY" : "GROQ_API_KEY"
    throw new SttError(
      `${stt.provider} API key is missing. Set the ${env} environment variable, or pass ${stt.provider}ApiKey as a plugin option.`,
    )
  }

  switch (stt.provider) {
    case "openrouter":
      return transcribeOpenRouter(audio, stt, apiKey)
    case "groq":
      return transcribeMultipart(audio, stt, GROQ_URL, apiKey)
    case "local": {
      const base = stt.localBaseUrl.trim().replace(/\/+$/, "") || "http://localhost:8000"
      return transcribeMultipart(audio, stt, `${base}/v1/audio/transcriptions`, stt.localApiKey)
    }
  }
}

// OpenRouter normalizes the request shape for every STT model (Whisper,
// Voxtral, Nova, Scribe, Parakeet, Qwen ASR, MAI-Transcribe, …): same endpoint,
// same body, `input_audio: { data, format }`, response `{ text }`. The `prompt`
// hint only reaches Whisper models and has to ride in
// `provider.options.groq.prompt` (the multipart `prompt` field is ignored).
async function transcribeOpenRouter(audio: Buffer, stt: SttSettings, apiKey: string): Promise<string> {
  const body: Record<string, unknown> = {
    model: stt.openrouterModel,
    input_audio: { data: audio.toString("base64"), format: "wav" },
  }
  const language = stt.language.trim()
  if (language) body.language = language
  if (stt.temperature > 0) body.temperature = stt.temperature
  const prompt = stt.prompt.trim()
  if (prompt) body.provider = { options: { groq: { prompt } } }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Title": "opencode-plugin-voice",
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw toError(response.status, await readBody(response))
  const json = (await response.json()) as { text?: string }
  return (json.text ?? "").trim()
}

// One OpenAI-compatible form is enough for Groq and every local server.
async function transcribeMultipart(audio: Buffer, stt: SttSettings, url: string, apiKey: string): Promise<string> {
  const form = new FormData()
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "audio.wav")
  form.append("model", stt.provider === "groq" ? stt.groqModel : stt.localModel)
  const language = stt.language.trim()
  if (language) form.append("language", language)
  if (stt.temperature > 0) form.append("temperature", String(stt.temperature))
  const prompt = stt.prompt.trim()
  if (prompt) form.append("prompt", prompt)

  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetch(url, { method: "POST", headers, body: form })
  if (!response.ok) throw toError(response.status, await readBody(response))
  const json = (await response.json()) as { text?: string }
  return (json.text ?? "").trim()
}

export interface SttModelInfo {
  id: string
  name: string
  price?: string
}

// Groq has no public model list endpoint; these are the two Whisper models it
// documents for speech-to-text.
export const GROQ_MODELS: SttModelInfo[] = [
  { id: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo (fast)", price: "$0.04/hour" },
  { id: "whisper-large-v3", name: "Whisper Large V3 (accurate)", price: "$0.111/hour" },
]

export async function listOpenRouterModels(): Promise<SttModelInfo[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=transcription")
    if (!response.ok) return []
    const json = (await response.json()) as { data?: Array<Record<string, unknown>> }
    return (json.data ?? []).flatMap((model) => {
      const id = typeof model.id === "string" ? model.id : ""
      if (!id) return []
      const name = typeof model.name === "string" && model.name ? model.name : id
      const pricing = model.pricing as Record<string, string> | undefined
      const perSecond = pricing?.prompt && pricing.prompt !== "0" ? Number(pricing.prompt) : Number.NaN
      const price = Number.isFinite(perSecond) ? `$${perSecond.toFixed(6)}/second` : undefined
      return [{ id, name, price }]
    })
  } catch {
    return []
  }
}

export async function listLocalModels(baseUrl: string): Promise<SttModelInfo[]> {
  try {
    const base = baseUrl.trim().replace(/\/+$/, "")
    if (!base) return []
    const response = await fetch(`${base}/v1/models`)
    if (!response.ok) return []
    const json = (await response.json()) as { data?: Array<Record<string, unknown>> }
    return (json.data ?? []).flatMap((model) => {
      const id = typeof model.id === "string" ? model.id : ""
      return id ? [{ id, name: id }] : []
    })
  } catch {
    return []
  }
}
