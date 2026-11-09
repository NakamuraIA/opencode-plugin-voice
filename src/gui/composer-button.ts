import { createSignal } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { transcribe as transcribeRpc } from "./client"
import { Recorder, toBase64 } from "./recorder"

// The microphone button that lives inside the app's composer (like the
// Codex one), plus the floating recording overlay anchored to the composer.
// The app has no public "add a button to the composer" API, so this is a
// small DOM injection: it appends one button to the existing
// `[data-slot="composer-actions"]` row and watches for re-renders with a
// MutationObserver. If the layout ever changes, the ComposerPill fallback in
// gui.tsx takes over instead.

const ACTIONS_SELECTOR = '[data-slot="composer-actions"]'
const BUTTON_CLASS = "nakamura-voice-mic"
const OVERLAY_CLASS = "nakamura-voice-overlay"

const MIC = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`
const STOP = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`

const [ready, setReady] = createSignal(false)

/** True once the mic button is sitting inside a composer. */
export function composerReady(): boolean {
  return ready()
}

interface DictationState {
  recorder: Recorder | null
  overlay: HTMLElement | null
  anchor: HTMLElement | null
  timer: number | null
  startedAt: number
}

const state: DictationState = {
  recorder: null,
  overlay: null,
  anchor: null,
  timer: null,
  startedAt: 0,
}

let starting = false
let finishing = false
const levels: number[] = []

function isRecording(): boolean {
  return state.recorder?.recording ?? false
}

function updateMicButtons(): void {
  const recording = isRecording()
  document.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}`).forEach((button) => {
    button.classList.toggle("recording", recording)
    button.innerHTML = recording ? STOP : MIC
    button.title = recording ? "Stop and transcribe" : "Dictate"
  })
}

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
}

function startTimer(): void {
  stopTimer()
  state.timer = window.setInterval(() => {
    const label = state.overlay?.querySelector(".nakamura-voice-time") as HTMLElement | null
    if (label) label.textContent = formatElapsed((performance.now() - state.startedAt) / 1000)
  }, 250)
}

function stopTimer(): void {
  if (state.timer !== null) {
    window.clearInterval(state.timer)
    state.timer = null
  }
}

function setLive(on: boolean): void {
  const status = state.overlay?.querySelector(".nakamura-voice-status")
  status?.classList.toggle("nakamura-voice-status-live", on)
}

function setBusy(): void {
  const status = state.overlay?.querySelector(".nakamura-voice-status")
  if (!status) return
  status.classList.remove("nakamura-voice-status-live")
  status.classList.add("nakamura-voice-status-busy")
}

function drawWave(level: number): void {
  levels.push(level)
  if (levels.length > 90) levels.shift()
  const canvas = state.overlay?.querySelector("canvas") as HTMLCanvasElement | null
  if (!canvas) return
  const context = canvas.getContext("2d")
  if (!context) return
  const dpr = window.devicePixelRatio || 1
  const cssWidth = canvas.clientWidth || 640
  const cssHeight = canvas.clientHeight || 36
  if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(cssHeight * dpr)
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, cssWidth, cssHeight)
  const barWidth = 5
  const gap = 2
  const count = Math.floor(cssWidth / (barWidth + gap))
  let previous = 0
  for (let i = count - 1; i >= 0; i--) {
    const raw = levels[levels.length - 1 - i] ?? 0
    // Peak with decay: a frame holds briefly so voice sounds continuous.
    const value = Math.max(Math.min(1, raw * 10), previous * 0.86)
    previous = value
    const barHeight = Math.max(3, Math.min(cssHeight, Math.round(value * cssHeight)))
    context.fillStyle =
      value > 0.75 ? "#f04438" : value > 0.45 ? "#f5b83d" : value > 0.08 ? "#51cf66" : "rgba(160,160,160,0.5)"
    context.fillRect(i * (barWidth + gap), (cssHeight - barHeight) / 2, barWidth, barHeight)
  }
}

function positionOverlay(): void {
  const overlay = state.overlay
  const anchor = state.anchor
  if (!overlay || !anchor) return
  const rect = anchor.getBoundingClientRect()
  const width = Math.max(240, Math.min(760, rect.width))
  overlay.style.left = `${Math.round(Math.max(8, rect.left + (rect.width - width) / 2))}px`
  overlay.style.top = `${Math.round(Math.max(8, rect.top - 68))}px`
  overlay.style.width = `${width}px`
}

function closeOverlay(): void {
  stopTimer()
  if (state.overlay) {
    state.overlay.remove()
    state.overlay = null
  }
  levels.length = 0
}

function openOverlay(ctx: Context): void {
  closeOverlay()
  const overlay = document.createElement("div")
  overlay.className = OVERLAY_CLASS
  overlay.setAttribute("role", "dialog")
  overlay.setAttribute("aria-label", "Recording voice input")
  overlay.innerHTML = `
    <button type="button" class="nakamura-voice-overlay-button nakamura-voice-overlay-cancel" aria-label="Discard recording">✕</button>
    <canvas class="nakamura-voice-wave"></canvas>
    <span class="nakamura-voice-time">00:00</span>
    <span class="nakamura-voice-status" aria-hidden="true">
      <span class="nakamura-voice-eq"><i></i><i></i><i></i><i></i></span>
    </span>
    <button type="button" class="nakamura-voice-overlay-button nakamura-voice-overlay-done" aria-label="Stop and transcribe">✓</button>`
  const cancel = overlay.querySelector(".nakamura-voice-overlay-cancel") as HTMLButtonElement
  const done = overlay.querySelector(".nakamura-voice-overlay-done") as HTMLButtonElement
  cancel.addEventListener("click", () => cancelDictation(ctx))
  done.addEventListener("click", () => void toggleDictation(ctx))
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelDictation(ctx)
  })
  document.body.appendChild(overlay)
  state.overlay = overlay
  positionOverlay()
  requestAnimationFrame(() => overlay.classList.add(`${OVERLAY_CLASS}-open`))
  startTimer()
  cancel.focus()
}

async function startDictation(ctx: Context): Promise<void> {
  if (state.recorder || starting) return
  const anchor = document.querySelector(ACTIONS_SELECTOR) as HTMLElement | null
  if (!anchor) {
    ctx.toast.show({ title: "Composer not found", variant: "error" })
    return
  }
  starting = true
  const recorder = new Recorder()
  let quietStreak = 0
  try {
    await recorder.start((level) => {
      drawWave(level)
      // Animated equalizer turns green while voice reaches the microphone.
      const hearing = level > 0.035
      if (hearing) {
        quietStreak = 0
        setLive(true)
      } else if (quietStreak++ > 12) {
        setLive(false)
      }
    })
  } catch (error) {
    ctx.toast.show({
      title: `Could not open the microphone: ${error instanceof Error ? error.message : String(error)}`,
      variant: "error",
    })
    return
  } finally {
    starting = false
  }
  state.recorder = recorder
  state.anchor = anchor
  state.startedAt = performance.now()
  openOverlay(ctx)
  updateMicButtons()
}

async function finishDictation(ctx: Context): Promise<void> {
  const recorder = state.recorder
  if (!recorder || finishing) return
  finishing = true
  state.recorder = null
  state.anchor = null
  updateMicButtons()
  setBusy()
  const time = state.overlay?.querySelector(".nakamura-voice-time") as HTMLElement | null
  if (time) time.style.opacity = "0.5"
  try {
    const result = await recorder.stop()
    const screen = ctx.screen.current()
    if (!screen) {
      ctx.toast.show({ title: "No session is on screen", variant: "error" })
      return
    }
    const { text } = await transcribeRpc(ctx, toBase64(result.audio), result.format)
    if (!text.trim()) {
      ctx.toast.show({ title: "Didn't catch anything — try again" })
      return
    }
    screen.composer.insert(text)
    screen.composer.focus()
  } catch (error) {
    ctx.toast.show({
      title: `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
      variant: "error",
    })
  } finally {
    finishing = false
    closeOverlay()
    updateMicButtons()
  }
}

