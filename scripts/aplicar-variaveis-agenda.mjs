import { gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const partNames = [
  "part1.txt",
  "part2.txt",
  "part3.txt",
  "part4a.txt",
  "part4b.txt",
  "part4c.txt",
  "part5a.txt",
  "part5b.txt",
  "part5c.txt",
  "part6.txt",
];
const parts = partNames.map((name) =>
  path.join(process.cwd(), "scripts", "agenda-variaveis-payload", name)
);
const encoded = (await Promise.all(parts.map((file) => readFile(file, "utf8")))).join("");
const files = JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));

for (const [relativePath, base64Content] of Object.entries(files)) {
  const target = path.join(process.cwd(), relativePath);
  const content = Buffer.from(base64Content, "base64");
  let current = null;
  try {
    current = await readFile(target);
  } catch {}
  if (current?.equals(content)) continue;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  console.log(`Variáveis da agenda aplicadas em ${relativePath}.`);
}
