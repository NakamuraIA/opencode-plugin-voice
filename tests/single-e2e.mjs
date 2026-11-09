// Single continuous synthesis: the whole reply in one Edge TTS request.
import { synthesize, cleanForSpeech } from "../src/tts.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";

const sentence = "Esta é uma frase de teste com acentuação, vírgulas e algum comprimento para simular uma resposta real do assistente. ";
const text = sentence.repeat(60); // ~7.2k chars
const clean = cleanForSpeech(text);
console.log(`input=${text.length} chars, cleaned=${clean.length} chars`);
const started = Date.now();
const audio = await synthesize(text, DEFAULT_SETTINGS.tts);
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`audio=${audio.length} bytes (${(audio.length / 1024 / 1024).toFixed(2)} MB), b64=${Math.ceil(audio.length / 3) * 4} chars, took ${seconds}s`);
