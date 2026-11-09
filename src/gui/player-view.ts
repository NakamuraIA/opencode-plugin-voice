import type { Context } from "@opencode/plugin/gui"
import {
  playerActive,
  playerBars,
  playerElapsed,
  playerError,
  playerPhase,
  playerPumping,
  playerTotal,
  stop,
  togglePause,
} from "./player"

// Floating player bar above the composer, ChatGPT style: play/pause, the
// waveform built from the decoded audio, elapsed time, and a stop button.

const PLAYER_CLASS = "nakamura-voice-player"

const ICON_PAUSE = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
const ICON_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5Z"/></svg>`
const ICON_RETRY = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
}

export function installPlayerView(ctx: Context): () => void {
  const root = document.createElement("div")
  root.className = PLAYER_CLASS
  root.setAttribute("role", "region")
  root.setAttribute("aria-label", "Read aloud player")
  root.innerHTML = `
    <button type="button" class="nakamura-voice-player-toggle" aria-label="Pause"></button>
    <canvas class="nakamura-voice-player-wave"></canvas>
    <span class="nakamura-voice-player-time">00:00</span>
    <button type="button" class="nakamura-voice-player-close" aria-label="Stop reading">✕</button>`
  document.body.appendChild(root)

  const toggle = root.querySelector(".nakamura-voice-player-toggle") as HTMLButtonElement
  const close = root.querySelector(".nakamura-voice-player-close") as HTMLButtonElement
  const time = root.querySelector(".nakamura-voice-player-time") as HTMLElement
  const canvas = root.querySelector("canvas") as HTMLCanvasElement

  toggle.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    togglePause()
  })
  close.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    stop()
  })

  let frame = 0
  let lastIcon = ""

  const position = (): void => {
    const anchor = document.querySelector('[data-slot="composer-actions"]') as HTMLElement | null
    if (!anchor) {
      root.style.left = "50%"
      root.style.transform = "translateX(-50%)"
      root.style.top = "auto"
      root.style.bottom = "96px"
      return
    }
    const rect = anchor.getBoundingClientRect()
    const width = Math.max(280, Math.min(760, rect.width))
    root.style.left = `${Math.round(Math.max(8, rect.left + (rect.width - width) / 2))}px`
    root.style.top = `${Math.round(Math.max(8, rect.top - 68))}px`
    root.style.width = `${width}px`
    root.style.bottom = "auto"
    root.style.transform = "none"
  }

  const draw = (phase: string): void => {
    const dpr = window.devicePixelRatio || 1
    const cssWidth = canvas.clientWidth || 320
    const cssHeight = canvas.clientHeight || 32
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
    }
    const paint = canvas.getContext("2d")
    if (!paint) return
    paint.setTransform(dpr, 0, 0, dpr, 0, 0)
    paint.clearRect(0, 0, cssWidth, cssHeight)

    if (phase === "planning") {
      const radius = Math.min(cssHeight, 14) / 2
      const angle = (performance.now() / 700) * Math.PI * 2
      paint.strokeStyle = "rgba(180,180,180,0.35)"
      paint.lineWidth = 2
      paint.beginPath()
      paint.arc(cssWidth / 2, cssHeight / 2, radius, 0, Math.PI * 2)
      paint.stroke()
      paint.strokeStyle = "#e8e8e8"
      paint.beginPath()
      paint.arc(cssWidth / 2, cssHeight / 2, radius, angle, angle + Math.PI * 0.7)
      paint.stroke()
      return
    }

    const bars = playerBars()
    if (!bars.length) {
      paint.fillStyle = "rgba(150,150,150,0.35)"
      paint.fillRect(0, cssHeight / 2 - 1, cssWidth, 2)
      return
    }
    const elapsed = playerElapsed()
    const step = cssWidth / bars.length
    const barWidth = Math.max(1, Math.min(4, step - 1))
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]!
      const height = Math.max(2, bar.value * cssHeight)
      const played = bar.end <= elapsed
      paint.fillStyle = played ? "#e8e8e8" : "rgba(150,150,150,0.42)"
      paint.fillRect(i * step, (cssHeight - height) / 2, barWidth, height)
    }
  }

  const tick = (): void => {
    if (!playerActive()) {
      root.classList.remove(`${PLAYER_CLASS}-open`)
      if (lastIcon !== "") {
        lastIcon = ""
        toggle.innerHTML = ""
      }
      frame = requestAnimationFrame(tick)
      return
    }

    root.classList.add(`${PLAYER_CLASS}-open`)
    position()

    const phase = playerPhase()
    const icon = phase === "paused" ? ICON_PLAY : phase === "error" ? ICON_RETRY : ICON_PAUSE
    if (icon !== lastIcon) {
      lastIcon = icon
      toggle.innerHTML = icon
    }
    toggle.setAttribute("aria-label", phase === "paused" ? "Resume" : phase === "error" ? "Try again" : "Pause")
    toggle.title = phase === "error" ? playerError() : phase === "paused" ? "Resume" : "Pause"
    toggle.disabled = phase === "planning"
    root.classList.toggle(`${PLAYER_CLASS}-error`, phase === "error")

    const known = playerTotal()
    time.textContent =
      playerPumping() || known === null ? formatTime(playerElapsed()) : `${formatTime(playerElapsed())} / ${formatTime(known)}`

    draw(phase)
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(frame)
    root.remove()
  }
}
