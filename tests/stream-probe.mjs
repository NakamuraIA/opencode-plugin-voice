import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const sentence = "Esta é uma frase de teste com acentuação e algum comprimento para simular uma resposta real. ";

async function run(label, format, repeats) {
  const engine = new MsEdgeTTS();
  try {
    await engine.setMetadata("pt-BR-ThalitaMultilingualNeural", format);
    const text = sentence.repeat(repeats);
    const started = Date.now();
    const { audioStream } = engine.toStream(text, { rate: 1 });
    let total = 0;
    let first = 0;
    let count = 0;
    for await (const chunk of audioStream) {
      if (!chunk) continue;
      count++;
      total += chunk.length;
      if (!first) first = Date.now() - started;
    }
    console.log(`${label}: first=${first}ms total=${Date.now() - started}ms chunks=${count} size=${total}`);
  } catch (error) {
    console.log(`${label}: FAIL ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    engine.close();
  }
}

await run("MP3 7k", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, 60);
await run("WebM 2k", OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, 18);
await run("WebM 4k", OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS, 36);
