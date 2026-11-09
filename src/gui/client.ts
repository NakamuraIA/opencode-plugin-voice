import type { Context } from "@opencode/plugin/gui"
import { Voice } from "../rpc"
import type { VoiceSettings } from "../settings"

// Typed wrappers around the RPC client. The contract is plain JSON Schema,
// so the raw client types every result as `unknown`; these give the GUI the
// shapes it actually consumes.

export interface VoiceEntry {
  shortName: string
  name: string
  gender: string
  locale: string
}

export interface ModelEntry {
  id: string
  name: string
  price?: string
}

export function getSettings(ctx: Context): Promise<VoiceSettings> {
  return ctx.client.rpc(Voice).getSettings({}) as Promise<VoiceSettings>
}

export function setSettings(ctx: Context, settings: VoiceSettings): Promise<unknown> {
  return ctx.client.rpc(Voice).setSettings(settings)
}

export function listVoices(ctx: Context): Promise<{ voices: VoiceEntry[] }> {
  return ctx.client.rpc(Voice).listVoices({}) as Promise<{ voices: VoiceEntry[] }>
}

export function listModels(ctx: Context, provider: string): Promise<{ models: ModelEntry[] }> {
  return ctx.client.rpc(Voice).listModels({ provider }) as Promise<{ models: ModelEntry[] }>
}

export function transcribe(ctx: Context, audioBase64: string, format: string): Promise<{ text: string }> {
  return ctx.client.rpc(Voice).transcribe({ audioBase64, format }) as Promise<{ text: string }>
}

export function speak(
  ctx: Context,
  text: string,
  signal?: AbortSignal,
): Promise<{ audioBase64: string; mimeType?: string }> {
  return ctx.client.rpc(Voice).speak({ text }, signal ? { signal } : undefined) as Promise<{
    audioBase64: string
    mimeType?: string
  }>
}

export function speakPrepare(ctx: Context, text: string): Promise<{ id: string; url: string }> {
  return ctx.client.rpc(Voice).speakPrepare({ text }) as Promise<{ id: string; url: string }>
}

export function speakCancel(ctx: Context, id: string): Promise<unknown> {
  return ctx.client.rpc(Voice).speakCancel({ id })
}

export function speakPlan(ctx: Context, text: string): Promise<{ chunks: string[] }> {
  return ctx.client.rpc(Voice).speakPlan({ text }) as Promise<{ chunks: string[] }>
}

export function speakChunk(ctx: Context, text: string, signal?: AbortSignal): Promise<{ audioBase64: string; mimeType: string }> {
  return ctx.client.rpc(Voice).speakChunk({ text }, signal ? { signal } : undefined) as Promise<{
    audioBase64: string
    mimeType: string
  }>
}

export function debugLog(ctx: Context, message: string): Promise<unknown> {
  return ctx.client.rpc(Voice).debugLog({ message })
}

export function lastAssistantText(ctx: Context, sessionID: string): Promise<{ messageID: string; text: string }> {
  return ctx.client.rpc(Voice).lastAssistantText({ sessionID }) as Promise<{ messageID: string; text: string }>
}
