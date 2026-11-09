import { Show, createEffect, createSignal, onMount, onCleanup } from "solid-js"
import { usePlugin, type Context } from "@opencode/plugin/gui"
import { listModels as fetchModels, listVoices as fetchVoices, speak as speakRpc } from "./client"
import { fromBase64 } from "./recorder"
import { MicLevelTest } from "./mic-test"
import { loadSettings, readSettings, saveSettings } from "./settings-store"
import type { SttProvider, VoiceSettings } from "../settings"

interface ModelInfo {
  id: string
  name: string
  price?: string
}

interface VoiceInfo {
  shortName: string
  name: string
  gender: string
  locale: string
}

const providerOptions = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "groq", label: "Groq" },
  { value: "local", label: "Local server" },
]

const languageOptions = [
  { value: "", label: "Auto-detect" },
  { value: "pt", label: "Português" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "nl", label: "Nederlands" },
  { value: "ru", label: "Русский" },
]

const temperatureOptions = [
  { value: "0", label: "0 (model default)" },
  { value: "0.2", label: "0.2" },
  { value: "0.5", label: "0.5" },
  { value: "1", label: "1" },
]

const rateOptions = [
  { value: "0.5", label: "0.5× (slow)" },
  { value: "0.75", label: "0.75×" },
  { value: "1", label: "1× (normal)" },
  { value: "1.25", label: "1.25×" },
  { value: "1.5", label: "1.5×" },
  { value: "2", label: "2× (fast)" },
]

const engineOptions = [
  { value: "system", label: "System voice (instant, offline)" },
  { value: "edge", label: "Edge neural (natural, online)" },
  { value: "kitsune", label: "Kitsune — Nyra/Hana (local ONNX)" },
  { value: "openai", label: "OpenAI-compatible (VoiceBox)" },
]

const kitsuneVoiceOptions = [
  { value: "nyra", label: "Nyra" },
  { value: "hana", label: "Hana" },
]

