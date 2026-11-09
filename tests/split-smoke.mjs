// Splitter checks: nothing is lost, long replies are chunked, no 1800 cap.
import { splitForSpeech, cleanForSpeech } from "../src/tts.ts";

let fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fail++;
};

const short = "Olá! Tudo bem? Vamos testar.";
const shortChunks = splitForSpeech(short);
check("short text is one chunk", shortChunks.length === 1, JSON.stringify(shortChunks));

const long = Array.from({ length: 40 }, (_, i) => `Esta é a frase número ${i + 1} de um texto bem longo para testar o fatiamento.`).join(" ");
const longChunks = splitForSpeech(long);
check("long text is split", longChunks.length >= 8, `${longChunks.length} chunks`);
check("every chunk is small", longChunks.every((chunk) => chunk.length <= 340), `max=${Math.max(...longChunks.map((c) => c.length))}`);
check("no 1800 cap", longChunks.join(" ").length > 1800, `${longChunks.join(" ").length} chars total`);

const normalize = (text) => text.replace(/\s+/g, " ").trim();
check("no words lost", normalize(longChunks.join(" ")) === normalize(cleanForSpeech(long)));

const paragraphs = "Primeiro parágrafo com uma frase.\n\nSegundo parágrafo com outra frase.\n\nTerceiro.";
const parsed = splitForSpeech(paragraphs);
check("paragraphs become separate chunks", parsed.length === 3, JSON.stringify(parsed));

const giant = "palavra ".repeat(200).trim();
const giantChunks = splitForSpeech(giant);
check("giant sentence is hard-split", giantChunks.length > 2, `${giantChunks.length} chunks`);
check("giant sentence keeps all words", normalize(giantChunks.join(" ")) === normalize(giant));

const markdown = "## Título\n\n**Negrito** e `código`.\n\n```js\nconsole.log('x')\n```\n\nFim.";
const mdChunks = splitForSpeech(markdown);
check("markdown is cleaned", mdChunks.every((chunk) => !chunk.includes("```") && !chunk.includes("**")), JSON.stringify(mdChunks));
check("code block becomes words", mdChunks.some((chunk) => chunk.includes("code block")));

const table = "| Recurso | Status |\n|---|---|\n| **Sem limite** | ✅ |\n| Streaming | ✅ |\n\nTexto depois da tabela.";
const tableChunks = splitForSpeech(table);
check("table rows are dropped", tableChunks.length === 1 && !tableChunks[0].includes("|"), JSON.stringify(tableChunks));

const heading = "## O que entrou\n\nParágrafo normal.";
const headingChunks = splitForSpeech(heading);
check("heading marker is dropped", headingChunks[0] === "O que entrou", JSON.stringify(headingChunks));

const empty = splitForSpeech("   \n\n  ");
check("empty text yields no chunks", empty.length === 0);

process.exit(fail ? 1 : 0);
