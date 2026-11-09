# Tests & probes

Manual scripts, kept out of the plugin root. They run against the real
services (Edge TTS, OpenCode) and are not part of `npm run build`.

Run from the plugin root:

```powershell
node --experimental-strip-types tests/split-smoke.mjs   # pure function check
node --experimental-strip-types tests/mp3-probe.mjs     # Edge TTS sanity
npx --yes tsx tests/smoke.mjs                           # crosses runtime imports
```

Scripts that pull runtime imports from `src/` (which uses bundler-style
extensionless specifiers) need `tsx`; plain `node` only resolves the pure ones.

| Script | What it checks |
|---|---|
| `split-smoke.mjs` | `splitForSpeech` / `cleanForSpeech` (no network) |
| `single-e2e.mjs` | one synthesis through `src/tts.ts` |
| `mp3-probe.mjs` | Edge TTS returns a valid MP3 |
| `stream-probe.mjs` | Edge TTS streaming chunks |
| `webm-e2e.mjs` | Edge TTS WebM output |
| `smoke.mjs` | settings, STT model lists, Edge TTS — writes `tests/out/smoke-tts.mp3` |
| `kitsune-official-e2e.mjs` | plugin → local Kitsune official server on `127.0.0.1:8092` |
| `chunk-e2e.mjs` | chunking through the plugin RPC |
| `emoji-e2e.mjs` | emoji cleaning + speech |
| `markdown-e2e.mjs` | markdown cleaning + speech |
| `full-speak-e2e.mjs` | full read-aloud flow |
| `http-e2e.mjs` | synthesized audio served over HTTP |
| `e2e.mjs` | base RPC end-to-end |

The `*-e2e.mjs` scripts talk to a running OpenCode service and take the service
password as the first argument:

```powershell
node --experimental-strip-types tests/e2e.mjs <service-password>
```
