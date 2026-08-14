/**
 * A minimal PNG encoder for solid-colour squares.
 *
 * Only used to mint the roster's colour pips (see pips.ts). PNG's IDAT is
 * zlib-wrapped deflate, which is exactly what CompressionStream produces, so a
 * picture this simple needs no image library — and keeping it here, free of
 * Discord imports, keeps it testable.
 */

// Emoji render at a fixed size in the client, so this only needs to be large
// enough not to look soft. A solid square this size compresses to a few hundred
// bytes, far under Discord's 256KB limit.
const SIZE = 32;

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

/** A solid square of `hex`, as the data URI Discord's emoji upload wants. */
export const solidSquare = async (hex: string): Promise<string> => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  // Raw scanlines: each row is a filter byte (0, none) followed by RGB triples.
  const raw = new Uint8Array(SIZE * (1 + SIZE * 3));
  for (let y = 0; y < SIZE; y++) {
    const row = y * (1 + SIZE * 3);
    for (let x = 0; x < SIZE; x++) {
      const pixel = row + 1 + x * 3;
      raw[pixel] = r;
      raw[pixel + 1] = g;
      raw[pixel + 2] = b;
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, SIZE);
  view.setUint32(4, SIZE);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour

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