export function VoiceSettingsPage() {
  const ctx = usePlugin()
  const ui = ctx.ui
  const [models, setModels] = createSignal<ModelInfo[]>([])
  const [voices, setVoices] = createSignal<VoiceInfo[]>([])
  const [loading, setLoading] = createSignal(false)
  const [playingSample, setPlayingSample] = createSignal(false)
  const [micLevel, setMicLevel] = createSignal(0)
  const [micActive, setMicActive] = createSignal(false)
  const [micError, setMicError] = createSignal("")

  const micTest = new MicLevelTest((level) => setMicLevel(level))

  onMount(() => {
    void loadSettings(ctx)
  })

  onCleanup(() => {
    micTest.stop()
  })

  async function toggleMicTest(): Promise<void> {
    if (micActive()) {
      micTest.stop()
      setMicActive(false)
      return
    }
    setMicError("")
    try {
      await micTest.start()
      setMicActive(true)
    } catch (error) {
      setMicError(error instanceof Error ? error.message : String(error))
    }
  }

  let refreshToken = 0
  async function refresh(): Promise<void> {
    const token = ++refreshToken
    setLoading(true)
    try {
      const [modelResult, voiceResult] = await Promise.all([
        fetchModels(ctx, readSettings().stt.provider),
        fetchVoices(ctx),
      ])
      if (token !== refreshToken) return
      setModels(modelResult.models)
      setVoices(voiceResult.voices)
    } catch {
      // empty lists; the selects still accept the saved values
    } finally {
      if (token === refreshToken) setLoading(false)
    }
  }

  let lastProvider: string | null = null
  createEffect(() => {
    const provider = readSettings().stt.provider
    if (provider !== lastProvider) {
      lastProvider = provider
      void refresh()
    }
  })

  const s = () => readSettings().stt
  const t = () => readSettings().tts

  const patchStt = (patch: Partial<VoiceSettings["stt"]>) =>
    void saveSettings(ctx, { ...readSettings(), stt: { ...s(), ...patch } })
  const patchTts = (patch: Partial<VoiceSettings["tts"]>) =>
    void saveSettings(ctx, { ...readSettings(), tts: { ...t(), ...patch } })

  const modelValue = () => {
    const current = s()
    if (current.provider === "openrouter") return current.openrouterModel
    if (current.provider === "groq") return current.groqModel
    return current.localModel
  }

  const setModel = (value: string) => {
    const current = s()
    if (current.provider === "openrouter") patchStt({ openrouterModel: value })
    else if (current.provider === "groq") patchStt({ groqModel: value })
    else patchStt({ localModel: value })
  }

  const withCurrent = (list: { value: string; label: string }[], current: string) => {
    if (current && !list.some((option) => option.value === current)) {
      list.unshift({ value: current, label: current })
    }
    return list
  }

  const modelOptions = () =>
    withCurrent(
      models().map((model) => ({
        value: model.id,
        label: model.price ? `${model.id} · ${model.price}` : model.id,
      })),
      modelValue(),
    )

  const voiceOptions = () =>
    withCurrent(
      voices().map((voice) => ({
        value: voice.shortName,
        label: voice.shortName,
      })),
      t().voice,
    )

  async function playSample(): Promise<void> {
    if (playingSample()) return
    setPlayingSample(true)
    const sample = "Olá! A leitura em voz alta está funcionando."
    if (t().engine === "system") {
      try {
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(sample)
        utter.lang = "pt-BR"
        utter.rate = Math.min(2, Math.max(0.5, t().rate))
        window.speechSynthesis.speak(utter)
      } catch (error) {
        ctx.toast.show({
          title: `TTS error: ${error instanceof Error ? error.message : String(error)}`,
          variant: "error",
        })
      } finally {
        setPlayingSample(false)
      }
      return
    }
    try {
      const result = await speakRpc(ctx, sample)
      const bytes = fromBase64(result.audioBase64)
      const url = URL.createObjectURL(new Blob([bytes], { type: result.mimeType || "audio/mpeg" }))
      const audio = new Audio(url)
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true })
      await audio.play()
    } catch (error) {
      ctx.toast.show({
        title: `TTS error: ${error instanceof Error ? error.message : String(error)}`,
        variant: "error",
      })
    } finally {
      setPlayingSample(false)
    }
  }

  return (
    <ui.SettingsLayout title={ctx.t("settings.title")} description={ctx.t("settings.description")}>
      <ui.SettingsSection title="Speech to Text (dictation)">
        <ui.SettingsRow title="Provider" description="Where audio is transcribed.">
          <div class="nakamura-voice-control">
            <ui.Select
              options={providerOptions}
              value={s().provider}
              onChange={(value) => patchStt({ provider: value as SttProvider })}
              label="STT provider"
            />
          </div>
        </ui.SettingsRow>
        <ui.SettingsRow title="Model" description="Exact model id, or pick from the list.">
          <div class="nakamura-voice-stack">
            <ui.TextInput value={modelValue()} onInput={setModel} label="STT model" />
            <ui.Select
              options={modelOptions()}
              value={modelValue()}
              onChange={setModel}
              label="Model list"
              disabled={loading()}
            />
          </div>
        </ui.SettingsRow>
        <ui.SettingsRow title="Language" description="ISO 639-1 code, or auto-detect.">
          <div class="nakamura-voice-control">
            <ui.Select
              options={languageOptions}
              value={s().language}
              onChange={(value) => patchStt({ language: value })}
              label="Language"
            />
          </div>
        </ui.SettingsRow>
        <ui.SettingsRow title="Prompt" description="Optional vocabulary and context hint for the model.">
          <ui.TextInput
            value={s().prompt}
            onInput={(value) => patchStt({ prompt: value })}
            label="Prompt"
            placeholder="e.g. technical terms: SolidJS, opencode"
          />
        </ui.SettingsRow>
        <ui.SettingsRow title="Temperature" description="Lower is more deterministic.">
          <div class="nakamura-voice-control">
            <ui.Select
              options={temperatureOptions}
              value={String(s().temperature)}
              onChange={(value) => patchStt({ temperature: Number(value) })}
              label="Temperature"
            />
          </div>
        </ui.SettingsRow>
        <Show when={s().provider === "local"}>
          <ui.SettingsRow
            title="Local server URL"
            description="OpenAI-compatible endpoint, e.g. http://localhost:8000 (faster-whisper-server, whisper.cpp)."
          >
            <ui.TextInput
              value={s().localBaseUrl}
              onInput={(value) => patchStt({ localBaseUrl: value })}
              label="Local base URL"
            />
          </ui.SettingsRow>
          <ui.SettingsRow title="Local API key" description="Optional for local servers.">
            <ui.TextInput
              type="password"
              value={s().localApiKey}
              onInput={(value) => patchStt({ localApiKey: value })}
              label="Local API key"
              placeholder="Optional"
            />
          </ui.SettingsRow>
        </Show>
        <ui.SettingsRow title="OpenRouter API key" description={s().hasOpenrouterKey ? "Saved. Type a new key to replace it, or clear the field to remove." : "Saved in this plugin only. Or set OPENROUTER_API_KEY in the environment."}>
          <div class="nakamura-voice-row">
            <ui.TextInput
              type="password"
              value={s().openrouterApiKey}
              onInput={(value) => patchStt({ openrouterApiKey: value })}
              label="OpenRouter API key"
              placeholder="sk-or-v1-…"
            />
            <Show when={s().hasOpenrouterKey}>
              <ui.Button onClick={() => patchStt({ openrouterApiKey: "" })}>Remove</ui.Button>
            </Show>
          </div>
        </ui.SettingsRow>
        <ui.SettingsRow title="Groq API key" description={s().hasGroqKey ? "Saved. Type a new key to replace it, or clear the field to remove." : "Saved in this plugin only. Or set GROQ_API_KEY in the environment."}>
          <div class="nakamura-voice-row">
            <ui.TextInput
              type="password"
              value={s().groqApiKey}
              onInput={(value) => patchStt({ groqApiKey: value })}
              label="Groq API key"
              placeholder="gsk_…"
            />
            <Show when={s().hasGroqKey}>
              <ui.Button onClick={() => patchStt({ groqApiKey: "" })}>Remove</ui.Button>
            </Show>
          </div>
        </ui.SettingsRow>
        <ui.SettingsRow title="Microphone" description="Check the input level before dictating.">
          <div class="nakamura-voice-row">
            <div class="nakamura-voice-meter" aria-hidden="true">
              <div class="nakamura-voice-meter-fill" style={{ width: `${Math.min(100, Math.round(micLevel() * 400))}%` }} />
            </div>
            <ui.Button onClick={() => void toggleMicTest()}>
              {micActive() ? "Stop test" : "Test microphone"}
            </ui.Button>
          </div>
        </ui.SettingsRow>
        <Show when={micError() !== ""}>
          <ui.SettingsRow title="" description={micError()}>
          </ui.SettingsRow>
        </Show>
      </ui.SettingsSection>

      <ui.SettingsSection title="Text to Speech">
        <ui.SettingsRow
          title="Engine"
          description="System uses the installed Windows voice: instant, offline and continuous. Edge is more natural but slower to prepare."
        >
          <ui.Select
            options={engineOptions}
            value={t().engine}
            onChange={(value) => patchTts({ engine: value as "system" | "edge" | "kitsune" })}
            label="TTS engine"
          />
        </ui.SettingsRow>
        <Show when={t().engine === "edge"}>
          <ui.SettingsRow title="Voice" description="Free Edge neural voice.">
            <div class="nakamura-voice-control">
              <ui.Select options={voiceOptions()} value={t().voice} onChange={(value) => patchTts({ voice: value })} label="Voice" disabled={loading()} />
            </div>
          </ui.SettingsRow>
        </Show>
        <Show when={t().engine === "kitsune"}>
          <ui.SettingsRow title="Voice" description="Nyra or Hana, from your trained Kitsune checkpoint.">
            <div class="nakamura-voice-control">
              <ui.Select
                options={kitsuneVoiceOptions}
                value={t().kitsuneVoice}
                onChange={(value) => patchTts({ kitsuneVoice: value as "nyra" | "hana" })}
                label="Kitsune voice"
              />
            </div>
          </ui.SettingsRow>
          <ui.SettingsRow title="Local server" description="URL of the local ONNX server (starts automatically when needed).">
            <div class="nakamura-voice-stack">
              <ui.TextInput value={t().kitsuneUrl} onInput={(value) => patchTts({ kitsuneUrl: value })} label="Kitsune server URL" />
              <ui.TextInput value={t().kitsuneScript} onInput={(value) => patchTts({ kitsuneScript: value })} label="Server script path" />
            </div>
          </ui.SettingsRow>
        </Show>
        <Show when={t().engine === "openai"}>
          <ui.SettingsRow title="Gateway URL" description="VoiceBox or any OpenAI-compatible /v1/audio/speech server.">
            <div class="nakamura-voice-control">
              <ui.TextInput value={t().apiUrl} onInput={(value) => patchTts({ apiUrl: value })} label="Gateway URL" />
            </div>
          </ui.SettingsRow>
          <ui.SettingsRow title="Model / voice" description="Engine id (kitsune, lfm3, supertonic) and the voice id.">
            <div class="nakamura-voice-stack">
              <ui.TextInput value={t().apiModel} onInput={(value) => patchTts({ apiModel: value })} label="Engine id" />
              <ui.TextInput value={t().apiVoice} onInput={(value) => patchTts({ apiVoice: value })} label="Voice id" />
            </div>
          </ui.SettingsRow>
          <ui.SettingsRow title="Instructions" description="Optional style/emotion hint sent to engines that support it.">
            <div class="nakamura-voice-control">
              <ui.TextInput value={t().apiInstructions} onInput={(value) => patchTts({ apiInstructions: value })} label="Instructions" />
            </div>
          </ui.SettingsRow>
        </Show>
        <ui.SettingsRow title="Speech rate">
          <div class="nakamura-voice-control">
            <ui.Select
              options={rateOptions}
              value={String(t().rate)}
              onChange={(value) => patchTts({ rate: Number(value) })}
              label="Speech rate"
            />
          </div>
        </ui.SettingsRow>
        <ui.SettingsRow title="Auto read-aloud" description="Read each assistant reply aloud when it finishes.">
          <ui.Switch checked={t().autoSpeak} onChange={(value) => patchTts({ autoSpeak: value })} label="Auto read-aloud" hideLabel />
        </ui.SettingsRow>
        <ui.SettingsRow title="Test" description="Listen to a short sample in the current voice.">
          <ui.Button onClick={() => void playSample()} busy={playingSample()}>
            Play sample
          </ui.Button>
        </ui.SettingsRow>
      </ui.SettingsSection>
    </ui.SettingsLayout>
  )
}
