// Smoke test for the server-side parts of opencode-plugin-voice.
// Run (from the plugin root): node --experimental-strip-types tests/smoke.mjs
import { listVoices, synthesize } from "../src/tts.ts";
import { listOpenRouterModels, GROQ_MODELS } from "../src/stt.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings.ts";
import { lastAssistantText } from "../src/service.ts";
import { writeFileSync } from "node:fs";

let fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fail++;
};

// settings
const s = normalizeSettings({});
check("settings defaults", s.stt.provider === "openrouter" && s.tts.voice === "pt-BR-FranciscaNeural");
const partial = normalizeSettings({ stt: { temperature: 0.2 } });
check("settings merge", partial.stt.temperature === 0.2 && partial.stt.provider === "openrouter");

// lastAssistantText extraction
const msgs = [
  { id: "1", type: "user", content: [{ type: "text", text: "hi" }] },
  { id: "2", type: "assistant", content: [{ type: "reasoning", text: "thinking" }, { type: "text", text: "hello" }] },
  { id: "3", type: "assistant", content: [{ type: "tool", text: "call" }] },
];
const last = lastAssistantText(msgs);
check("lastAssistantText picks newest with text", last?.messageID === "2" && last.text === "hello");
check("lastAssistantText empty", lastAssistantText([]) === undefined);

// TTS: voices + speak (needs network)
try {
  const voices = await listVoices();
  check("edge voices listed", Array.isArray(voices) && voices.length > 50, `${voices.length} voices`);
  check("pt-BR voices present", voices.some((v) => v.locale.startsWith("pt-BR")));
  const audio = await synthesize("Ola! Teste rapido do plugin de voz.", { ...DEFAULT_SETTINGS.tts, engine: "edge" });
  writeFileSync(new URL("./out/smoke-tts.mp3", import.meta.url), audio);
  const isMp3 = (audio[0] === 0x49 && audio[1] === 0x44) || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
  check("edge tts mp3", audio.length > 1000 && isMp3, `${audio.length} bytes`);
} catch (e) {
  check("edge tts", false, String(e).slice(0, 160));
}

// Default TTS engine (zero-config: Edge -> MP3)
try {
  const audio = await synthesize("Teste do motor padrao.", DEFAULT_SETTINGS.tts);
  const isMp3 = (audio[0] === 0x49 && audio[1] === 0x44) || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
  const isWav = audio[0] === 0x52 && audio[1] === 0x49 && audio[2] === 0x46 && audio[3] === 0x46;
  const ok = DEFAULT_SETTINGS.tts.engine === "edge" ? isMp3 : isWav;
  check(`default engine ${DEFAULT_SETTINGS.tts.engine}`, audio.length > 1000 && ok, `${audio.length} bytes`);
  writeFileSync(new URL(`./out/smoke-tts-default.${isWav ? "wav" : "mp3"}`, import.meta.url), audio);
} catch (e) {
  check("default engine", false, String(e).slice(0, 160));
}

// Fallback: kitsune offline must still speak through Edge
try {
  const audio = await synthesize("Teste de fallback.", {
    ...DEFAULT_SETTINGS.tts,
    engine: "kitsune",
    kitsuneUrl: "http://127.0.0.1:9",
    kitsuneScript: "",
  });
  const isMp3 = (audio[0] === 0x49 && audio[1] === 0x44) || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
  check("kitsune offline falls back to edge", audio.length > 1000 && isMp3, `${audio.length} bytes`);
} catch (e) {
  check("kitsune fallback", false, String(e).slice(0, 160));
}

// Optional: local Kitsune server on 8091 (custom Nyra/Hana)
try {
  const wav = await synthesize("Teste do motor local Kitsune.", { ...DEFAULT_SETTINGS.tts, engine: "kitsune" });
  const isWav = wav[0] === 0x52 && wav[1] === 0x49 && wav[2] === 0x46 && wav[3] === 0x46;
  check("kitsune local wav", wav.length > 1000 && isWav, `${wav.length} bytes`);
  writeFileSync(new URL("./out/smoke-tts-kitsune.wav", import.meta.url), wav);
} catch (e) {
  console.log(`SKIP  kitsune local (server not running): ${String(e).slice(0, 120)}`);
}

// models
try {
  const or = await listOpenRouterModels();
  check("openrouter stt models", or.length >= 20, `${or.length} models`);
  check("openrouter has whisper turbo", or.some((m) => m.id === "openai/whisper-large-v3-turbo"));
} catch (e) {
  check("openrouter models", false, String(e).slice(0, 160));
}
check("groq static models", GROQ_MODELS.length === 2);

process.exit(fail ? 1 : 0);
