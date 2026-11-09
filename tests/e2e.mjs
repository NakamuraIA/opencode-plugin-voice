// End-to-end: talks to the `opencode serve` instance on :4097 through the
// official @opencode/client, calling the plugin RPC like the GUI would.
import { OpenCode } from "@opencode/client";
import { Voice } from "../src/rpc.ts";

const password = process.argv[2];
if (!password) {
  console.error("usage: npx tsx e2e.mjs <server-password>");
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
const client = OpenCode.make({
  baseUrl: "http://127.0.0.1:4097",
  headers: { Authorization: auth },
});

let fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fail++;
};

try {
  const settings = await client.rpc(Voice).getSettings({});
  check("rpc getSettings", !!settings?.stt && !!settings?.tts, JSON.stringify(settings).slice(0, 120));
} catch (e) {
  check("rpc getSettings", false, String(e).slice(0, 200));
}

try {
  const voices = await client.rpc(Voice).listVoices({});
  check("rpc listVoices", Array.isArray(voices?.voices) && voices.voices.length > 50, `${voices?.voices?.length} voices`);
} catch (e) {
  check("rpc listVoices", false, String(e).slice(0, 200));
}

try {
  const spoken = await client.rpc(Voice).speak({ text: "Ola! Teste de leitura em voz alta do plugin." });
  const len = spoken?.audioBase64?.length ?? 0;
  check("rpc speak", len > 1000, `b64len=${len} voice=${spoken?.voice}`);
} catch (e) {
  check("rpc speak", false, String(e).slice(0, 300));
}

const longText = Array.from({ length: 30 }, (_, i) => `Frase numero ${i + 1} para testar o planejamento.`).join(" ");
let plan;
try {
  plan = await client.rpc(Voice).speakPlan({ text: longText });
  check(
    "rpc speakPlan splits without cap",
    Array.isArray(plan?.chunks) && plan.chunks.length > 3 && plan.chunks.join(" ").length > 1000,
    `${plan?.chunks?.length} chunks, ${plan?.chunks?.join(" ").length} chars`,
  );
  check("rpc speakPlan no chunk too big", plan.chunks.every((chunk) => chunk.length <= 340), `max=${Math.max(...plan.chunks.map((c) => c.length))}`);
} catch (e) {
  check("rpc speakPlan", false, String(e).slice(0, 300));
}

try {
  const first = await client.rpc(Voice).speakChunk({ text: "Primeira frase do teste de streaming." });
  check("rpc speakChunk", (first?.audioBase64?.length ?? 0) > 1000 && first?.mimeType === "audio/mpeg", `b64len=${first?.audioBase64?.length}`);
  const again = await client.rpc(Voice).speakChunk({ text: "Primeira frase do teste de streaming." });
  check("rpc speakChunk cache", again?.audioBase64 === first?.audioBase64);
} catch (e) {
  check("rpc speakChunk", false, String(e).slice(0, 300));
}

try {
  await client.rpc(Voice).lastAssistantText({ sessionID: "does-not-exist" });
  check("rpc lastAssistantText not_found", false, "should have thrown");
} catch (e) {
  const msg = JSON.stringify(e).slice(0, 200);
  check("rpc lastAssistantText not_found", msg.includes("not_found") || msg.includes("No assistant"), msg);
}

process.exit(fail ? 1 : 0);
