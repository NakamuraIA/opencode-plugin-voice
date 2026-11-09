import {
  Plugin,
  Command,
  Slot,
  SettingsPage,
  ComposerPill,
  Style,
  createKeyed,
  usePlugin,
  type Context,
  type MountedSession,
} from "@opencode/plugin/gui"
import { Show, onCleanup } from "solid-js"
import { lastAssistantText as fetchLastAssistantText } from "./gui/client"
import { installComposerButton, toggleDictation, composerReady, dictationActive, discardDictation } from "./gui/composer-button"
import { loadSettings, readSettings, saveSettings, setHostContext } from "./gui/settings-store"
import { installPlayerView } from "./gui/player-view"
import { play, playerActive, playerPhase, stop, stopIfSessionChanged, togglePause } from "./gui/player"
import { VoiceSettingsPage } from "./gui/settings-page"
import css from "./gui.css?inline"

const spokenIds = new Set<string>()

async function readLast(ctx: Context, sessionID: string): Promise<void> {
  if (playerActive()) {
    stop()
    return
  }
  try {
    const found = await fetchLastAssistantText(ctx, sessionID)
    await play(ctx, found.text)
  } catch {
    ctx.toast.show({ title: "No assistant reply to read yet", variant: "error" })
  }
}

async function onIdle(ctx: Context, sessionID: string): Promise<void> {
  if (!readSettings().tts.autoSpeak) return
  const current = ctx.sessions.current()
  if (current && current.id !== sessionID) return
  if (playerActive()) return
  try {
    const found = await fetchLastAssistantText(ctx, sessionID)
    if (spokenIds.has(found.messageID)) return
    spokenIds.add(found.messageID)
    if (spokenIds.size > 200) spokenIds.clear()
    await play(ctx, found.text)
  } catch {
    // nothing to read yet
  }
}

function HeaderButton(props: { session: MountedSession }) {
  const ctx = usePlugin()
  const ui = ctx.ui
  return (
    <ui.Tooltip value={ctx.t("header.read")}>
      <ui.IconButton
        icon={playerActive() ? "stop" : "outline-wave-audio"}
        label={ctx.t("header.read")}
        busy={playerPhase() === "planning"}
        onClick={() => void readLast(ctx, props.session.id)}
      />
    </ui.Tooltip>
  )
}

export default Plugin.define({
  i18n: {
    en: {
      "command.dictate": "Dictate a message",
      "command.read-aloud": "Read the last reply aloud",
      "command.pause-resume": "Pause or resume read-aloud",
      "command.toggle-autospeak": "Toggle auto read-aloud",
      "header.read": "Read the last reply aloud",
      "settings.title": "Voice",
      "settings.description":
        "Dictation (STT) and read-aloud (TTS) for the composer and session replies.",
      "pill.dictate": "Dictate",
    },
  },
  setup(ctx) {
    setHostContext(ctx)
    void loadSettings(ctx)

    const uninstallMic = installComposerButton(ctx)
    onCleanup(uninstallMic)
    const uninstallPlayer = installPlayerView(ctx)
    onCleanup(uninstallPlayer)

    // Auto read-aloud when the routed session goes idle.
    createKeyed(
      () => ctx.servers.get("sidecar")?.data,
      (data) =>
        onCleanup(
          data.on("session.idle", (event) => {
            void onIdle(ctx, event.data.sessionID)
          }),
        ),
    )

    // Stop reading when the user moves to another session.
    createKeyed(
      () => ctx.sessions.current()?.key,
      (key) => stopIfSessionChanged(key),
    )

    ctx.add(Command, () => ({
      id: "dictate",
      title: ctx.t("command.dictate"),
      bind: "mod+shift+d",
      run: () => void toggleDictation(ctx),
    }))
    ctx.add(Command, () => ({
      id: "read-aloud",
      title: ctx.t("command.read-aloud"),
      run: () => {
        const session = ctx.sessions.current()
        if (session) void readLast(ctx, session.id)
      },
    }))
    ctx.add(Command, () => ({
      id: "pause-resume",
      title: ctx.t("command.pause-resume"),
      run: () => togglePause(),
    }))
    ctx.add(Command, () => ({
      id: "toggle-autospeak",
      title: ctx.t("command.toggle-autospeak"),
      run: () => {
        const next = readSettings()
        void saveSettings(ctx, { ...next, tts: { ...next.tts, autoSpeak: !next.tts.autoSpeak } })
      },
    }))

    ctx.add(Slot, {
      at: "session.header",
      order: 20,
      render: (input) => (
        <Show when={input.active}>
          <HeaderButton session={input.session} />
        </Show>
      ),
    })

    // Only shows while the in-composer button could not be injected.
    ctx.add(ComposerPill, {
      id: "dictate-fallback",
      show: () => {
        if (composerReady()) return undefined
        return {
          label: ctx.t("pill.dictate"),
          icon: "outline-wave-audio" as const,
          run: () => void toggleDictation(ctx),
        }
      },
    })

    ctx.add(SettingsPage, {
      id: "voice",
      title: ctx.t("settings.title"),
      icon: "outline-wave-audio",
      render: () => <VoiceSettingsPage />,
    })

    // Global Esc: cancel an ongoing recording, stop the player, or stop a
    // read-aloud. Dialogs and menus keep priority, so Escape there still
    // closes them first.
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      if (document.querySelector("dialog[open], [role='dialog']")) return
      if (dictationActive()) {
        event.preventDefault()
        discardDictation(ctx)
        return
      }
      if (playerActive()) {
        event.preventDefault()
        stop()
      }
    }
    document.addEventListener("keydown", onEscape)
    onCleanup(() => document.removeEventListener("keydown", onEscape))

    ctx.add(Style, css)
  },
})
