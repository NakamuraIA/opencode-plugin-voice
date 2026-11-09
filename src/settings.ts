// Shared settings shape. No imports: this module is bundled into both the
// server part and the GUI, so it must stay free of runtime dependencies.

export type SttProvider = "openrouter" | "groq" | "local"

export type TtsEngine = "system" | "edge" | "kitsune" | "openai"

export interface SttSettings {
  provider: SttProvider
  openrouterModel: string
  groqModel: string
  localBaseUrl: string
  localModel: string
  localApiKey: string
  /** API keys saved from the settings page (plain text in plugin storage). */
  openrouterApiKey: string
  groqApiKey: string
  /** Derived on read: whether an effective key exists (any source). */
  hasOpenrouterKey: boolean
  hasGroqKey: boolean
  language: string
  prompt: string
  temperature: number
}

export interface TtsSettings {
  engine: TtsEngine
  voice: string
  rate: number
  autoSpeak: boolean
  /** Base URL of the local Kitsune (Nyra/Hana) server. */
  kitsuneUrl: string
  /** Which trained voice the local server should use. */
  kitsuneVoice: "nyra" | "hana"
  /** Path to kitsune_tts_server.py, used to start it on demand. */
  kitsuneScript: string
  /** VoiceBox / OpenAI-compatible gateway. */
  apiUrl: string
  apiModel: string
  apiVoice: string
  apiInstructions: string
}

export interface VoiceSettings {
  stt: SttSettings
  tts: TtsSettings
}

export const DEFAULT_SETTINGS: VoiceSettings = {
  stt: {
    provider: "openrouter",
    openrouterModel: "openai/whisper-large-v3-turbo",
    groqModel: "whisper-large-v3-turbo",
    localBaseUrl: "http://localhost:8000",
    localModel: "faster-whisper-large-v3-turbo",
    localApiKey: "",
    openrouterApiKey: "",
    groqApiKey: "",
    hasOpenrouterKey: false,
    hasGroqKey: false,
    language: "pt",
    prompt: "",
    temperature: 0,
  },
  tts: {
    engine: "edge",
    voice: "pt-BR-FranciscaNeural",
    rate: 1,
    autoSpeak: false,
    kitsuneUrl: "http://127.0.0.1:8091",
    kitsuneVoice: "nyra",
    kitsuneScript: "",
    apiUrl: "http://127.0.0.1:8095",
    apiModel: "kitsune",
    apiVoice: "nyra",
    apiInstructions: "",
  },
}

const MASK = "••••"

/** A key as the GUI sees it: dots plus the last 4 characters. */
export function maskKey(key: string): string {
  return key ? `${MASK}${key.slice(-4)}` : ""
}

/** True when a submitted value is the untouched masked key from getSettings. */
export function isMaskedKey(value: string): boolean {
  return value.startsWith(MASK)
}

/**
 * Merges arbitrary (possibly partial or stale) stored data onto the defaults.
 * Keys-only copies: unknown fields and derived flags never reach storage.
 */
export function normalizeSettings(value: unknown): VoiceSettings {
  const fallback = (): VoiceSettings => ({ stt: { ...DEFAULT_SETTINGS.stt }, tts: { ...DEFAULT_SETTINGS.tts } })
  if (!value || typeof value !== "object") return fallback()
  const raw = value as Partial<VoiceSettings>
  const stt = (raw.stt ?? {}) as Partial<SttSettings>
  const tts = (raw.tts ?? {}) as Partial<TtsSettings>
  const pick = <T>(field: keyof SttSettings, def: T): T => (stt[field] as T | undefined) ?? def
  return {
    stt: {
      provider: pick("provider", DEFAULT_SETTINGS.stt.provider),
      openrouterModel: pick("openrouterModel", DEFAULT_SETTINGS.stt.openrouterModel),
      groqModel: pick("groqModel", DEFAULT_SETTINGS.stt.groqModel),
      localBaseUrl: pick("localBaseUrl", DEFAULT_SETTINGS.stt.localBaseUrl),
      localModel: pick("localModel", DEFAULT_SETTINGS.stt.localModel),
      localApiKey: pick("localApiKey", ""),
      openrouterApiKey: pick("openrouterApiKey", ""),
      groqApiKey: pick("groqApiKey", ""),
      hasOpenrouterKey: false,
      hasGroqKey: false,
      language: pick("language", DEFAULT_SETTINGS.stt.language),
      prompt: pick("prompt", ""),
      temperature: pick("temperature", 0),
    },
    tts: {
      engine: (tts.engine ?? DEFAULT_SETTINGS.tts.engine) as TtsEngine,
      voice: tts.voice ?? DEFAULT_SETTINGS.tts.voice,
      rate: tts.rate ?? DEFAULT_SETTINGS.tts.rate,
      autoSpeak: tts.autoSpeak ?? DEFAULT_SETTINGS.tts.autoSpeak,
      kitsuneUrl: tts.kitsuneUrl ?? DEFAULT_SETTINGS.tts.kitsuneUrl,
      kitsuneVoice: (tts.kitsuneVoice ?? DEFAULT_SETTINGS.tts.kitsuneVoice) as "nyra" | "hana",
      kitsuneScript: tts.kitsuneScript ?? DEFAULT_SETTINGS.tts.kitsuneScript,
      apiUrl: tts.apiUrl ?? DEFAULT_SETTINGS.tts.apiUrl,
      apiModel: tts.apiModel ?? DEFAULT_SETTINGS.tts.apiModel,
      apiVoice: tts.apiVoice ?? DEFAULT_SETTINGS.tts.apiVoice,
      apiInstructions: tts.apiInstructions ?? DEFAULT_SETTINGS.tts.apiInstructions,
    },
  }
}
