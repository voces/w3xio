import { assert, assertEquals } from "@std/assert";
import { solidSquare } from "./png.ts";

const decode = (dataUri: string) => {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const chunks = (png: Uint8Array) => {
  const view = new DataView(png.buffer);
  const found: { type: string; data: Uint8Array }[] = [];
  let i = 8;
  while (i < png.length) {
    const length = view.getUint32(i);
    found.push({
      type: new TextDecoder().decode(png.subarray(i + 4, i + 8)),
      data: png.subarray(i + 8, i + 8 + length),
    });
    i += 12 + length;
  }
  return found;
};

Deno.test("solidSquare: emits a data URI Discord will accept", async () => {
  const uri = await solidSquare("#1CE6B9");
  assert(uri.startsWith("data:image/png;base64,"));
  // Discord caps emoji uploads at 256KB.
  assert(decode(uri).length < 256 * 1024);
});

Deno.test("solidSquare: writes a well-formed 32x32 truecolour PNG", async () => {
  const png = decode(await solidSquare("#1CE6B9"));
  assertEquals(
    [...png.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );

  const found = chunks(png);
  assertEquals(found.map((c) => c.type), ["IHDR", "IDAT", "IEND"]);

  const header = new DataView(found[0].data.buffer, found[0].data.byteOffset);
  assertEquals(header.getUint32(0), 32, "width");
  assertEquals(header.getUint32(4), 32, "height");
  assertEquals(found[0].data[8], 8, "bit depth");
  assertEquals(found[0].data[9], 2, "colour type: truecolour");
});

Deno.test("solidSquare: every pixel is the colour asked for", async () => {
  const png = decode(await solidSquare("#1CE6B9"));
  const idat = chunks(png).find((c) => c.type === "IDAT")!;
  const raw = new Uint8Array(
    await new Response(
      new Blob([idat.data.slice()]).stream().pipeThrough(
        new DecompressionStream("deflate"),
      ),
    ).arrayBuffer(),
  );

  const stride = 1 + 32 * 3;
  assertEquals(raw.length, 32 * stride);
  const pixels = new Set<string>();
  for (let y = 0; y < 32; y++) {
    assertEquals(raw[y * stride], 0, "scanline filter: none");
    for (let x = 0; x < 32; x++) {
      const p = y * stride + 1 + x * 3;
      pixels.add(`${raw[p]},${raw[p + 1]},${raw[p + 2]}`);
    }
  }
  assertEquals([...pixels], ["28,230,185"]);
});
