// Same flow as the player, using the exact kind of Markdown the reply has.
import { OpenCode } from "@opencode/client";
import { Voice } from "../src/rpc.ts";

const password = process.argv[2];
if (!password) {
  console.error("usage: npx tsx markdown-e2e.mjs <server-password>");
  process.exit(2);
}
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4097", headers: { Authorization: auth } });

const text = `🎉 Feito! Fases 1 + 2 implementadas e testadas no servidor.

## O que entrou

| Recurso | Status |
|---|---|
| **Sem limite de caracteres** | ✅ truncateForSpeech removido — resposta inteira é lida |
| **Divisão em frases/parágrafos** | ✅ splitForSpeech (máx ~320 chars por trecho, sem perder palavra) |
| **Streaming de verdade** | ✅ Começa a falar no 1º trecho enquanto sintetiza os próximos |
| **Player flutuante estilo ChatGPT** | ✅ play/pause, waveform do áudio real, 00:12 / 02:40, X |
| **Pause/retomada exata** | ✅ AudioContext.suspend()/resume() |
| **Cache de trechos** | ✅ Repetir a mesma fala é instantâneo (LRU 24 MB) |

## Testes executados

**Splitter (10/10 PASS):**
- nenhuma palavra perdida ✅
- texto de 2.910 chars = 10 trechos ✅
- parágrafo → trecho ✅
- frase gigante fatiada sem perder nada ✅
- markdown limpo ✅

**Typecheck limpo** ✅ · **Bundle 37.5 kB** ✅

⚠️ Único ponto não testado visualmente: o player na janela real. Se algo ficar torto, manda print. 🚀`;

const plan = await client.rpc(Voice).speakPlan({ text });
console.log(`chunks: ${plan.chunks.length}`);
for (let i = 0; i < plan.chunks.length; i++) {
  const chunk = plan.chunks[i];
  console.log(`--- chunk ${i}: ${JSON.stringify(chunk.slice(0, 80))}${chunk.length > 80 ? "…" : ""} (${chunk.length})`);
  try {
    const result = await client.rpc(Voice).speakChunk({ text: chunk });
    console.log(`PASS -> ${result.audioBase64.length} b64`);
  } catch (error) {
    console.log(`FAIL -> ${JSON.stringify(error)}`);
    process.exit(1);
  }
}
console.log("all markdown chunks ok");