/** True while a dictation is being recorded (overlay open). */
export function dictationActive(): boolean {
  return isRecording()
}

/** Discards an ongoing recording. Used by the overlay and the global Esc. */
export function discardDictation(ctx: Context): void {
  cancelDictation(ctx)
}

function cancelDictation(ctx: Context): void {
  if (finishing) return
  if (state.recorder) state.recorder.cancel()
  state.recorder = null
  state.anchor = null
  closeOverlay()
  updateMicButtons()
  ctx.toast.show({ title: "Recording discarded" })
}

/** Starts or stops dictation. Wired to the mic button, the pill and the command. */
export async function toggleDictation(ctx: Context): Promise<void> {
  if (starting || finishing) return
  if (isRecording()) {
    await finishDictation(ctx)
    return
  }
  await startDictation(ctx)
}

/** Injects the mic button into every composer and keeps it there. */
export function installComposerButton(ctx: Context): () => void {
  const scan = (): void => {
    const actions = document.querySelectorAll(ACTIONS_SELECTOR)
    let found = false
    actions.forEach((element) => {
      if (!(element instanceof HTMLElement)) return
      found = true
      if (element.querySelector(`.${BUTTON_CLASS}`)) return
      const button = document.createElement("button")
      button.type = "button"
      button.className = BUTTON_CLASS
      button.title = "Dictate"
      button.setAttribute("aria-label", "Dictate")
      button.innerHTML = MIC
      button.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        void toggleDictation(ctx)
      })
      element.appendChild(button)
    })
    setReady(found)
  }

  if (!document.body) return () => undefined

  const observer = new MutationObserver(scan)
  observer.observe(document.body, { childList: true, subtree: true })
  scan()

  const reposition = (): void => positionOverlay()
  window.addEventListener("resize", reposition)
  window.addEventListener("scroll", reposition, { passive: true })

  return () => {
    observer.disconnect()
    window.removeEventListener("resize", reposition)
    window.removeEventListener("scroll", reposition)
    if (state.recorder) state.recorder.cancel()
    state.recorder = null
    closeOverlay()
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((element) => element.remove())
    setReady(false)
  }
}
