import type { Plugin } from "@opencode/plugin"
import { normalizeSettings, type VoiceSettings } from "./settings"

type Ctx = Plugin.Context

const SETTINGS_KEY = "settings"

export async function loadSettings(ctx: Ctx): Promise<VoiceSettings> {
  const raw = await ctx.storage.get(SETTINGS_KEY)
  return normalizeSettings(raw)
}

export async function saveSettings(ctx: Ctx, settings: VoiceSettings): Promise<void> {
  await ctx.storage.set(SETTINGS_KEY, normalizeSettings(settings) as never)
}

interface MessageLite {
  id: string
  type?: string
  content?: readonly { type?: string; text?: string }[]
}

/** Newest assistant message that has readable text. */
export function lastAssistantText(messages: readonly MessageLite[]): { messageID: string; text: string } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.type !== "assistant") continue
    const parts = (message.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => (part.text ?? "").trim())
      .filter(Boolean)
    if (parts.length) return { messageID: message.id, text: parts.join("\n\n") }
  }
  return undefined
}
