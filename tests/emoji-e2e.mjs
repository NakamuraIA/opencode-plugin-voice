import { OpenCode } from "@opencode/client";
import { Voice } from "../src/rpc.ts";
import { cleanForSpeech } from "../src/tts.ts";

const password = process.argv[2];
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4097", headers: { Authorization: auth } });

const chunk =
  "Splitter (10/10 PASS): nenhuma palavra perdida ✅ texto de 2.910 chars = 10 trechos ✅ parágrafo → trecho ✅ frase gigante fatiada sem perder nada ✅ markdown limpo ✅";

for (const [label, text] of [
  ["raw", chunk],
  ["cleaned", cleanForSpeech(chunk)],
  ["no emoji", chunk.replace(/\p{Extended_Pictographic}/gu, " ")],
  ["no marks", chunk.replace(/[✅✔✓→←↑↓]/g, " ")],
]) {
  try {
    const result = await client.rpc(Voice).speakChunk({ text });
    console.log(`PASS ${label}: ${result.audioBase64.length} b64`);
  } catch (error) {
    console.log(`FAIL ${label}: ${JSON.stringify(error)}`);
  }
}
