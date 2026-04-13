import { readFileSync } from "node:fs";
import { ChmArchive } from "../src/renderer/src/ebook/chm/chmArchive";

const p = process.argv[2];
if (!p) {
  console.error("usage: npx tsx scripts/probe-chm.ts <file.chm>");
  process.exit(1);
}
const buf = readFileSync(p);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const chm = new ChmArchive(ab);
const names = chm.files.map((f) => f.name.replace(/\\/g, "/"));
const htmlish = names.filter((n) => /\.(html?|xhtml)$/i.test(n) && !n.startsWith("::"));
console.log("total entries", chm.files.length);
console.log("html/htm/xhtml", htmlish.length);
console.log("sample", htmlish.slice(0, 30));
const pick =
  chm.files.find((f) => /index|default|start|cover/i.test(f.name.replace(/\\/g, "/"))) ??
  chm.files.find((f) => htmlish.includes(f.name.replace(/\\/g, "/")));
if (pick) {
  const b = chm.readFile(pick);
  const s = Buffer.from(b.slice(0, 2800)).toString("latin1");
  console.log("\n--- head of", pick.name, "---\n" + s);
}
