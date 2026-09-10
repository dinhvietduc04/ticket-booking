import { readFile, mkdir, writeFile } from "node:fs/promises";

const sources = JSON.parse(
  await readFile(new URL("./demo-images.json", import.meta.url), "utf8"),
);
const directory = new URL("../apps/web/public/images/demo/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, source] of Object.entries(sources)) {
  const response = await fetch(`${source}?fit=crop&w=1440&h=900&q=80&fm=jpg`, {
    signal: AbortSignal.timeout(30000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/")
  ) {
    throw new Error(`Image download failed: ${name} (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.length < 10000) {
    throw new Error(`Invalid JPEG for ${name}`);
  }
  await writeFile(new URL(`${name}.jpg`, directory), buffer);
  console.log(`${name}.jpg: ${Math.round(buffer.length / 1024)} KB`);
}
