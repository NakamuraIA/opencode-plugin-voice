// Checks that one Edge TTS request can stream WebM/Opus progressively.
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const engine = new MsEdgeTTS();
await engine.setMetadata("pt-BR-ThalitaMultilingualNeural", OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
const sentence = "Esta é uma frase de teste com acentuação e algum comprimento para simular uma resposta real. ";
const text = sentence.repeat(60);
const started = Date.now();
const { audioStream } = engine.toStream(text, { rate: 1 });
let total = 0;
let first = 0;
let count = 0;
for await (const chunk of audioStream) {
  if (!chunk) continue;
  count++;
  total += chunk.length;
  if (!first) {
    first = Date.now() - started;
    const head = Buffer.from(chunk).subarray(0, 4).toString("hex");
    console.log(`first chunk after ${first}ms, ${chunk.length} bytes, head=${head}`);
  }
  if (count <= 5) console.log(`chunk ${count}: ${chunk.length} bytes at ${Date.now() - started}ms`);
}
console.log(`total ${count} chunks, ${(total / 1024 / 1024).toFixed(2)} MB, took ${Date.now() - started}ms`);
engine.close();
