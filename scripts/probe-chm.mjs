import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { ChmArchive } = await import(
  pathToFileURL(new URL("../src/renderer/src/ebook/chm/chmArchive.ts", import.meta.url)).href
);

const p = process.argv[2];
if (!p) {
  console.error("usage: node scripts/probe-chm.mjs <file.chm>");
  process.exit(1);
}
const buf = readFileSync(p);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const chm = new ChmArchive(ab);
const names = chm.files.map((f) => f.name.replace(/\\/g, "/"));
const htmlish = names.filter((n) => /\.(html?|xhtml)$/i.test(n) && !n.startsWith("::"));
console.log("total entries", chm.files.length);
console.log("html/htm/xhtml", htmlish.length);
console.log("sample", htmlish.slice(0, 25));
const idx = htmlish.find((n) => /index|default|cover|start/i.test(n));
const first = idx ? chm.files.find((f) => f.name.replace(/\\/g, "/") === idx) : chm.files.find((f) => htmlish.includes(f.name.replace(/\\/g, "/")));
const pick = first || chm.files.find((f) => htmlish.includes(f.name.replace(/\\/g, "/")));
if (pick) {
  const b = chm.readFile(pick);
  const s = Buffer.from(b.slice(0, 2500)).toString("latin1");
  console.log("\n--- head of", pick.name, "---\n", s);
}
