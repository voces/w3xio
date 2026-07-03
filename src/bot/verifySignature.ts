import nacl from "tweetnacl";

const hexToUint8Array = (hex: string) =>
  new Uint8Array(hex.match(/.{1,2}/g)!.map((val) => parseInt(val, 16)));

export const verifySignature = async (
  request: Request,
): Promise<{ valid: boolean; body: string }> => {
  const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;
  const signature = request.headers.get("X-Signature-Ed25519")!;
  const timestamp = request.headers.get("X-Signature-Timestamp")!;
  const body = await request.text();
  const valid = nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + body),
    hexToUint8Array(signature),
    hexToUint8Array(PUBLIC_KEY),
  );

  return { valid, body };
};
