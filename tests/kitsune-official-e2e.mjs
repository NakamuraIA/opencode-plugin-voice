// End-to-end: plugin (openai engine) -> local Kitsune official server.
// Requires `server.py` running on 127.0.0.1:8092.
import { synthesize } from "../src/tts.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { writeFileSync } from "node:fs";

const tts = {
  ...DEFAULT_SETTINGS.tts,
  engine: "openai",
  apiUrl: "http://127.0.0.1:8092",
  apiModel: "kitsune",
  apiVoice: "frieren",
  apiInstructions: "",
};

const audio = await synthesize("Ola! Teste do plugin com a Kitsune oficial.", tts);
const isWav = audio[0] === 0x52 && audio[1] === 0x49 && audio[2] === 0x46 && audio[3] === 0x46;
console.log(`${isWav ? "PASS" : "FAIL"} wav ${audio.length} bytes`);
writeFileSync(new URL("./out/kitsune-official.wav", import.meta.url), audio);
