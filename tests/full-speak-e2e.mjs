import { OpenCode } from "@opencode/client";
import { Voice } from "../src/rpc.ts";

const password = process.argv[2];
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4097", headers: { Authorization: auth } });

const sentence = "Esta é uma frase de teste com acentuação, vírgulas e algum comprimento para simular uma resposta real do assistente. ";
for (const repeats of [10, 20, 30]) {
  const text = sentence.repeat(repeats);
  const started = Date.now();
  try {
    const result = await client.rpc(Voice).speak({ text });
    const ms = Date.now() - started;
    console.log(`${text.length} chars -> ${result.audioBase64.length} b64 (${(result.audioBase64.length / 1024 / 1024).toFixed(2)} MB) in ${(ms / 1000).toFixed(1)}s`);
  } catch (error) {
    console.log(`${text.length} chars -> FAIL ${JSON.stringify(error)}`);
  }
}
