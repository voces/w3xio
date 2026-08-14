/**
 * A minimal PNG encoder for the roster's colour pips (see pips.ts).
 *
 * PNG's IDAT is zlib-wrapped deflate, which is exactly what CompressionStream
 * produces, so a picture this simple needs no image library — and keeping it
 * here, free of Discord imports, keeps it testable.
 */

// A pip centred on a transparent frame, as wc3stats draws them, rather than a
// square bled to the edges: Discord renders emoji in a fixed box, so a
// full-bleed square lands as a heavy block against the name while an inset one
// reads as a dot. The canvas is larger than wc3stats' 51px so it stays crisp
// when a client renders emoji at 2x; only the ratio between the two matters to
// how it looks.
const SIZE = 128;
const PIP = 78;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = /* @__PURE__ */ (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};

// PNG's IDAT is zlib-wrapped deflate, which is exactly what CompressionStream
// produces — no image library needed for a picture this simple.
const deflate = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  const compressed = new Blob([data]).stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
};

const base64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** A pip of `hex`, as the data URI Discord's emoji upload wants. */
export const colorPip = async (hex: string): Promise<string> => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const inset = Math.round((SIZE - PIP) / 2);

  // Raw scanlines: each row is a filter byte (0, none) followed by RGBA
  // quadruples. Everything outside the pip is left fully transparent.
  const stride = 1 + SIZE * 4;
  const raw = new Uint8Array(SIZE * stride);
  for (let y = inset; y < inset + PIP; y++) {
    const row = y * stride;
    for (let x = inset; x < inset + PIP; x++) {
      const pixel = row + 1 + x * 4;
      raw[pixel] = r;
      raw[pixel + 1] = g;
      raw[pixel + 2] = b;
      raw[pixel + 3] = 255;
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, SIZE);
  view.setUint32(4, SIZE);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha

  const parts = [
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }

  return `data:image/png;base64,${base64(png)}`;
};
