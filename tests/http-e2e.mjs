// Prepares one continuous stream and measures first-byte latency.
import { OpenCode } from "@opencode/client";
import { Voice } from "../src/rpc.ts";

const password = process.argv[2];
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4097", headers: { Authorization: auth } });

const sentence = "Esta é uma frase de teste com acentuação, vírgulas e algum comprimento para simular uma resposta real. ";
const text = sentence.repeat(18);
const prepared = await client.rpc(Voice).speakPrepare({ text });
console.log(`prepare -> id=${prepared.id} url=${prepared.url}`);

const started = Date.now();
const response = await fetch(prepared.url);
console.log(`status=${response.status} type=${response.headers.get("content-type")} acao=${response.headers.get("access-control-allow-origin")}`);
if (!response.body) throw new Error("no body");
let total = 0;
let first = 0;
const reader = response.body.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  if (!first) {
    first = Date.now() - started;
    console.log(`first bytes after ${first}ms (${value.length} bytes)`);
  }
  total += value.length;
}
console.log(`stream total=${total} bytes in ${Date.now() - started}ms`);
