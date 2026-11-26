/**
 * PHP's md5() (hex), and hash_hmac( 'md5' ) for WordPress's wp_hash() (the
 * garden-invite tokens are stored that way).
 */
export const md5 = (input: string): string => md5Bytes(new TextEncoder().encode(input));

/** md5 of raw bytes, as hex. */
export function md5Bytes(msg: Uint8Array): string {
  const len = msg.length;
  const words = new Uint32Array(((len + 8) >>> 6) + 1 << 4);
  for (let i = 0; i < len; i++) words[i >> 2] |= msg[i] << ((i % 4) * 8);
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  words[words.length - 2] = (len * 8) >>> 0;
  words[words.length - 1] = Math.floor((len * 8) / 0x100000000);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < words.length; off += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const s = S[(i >> 4) * 4 + (i % 4)];
      const t = (a + f + K[i] + words[off + g]) >>> 0;
      a = d; d = c; c = b;
      b = (b + ((t << s) | (t >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map((w) => [0, 8, 16, 24].map((s) => ((w >>> s) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}

const hexBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
/** hash_hmac( 'md5', $data, $key ) */
export function hmacMd5(data: string, key: string): string {
  let k = new TextEncoder().encode(key);
  if (k.length > 64) k = hexBytes(md5Bytes(k));
  const pad = (b: number) => { const o = new Uint8Array(64); o.fill(b); k.forEach((x, i) => { o[i] = x ^ b; }); return o; };
  const d = new TextEncoder().encode(data);
  const inner = new Uint8Array(64 + d.length); inner.set(pad(0x36)); inner.set(d, 64);
  const ih = hexBytes(md5Bytes(inner));
  const outer = new Uint8Array(64 + 16); outer.set(pad(0x5c)); outer.set(ih, 64);
  return md5Bytes(outer);
}
