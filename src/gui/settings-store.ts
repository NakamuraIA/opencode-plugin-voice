import { createSignal } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { getSettings as fetchSettings, setSettings as saveRpcSettings } from "./client"
import { DEFAULT_SETTINGS, normalizeSettings, type VoiceSettings } from "../settings"

// One settings store per window, shared by every contribution this plugin
// renders. The player keeps its own state in ./player.ts.

let host: Context | null = null

export function setHostContext(ctx: Context): void {
  host = ctx
}

export function hostContext(): Context {
  if (!host) throw new Error("Voice host context is not ready")
  return host
}

const [settings, setSettingsSignal] = createSignal<VoiceSettings>({
  stt: { ...DEFAULT_SETTINGS.stt },
  tts: { ...DEFAULT_SETTINGS.tts },
})

export function readSettings(): VoiceSettings {
  return settings()
}

export async function loadSettings(ctx: Context): Promise<void> {
  try {
    const loaded = await fetchSettings(ctx)
    setSettingsSignal(normalizeSettings(loaded))
  } catch {
    // keep defaults
  }
}

export async function saveSettings(ctx: Context, next: VoiceSettings): Promise<void> {
  const normalized = normalizeSettings(next)
  setSettingsSignal(normalized)
  try {
    await saveRpcSettings(ctx, normalized)
  } catch (error) {
    ctx.toast.show({
      title: `Could not save voice settings: ${error instanceof Error ? error.message : String(error)}`,
      variant: "error",
    })
  }
}
