// Exercises every chunk of a long reply through the real RPC, sequentially,
// like the GUI player does.
import { OpenCode } from "@opencode/client";
import { Voice } from "../src/rpc.ts";
import { splitForSpeech } from "../src/tts.ts";

const password = process.argv[2];
if (!password) {
  console.error("usage: npx tsx chunk-e2e.mjs <server-password>");
  process.exit(2);
}
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4097", headers: { Authorization: auth } });

const long = Array.from(
  { length: 40 },
  (_, i) => `Esta é a frase número ${i + 1}, com acentuação, vírgulas e pontuação para testar o áudio.`,
).join(" ");
const plan = await client.rpc(Voice).speakPlan({ text: long });
console.log(`chunks: ${plan.chunks.length}`);
let bytes = 0;
for (let i = 0; i < plan.chunks.length; i++) {
  const chunk = plan.chunks[i];
  try {
    const result = await client.rpc(Voice).speakChunk({ text: chunk });
    bytes += result.audioBase64.length;
    console.log(`PASS chunk ${i} (${chunk.length} chars) -> ${result.audioBase64.length} b64, ${result.mimeType}`);
  } catch (error) {
    console.log(`FAIL chunk ${i} (${chunk.length} chars): ${JSON.stringify(error)}`);
    process.exit(1);
  }
}
console.log(`all chunks ok, total b64 = ${bytes}`);
