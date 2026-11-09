import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const sentence = "Esta é uma frase de teste com acentuação e algum comprimento para simular uma resposta real. ";

async function run(label, repeats) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const engine = new MsEdgeTTS();
    try {
      await engine.setMetadata("pt-BR-ThalitaMultilingualNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const text = sentence.repeat(repeats);
      const started = Date.now();
      const { audioStream } = engine.toStream(text, { rate: 1 });
      let total = 0, first = 0, count = 0;
      for await (const chunk of audioStream) {
        if (!chunk) continue;
        count++;
        total += chunk.length;
        if (!first) {
          first = Date.now() - started;
          console.log(`${label} attempt ${attempt}: first=${first}ms (${chunk.length} bytes)`);
        }
      }
      console.log(`${label} attempt ${attempt}: total=${Date.now() - started}ms chunks=${count} size=${total}`);
      engine.close();
      return;
    } catch (error) {
      console.log(`${label} attempt ${attempt}: FAIL ${error instanceof Error ? error.message : String(error)}`);
      engine.close();
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

await run("MP3 2k", 18);
await run("MP3 4k", 36);
