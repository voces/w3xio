import { assert, assertEquals } from "@std/assert";
import { colorPip } from "./png.ts";

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

const scanlines = async (png: Uint8Array) => {
  const idat = chunks(png).find((c) => c.type === "IDAT")!;
  return new Uint8Array(
    await new Response(
      new Blob([idat.data.slice()]).stream().pipeThrough(
        new DecompressionStream("deflate"),
      ),
    ).arrayBuffer(),
  );
};

Deno.test("colorPip: emits a data URI Discord will accept", async () => {
  const uri = await colorPip("#1CE6B9");
  assert(uri.startsWith("data:image/png;base64,"));
  // Discord caps emoji uploads at 256KB.
  assert(decode(uri).length < 256 * 1024);
});

Deno.test("colorPip: writes a well-formed square RGBA PNG", async () => {
  const png = decode(await colorPip("#1CE6B9"));
  assertEquals([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const found = chunks(png);
  assertEquals(found.map((c) => c.type), ["IHDR", "IDAT", "IEND"]);

  const header = new DataView(found[0].data.buffer, found[0].data.byteOffset);
  const size = header.getUint32(0);
  assertEquals(header.getUint32(4), size, "square");
  assertEquals(found[0].data[8], 8, "bit depth");
  assertEquals(found[0].data[9], 6, "colour type: truecolour with alpha");
});

Deno.test("colorPip: centres an opaque pip on a transparent frame", async () => {
  const png = decode(await colorPip("#1CE6B9"));
  const size = new DataView(png.buffer).getUint32(16);
  const raw = await scanlines(png);
  const stride = 1 + size * 4;
  assertEquals(raw.length, size * stride);

  const opaque: { x: number; y: number }[] = [];
  for (let y = 0; y < size; y++) {
    assertEquals(raw[y * stride], 0, "scanline filter: none");
    for (let x = 0; x < size; x++) {
      const p = y * stride + 1 + x * 4;
      if (raw[p + 3] === 0) continue;
      assertEquals(
        [raw[p], raw[p + 1], raw[p + 2], raw[p + 3]],
        [28, 230, 185, 255],
        `pixel ${x},${y}`,
      );
      opaque.push({ x, y });
    }
  }

  const xs = opaque.map((p) => p.x);
  const ys = opaque.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  assertEquals(right - left, bottom - top, "pip is square");
  assertEquals(left, size - 1 - right, "centred horizontally");
  assertEquals(top, size - 1 - bottom, "centred vertically");
  assert(left > 0, "the frame leaves room around the pip");
  // Roughly wc3stats' proportions: a pip a little over half the frame.
  const ratio = (right - left + 1) / size;
  assert(ratio > 0.5 && ratio < 0.7, `pip covers ${ratio} of the frame`);
});
